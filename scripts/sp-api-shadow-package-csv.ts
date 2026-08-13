import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ShadowEvidencePackageIssue } from "./verify-sp-api-shadow-package-types.js";

const RUN_LINEAGE_COLUMNS = [
  "businessDate",
  "domain",
  "sourceId",
  "syncRunId",
  "jobId",
  "checkpoint",
  "page",
  "status",
] as const;

const RECONCILIATION_COLUMNS = [
  "businessDate",
  "currency",
  "storeDailyAmountMinor",
  "skuAmountMinor",
  "unmappedAmountMinor",
  "orders",
  "units",
  "status",
] as const;

const REQUIRED_LINEAGE_DOMAINS = ["sales_traffic", "fba_inventory"] as const;
type LineageDomain = (typeof REQUIRED_LINEAGE_DOMAINS)[number];

export interface ShadowPackageReconciliationExpectation {
  storeDailyAmountMinor: number;
  skuAmountMinor: number;
  unmappedAmountMinor: number;
  orders: number;
  units: number;
  status: string;
}

export interface ShadowPackageCsvValidationContext {
  expectedDates: readonly string[];
  expectedCurrency: string | null;
  expectedSourceId: string | null;
  expectedReconciliation: ReadonlyMap<string, ShadowPackageReconciliationExpectation>;
}

export interface ShadowPackageCsvRow {
  [key: string]: string;
}

interface ParsedCsv {
  headers: string[];
  rows: ShadowPackageCsvRow[];
  issues: string[];
}

export function validateShadowPackageCsvs(
  root: string,
  files: readonly string[],
  context: ShadowPackageCsvValidationContext,
  issues: ShadowEvidencePackageIssue[],
): void {
  if (files.includes("run-lineage.csv")) {
    const parsed = readCsv(root, "run-lineage.csv", issues);
    if (parsed) validateRunLineage(parsed, context, issues);
  }
  if (files.includes("reconciliation.csv")) {
    const parsed = readCsv(root, "reconciliation.csv", issues);
    if (parsed) validateReconciliation(parsed, context, issues);
  }
}

function readCsv(root: string, file: string, issues: ShadowEvidencePackageIssue[]): ParsedCsv | null {
  let content: string;
  try {
    content = readFileSync(join(root, file), "utf8");
  } catch (error) {
    issues.push({ path: file, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
  const parsed = parseCsv(content);
  for (const message of parsed.issues) issues.push({ path: file, message });
  return parsed.issues.length > 0 ? null : parsed;
}

function validateRunLineage(
  parsed: ParsedCsv,
  context: ShadowPackageCsvValidationContext,
  issues: ShadowEvidencePackageIssue[],
): void {
  requireColumns(parsed, RUN_LINEAGE_COLUMNS, "run-lineage.csv", issues);
  if (!hasColumns(parsed, RUN_LINEAGE_COLUMNS)) return;
  const expectedDateSet = new Set(context.expectedDates);
  const successfulDomainsByDate = new Map<string, Set<LineageDomain>>();
  const minimumRows = context.expectedDates.length * REQUIRED_LINEAGE_DOMAINS.length;
  if (parsed.rows.length < minimumRows) {
    issues.push({ path: "run-lineage.csv", message: `must contain at least ${minimumRows} data rows` });
  }
  parsed.rows.forEach((row, index) => {
    const path = `run-lineage.csv:${index + 2}`;
    requireValue(row, "businessDate", path, issues);
    requireValue(row, "domain", path, issues);
    requireValue(row, "sourceId", path, issues);
    requireValue(row, "syncRunId", path, issues);
    requireValue(row, "jobId", path, issues);
    requireValue(row, "checkpoint", path, issues);
    requireValue(row, "status", path, issues);
    const page = parseNonNegativeInteger(row.page);
    if (page === undefined || page < 1) issues.push({ path: `${path}.page`, message: "must be a positive integer" });
    const businessDate = row.businessDate.trim();
    const domain = row.domain.trim();
    if (businessDate && !expectedDateSet.has(businessDate)) {
      issues.push({ path: `${path}.businessDate`, message: "must be within the evidence window" });
    }
    if (domain && !isLineageDomain(domain)) {
      issues.push({ path: `${path}.domain`, message: "must be sales_traffic or fba_inventory" });
    }
    if (context.expectedSourceId && row.sourceId.trim() !== context.expectedSourceId) {
      issues.push({ path: `${path}.sourceId`, message: "must match preflight scope.sourceId" });
    }
    if (businessDate && expectedDateSet.has(businessDate) && isLineageDomain(domain) && row.status.trim() === "success") {
      const domains = successfulDomainsByDate.get(businessDate) ?? new Set<LineageDomain>();
      domains.add(domain);
      successfulDomainsByDate.set(businessDate, domains);
    }
  });
  for (const date of context.expectedDates) {
    for (const domain of REQUIRED_LINEAGE_DOMAINS) {
      if (!successfulDomainsByDate.get(date)?.has(domain)) {
        issues.push({
          path: `run-lineage.csv.${date}.${domain}`,
          message: "must contain at least one successful lineage row",
        });
      }
    }
  }
}

function validateReconciliation(
  parsed: ParsedCsv,
  context: ShadowPackageCsvValidationContext,
  issues: ShadowEvidencePackageIssue[],
): void {
  requireColumns(parsed, RECONCILIATION_COLUMNS, "reconciliation.csv", issues);
  if (!hasColumns(parsed, RECONCILIATION_COLUMNS)) return;
  if (parsed.rows.length !== context.expectedDates.length) {
    issues.push({ path: "reconciliation.csv", message: `must contain exactly ${context.expectedDates.length} daily rows` });
  }
  const dates = new Set<string>();
  const expectedDateSet = new Set(context.expectedDates);
  parsed.rows.forEach((row, index) => {
    const path = `reconciliation.csv:${index + 2}`;
    requireValue(row, "businessDate", path, issues);
    requireValue(row, "currency", path, issues);
    requireValue(row, "status", path, issues);
    const amounts = ["storeDailyAmountMinor", "skuAmountMinor", "unmappedAmountMinor", "orders", "units"]
      .map((key) => [key, parseNonNegativeInteger(row[key])] as const);
    for (const [key, value] of amounts) {
      if (value === undefined) issues.push({ path: `${path}.${key}`, message: "must be a non-negative integer" });
    }
    const store = parseNonNegativeInteger(row.storeDailyAmountMinor);
    const sku = parseNonNegativeInteger(row.skuAmountMinor);
    const unmapped = parseNonNegativeInteger(row.unmappedAmountMinor);
    if (store !== undefined && sku !== undefined && unmapped !== undefined && store !== sku + unmapped) {
      issues.push({ path, message: "storeDailyAmountMinor must equal skuAmountMinor + unmappedAmountMinor" });
    }
    const businessDate = row.businessDate.trim();
    if (businessDate && !expectedDateSet.has(businessDate)) {
      issues.push({ path: `${path}.businessDate`, message: "must be within the evidence window" });
    }
    if (context.expectedCurrency && row.currency.toUpperCase() !== context.expectedCurrency.toUpperCase()) {
      issues.push({ path: `${path}.currency`, message: `must match evidence currency ${context.expectedCurrency}` });
    }
    if (row.status !== "pass") issues.push({ path: `${path}.status`, message: "must be pass for a release evidence package" });
    if (businessDate) {
      if (dates.has(businessDate)) issues.push({ path: `${path}.businessDate`, message: "businessDate must be unique" });
      dates.add(businessDate);
    }
    const expected = context.expectedReconciliation.get(businessDate);
    if (expected && store !== undefined && sku !== undefined && unmapped !== undefined) {
      const expectedValues: Array<[string, number | undefined, number]> = [
        ["storeDailyAmountMinor", store, expected.storeDailyAmountMinor],
        ["skuAmountMinor", sku, expected.skuAmountMinor],
        ["unmappedAmountMinor", unmapped, expected.unmappedAmountMinor],
        ["orders", parseNonNegativeInteger(row.orders), expected.orders],
        ["units", parseNonNegativeInteger(row.units), expected.units],
      ];
      for (const [key, actual, expectedValue] of expectedValues) {
        if (actual !== expectedValue) {
          issues.push({ path: `${path}.${key}`, message: "must match evidence.json daily sales summary" });
        }
      }
      if (row.status !== expected.status) {
        issues.push({ path: `${path}.status`, message: "must match evidence.json daily status" });
      }
    }
  });
  for (const date of context.expectedDates) {
    if (!dates.has(date)) issues.push({ path: "reconciliation.csv.businessDate", message: `missing evidence date ${date}` });
  }
}

function isLineageDomain(value: string): value is LineageDomain {
  return (REQUIRED_LINEAGE_DOMAINS as readonly string[]).includes(value);
}

function requireColumns(
  parsed: ParsedCsv,
  required: readonly string[],
  path: string,
  issues: ShadowEvidencePackageIssue[],
): void {
  for (const column of required) {
    if (!parsed.headers.includes(column)) issues.push({ path, message: `missing required column ${column}` });
  }
}

function hasColumns(parsed: ParsedCsv, required: readonly string[]): boolean {
  return required.every((column) => parsed.headers.includes(column));
}

function requireValue(row: ShadowPackageCsvRow, key: string, path: string, issues: ShadowEvidencePackageIssue[]): void {
  if (!row[key] || row[key].trim() === "") issues.push({ path: `${path}.${key}`, message: "must be a non-empty value" });
}

function parseNonNegativeInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseCsv(content: string): ParsedCsv {
  const records: string[][] = [];
  const issues: string[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"' && field.trim() === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value !== "")) records.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) issues.push("unterminated quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field.trim());
    if (row.some((value) => value !== "")) records.push(row);
  }
  if (records.length === 0) return { headers: [], rows: [], issues: ["must contain a header and at least one data row"] };
  const headers = records[0].map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value);
  if (headers.some((header) => header === "")) issues.push("header names must be non-empty");
  if (new Set(headers).size !== headers.length) issues.push("header names must be unique");
  const rows = records.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      issues.push(`row ${rowIndex + 2} must have exactly ${headers.length} columns`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  if (rows.length === 0) issues.push("must contain at least one data row");
  return { headers, rows, issues };
}
