import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { parseIsoDate } from "./sp-api-shadow-evidence-day.js";
import { validateEvidenceBundle } from "./sp-api-shadow-evidence-validation.js";
import {
  validateShadowPackageCsvs,
  type ShadowPackageReconciliationExpectation,
} from "./sp-api-shadow-package-csv.js";
import {
  containsCredentialLikeText,
  SHADOW_PACKAGE_FORBIDDEN_EXTENSIONS,
  SHADOW_PACKAGE_REQUIRED_FILES,
  SHADOW_PACKAGE_REQUIRED_PREFLIGHT_CHECKS,
  SHADOW_PACKAGE_REQUIRED_PREFLIGHT_SCOPE_FIELDS,
  SHADOW_PACKAGE_REQUIRED_STORAGE_THRESHOLDS,
  SHADOW_PACKAGE_SENSITIVE_KEY_PATTERN,
  SHADOW_PACKAGE_SIGNED_MARKER_PATTERN,
  SHADOW_PACKAGE_SIGNOFF_ROLES,
  SHADOW_PACKAGE_UNSIGNED_MARKER_PATTERN,
  SHADOW_PACKAGE_TEXT_EXTENSIONS,
} from "./sp-api-shadow-package-policy.js";
import type {
  ShadowEvidencePackageIssue,
  ShadowEvidencePackageResult,
} from "./verify-sp-api-shadow-package-types.js";

export function verifyShadowEvidencePackage(packagePath: string): ShadowEvidencePackageResult {
  const root = resolve(packagePath);
  const issues: ShadowEvidencePackageIssue[] = [];
  if (!existsSync(root)) {
    return { ok: false, packagePath: root, files: [], checksumFiles: 0, evidence: null, issues: [{ path: root, message: "package directory does not exist" }] };
  }

  const files = listFiles(root, issues);
  for (const required of SHADOW_PACKAGE_REQUIRED_FILES) {
    if (!files.includes(required)) issues.push({ path: required, message: "required evidence package file is missing" });
  }
  for (const file of files) {
    if (SHADOW_PACKAGE_FORBIDDEN_EXTENSIONS.has(extname(file).toLowerCase())) {
      issues.push({ path: file, message: "raw database, credential, key, or environment file is forbidden" });
    }
    scanTextFile(root, file, issues);
  }
  validateSignoff(root, files, issues);

  const preflight = readJson(root, "preflight.json", issues);
  validatePreflight(preflight, issues);
  const evidenceInput = readJson(root, "evidence.json", issues);
  const evidence = evidenceInput === undefined
    ? null
    : validateEvidenceBundle(evidenceInput, { allowExample: false, requireAllPass: true });
  if (evidence && !evidence.ok) {
    for (const issue of evidence.issues) {
      issues.push({ path: `evidence.json${issue.path}`, message: issue.message });
    }
  }
  validatePreflightScopeAgainstEvidence(preflight, evidenceInput, issues);
  const expectedCurrency = isRecord(evidenceInput) && typeof evidenceInput.currency === "string"
    ? evidenceInput.currency
    : null;
  const expectedSourceId = isRecord(preflight) && isRecord(preflight.scope) && typeof preflight.scope.sourceId === "string"
    ? preflight.scope.sourceId
    : null;
  validateShadowPackageCsvs(root, files, {
    expectedDates: expectedEvidenceDates(evidence?.window.start, evidence?.window.end),
    expectedCurrency,
    expectedSourceId,
    expectedReconciliation: expectedReconciliationRows(evidenceInput),
  }, issues);

  const checksumFiles = validateChecksums(root, files, issues);
  return {
    ok: issues.length === 0,
    packagePath: root,
    files,
    checksumFiles,
    evidence,
    issues,
  };
}

function listFiles(root: string, issues: ShadowEvidencePackageIssue[]): string[] {
  const files: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const relativePath = toPackagePath(relative(root, absolute));
      if (entry.isSymbolicLink()) {
        issues.push({ path: relativePath, message: "symbolic links are forbidden in an evidence package" });
      } else if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        issues.push({ path: relativePath, message: "unsupported filesystem entry" });
      }
    }
  }
  try {
    visit(root);
  } catch (error) {
    issues.push({ path: root, message: error instanceof Error ? error.message : String(error) });
  }
  return files.sort();
}

function readJson(root: string, file: string, issues: ShadowEvidencePackageIssue[]): unknown | undefined {
  if (!existsSync(join(root, file))) return undefined;
  try {
    return JSON.parse(readFileSync(join(root, file), "utf8")) as unknown;
  } catch (error) {
    issues.push({ path: file, message: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

function validatePreflight(input: unknown, issues: ShadowEvidencePackageIssue[]): void {
  scanSensitiveValue(input, "preflight.json", issues);
  if (!isRecord(input)) {
    issues.push({ path: "preflight.json", message: "preflight must be a JSON object" });
    return;
  }
  if (input.schemaVersion !== 1) issues.push({ path: "preflight.json.schemaVersion", message: "expected schemaVersion 1" });
  if (input.ok !== true) issues.push({ path: "preflight.json.ok", message: "preflight must have ok=true" });
  if (!isRecord(input.backup) || typeof input.backup.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(input.backup.sha256)) {
    issues.push({ path: "preflight.json.backup", message: "verified backup with a SHA-256 is required" });
  }
  if (!isRecord(input.userData) || typeof input.userData.shadowPath !== "string" || typeof input.userData.productionPath !== "string") {
    issues.push({ path: "preflight.json.userData", message: "shadow and production userData paths are required" });
  }
  if (!isRecord(input.scope)) {
    issues.push({ path: "preflight.json.scope", message: "preflight scope metadata is required" });
  } else {
    for (const field of SHADOW_PACKAGE_REQUIRED_PREFLIGHT_SCOPE_FIELDS) {
      if (typeof input.scope[field] !== "string" || input.scope[field].trim() === "") {
        issues.push({ path: `preflight.json.scope.${field}`, message: "must be a non-empty string" });
      }
    }
  }
  const checks = input.checks;
  if (!Array.isArray(checks)) {
    issues.push({ path: "preflight.json.checks", message: "preflight checks must be an array" });
    return;
  }
  const checkMap = new Map<string, boolean>();
  for (const check of checks) {
    if (!isRecord(check) || typeof check.name !== "string" || typeof check.ok !== "boolean") {
      issues.push({ path: "preflight.json.checks", message: "each check needs name and boolean ok" });
      continue;
    }
    checkMap.set(check.name, check.ok);
    if (!check.ok) issues.push({ path: `preflight.json.checks.${check.name}`, message: "all preflight checks must pass" });
  }
  for (const name of SHADOW_PACKAGE_REQUIRED_PREFLIGHT_CHECKS) {
    if (!checkMap.has(name)) issues.push({ path: `preflight.json.checks.${name}`, message: "required safety check is missing" });
  }
  validateStorageEvidence(input.storage, issues);
}

function validateStorageEvidence(storage: unknown, issues: ShadowEvidencePackageIssue[]): void {
  if (!isRecord(storage)) {
    issues.push({ path: "preflight.json.storage", message: "SQLite storage snapshot and thresholds are required" });
    return;
  }
  if (!isRecord(storage.snapshot)) {
    issues.push({ path: "preflight.json.storage.snapshot", message: "SQLite storage snapshot is required" });
  }
  if (!isRecord(storage.health) || storage.health.ok !== true) {
    issues.push({ path: "preflight.json.storage.health", message: "SQLite storage health must be ok" });
  }
  if (!isRecord(storage.thresholds)) {
    issues.push({ path: "preflight.json.storage.thresholds", message: "SQLite storage thresholds are required" });
    return;
  }
  for (const field of SHADOW_PACKAGE_REQUIRED_STORAGE_THRESHOLDS) {
    const value = storage.thresholds[field];
    if (field === "requireWal" ? value !== true : !isFiniteNonNegativeNumber(value)) {
      issues.push({ path: `preflight.json.storage.thresholds.${field}`, message: field === "requireWal" ? "must be true" : "must be a non-negative finite number" });
    }
  }
}

function validateChecksums(
  root: string,
  files: string[],
  issues: ShadowEvidencePackageIssue[],
): number {
  const checksumPath = join(root, "checksums.txt");
  if (!existsSync(checksumPath)) return 0;
  const expected = new Map<string, string>();
  const lines = readFileSync(checksumPath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    const match = /^([a-f0-9]{64})\s+(.+)$/.exec(line);
    if (!match) {
      issues.push({ path: `checksums.txt:${index + 1}`, message: "expected '<sha256>  <relative-posix-path>'" });
      continue;
    }
    const file = match[2].trim();
    if (!isSafePackagePath(file) || file === "checksums.txt") {
      issues.push({ path: `checksums.txt:${index + 1}`, message: "checksum path must be a safe relative path and cannot reference checksums.txt" });
      continue;
    }
    if (expected.has(file)) {
      issues.push({ path: `checksums.txt:${index + 1}`, message: "duplicate checksum path" });
      continue;
    }
    expected.set(file, match[1].toLowerCase());
  }
  const actualFiles = files.filter((file) => file !== "checksums.txt");
  for (const file of actualFiles) {
    const expectedHash = expected.get(file);
    if (!expectedHash) {
      issues.push({ path: file, message: "file is not covered by checksums.txt" });
      continue;
    }
    const actualHash = createHash("sha256").update(readFileSync(join(root, file))).digest("hex");
    if (actualHash !== expectedHash) issues.push({ path: file, message: "SHA-256 does not match checksums.txt" });
  }
  for (const file of expected.keys()) {
    if (!actualFiles.includes(file)) issues.push({ path: `checksums.txt:${file}`, message: "checksum references a missing file" });
  }
  return expected.size;
}

function scanTextFile(root: string, file: string, issues: ShadowEvidencePackageIssue[]): void {
  if (!SHADOW_PACKAGE_TEXT_EXTENSIONS.has(extname(file).toLowerCase())) return;
  try {
    const value = readFileSync(join(root, file), "utf8");
    if (containsCredentialLikeText(value)) {
      issues.push({ path: file, message: "credential-like value is forbidden in evidence package" });
    }
  } catch (error) {
    issues.push({ path: file, message: error instanceof Error ? error.message : String(error) });
  }
}

function validateSignoff(root: string, files: string[], issues: ShadowEvidencePackageIssue[]): void {
  if (!files.includes("signoff.md")) return;
  let content: string;
  try {
    content = readFileSync(join(root, "signoff.md"), "utf8");
  } catch (error) {
    issues.push({ path: "signoff.md", message: error instanceof Error ? error.message : String(error) });
    return;
  }
  const lines = content.split(/\r?\n/);
  for (const role of SHADOW_PACKAGE_SIGNOFF_ROLES) {
    const line = lines.find((candidate) => role.pattern.test(candidate));
    if (!line) {
      issues.push({ path: "signoff.md", message: `${role.name} signature is required` });
      continue;
    }
    if (SHADOW_PACKAGE_UNSIGNED_MARKER_PATTERN.test(line) || !SHADOW_PACKAGE_SIGNED_MARKER_PATTERN.test(line)) {
      issues.push({ path: "signoff.md", message: `${role.name} signature must be explicitly signed or approved` });
    }
  }
}

function expectedEvidenceDates(start: string | null | undefined, end: string | null | undefined): string[] {
  const startDate = parseIsoDate(start ?? undefined);
  const endDate = parseIsoDate(end ?? undefined);
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  for (const cursor = new Date(startDate); cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function expectedReconciliationRows(input: unknown): ReadonlyMap<string, ShadowPackageReconciliationExpectation> {
  const rows = new Map<string, ShadowPackageReconciliationExpectation>();
  if (!isRecord(input) || !Array.isArray(input.days)) return rows;
  for (const day of input.days) {
    if (!isRecord(day) || typeof day.businessDate !== "string" || !isRecord(day.sales)) continue;
    const storeDailyAmountMinor = safeNonNegativeInteger(day.sales.storeDailyAmountMinor);
    const skuAmountMinor = safeNonNegativeInteger(day.sales.skuAmountMinor);
    const unmappedAmountMinor = safeNonNegativeInteger(day.sales.unmappedAmountMinor);
    const orders = safeNonNegativeInteger(day.sales.orders);
    const units = safeNonNegativeInteger(day.sales.units);
    if (storeDailyAmountMinor === null || skuAmountMinor === null || unmappedAmountMinor === null || orders === null || units === null) continue;
    rows.set(day.businessDate, {
      storeDailyAmountMinor,
      skuAmountMinor,
      unmappedAmountMinor,
      orders,
      units,
      status: typeof day.status === "string" ? day.status : "",
    });
  }
  return rows;
}

function safeNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validatePreflightScopeAgainstEvidence(
  preflight: unknown,
  evidence: unknown,
  issues: ShadowEvidencePackageIssue[],
): void {
  if (!isRecord(preflight) || !isRecord(preflight.scope) || !isRecord(evidence)) return;
  const fields = [
    "evidenceBundleId",
    "organizationId",
    "commerceStoreId",
    "marketplace",
    "currency",
    "businessTimezone",
    "windowStart",
    "windowEnd",
  ] as const;
  for (const field of fields) {
    if (typeof preflight.scope[field] === "string" && typeof evidence[field] === "string" && preflight.scope[field] !== evidence[field]) {
      issues.push({ path: `preflight.json.scope.${field}`, message: `must match evidence.json.${field}` });
    }
  }
  const scopedSourceId = preflight.scope.sourceId;
  if (typeof scopedSourceId === "string" && Array.isArray(evidence.days)) {
    const evidenceSourceIds = new Set<string>();
    for (const day of evidence.days) {
      if (!isRecord(day)) continue;
      for (const domain of ["sales", "fba"] as const) {
        const summary = day[domain];
        if (isRecord(summary) && typeof summary.sourceId === "string") evidenceSourceIds.add(summary.sourceId);
      }
    }
    if (evidenceSourceIds.size > 0 && (evidenceSourceIds.size !== 1 || !evidenceSourceIds.has(scopedSourceId))) {
      issues.push({ path: "preflight.json.scope.sourceId", message: "must match evidence.json.days[*].sourceId" });
    }
  }
}

function scanSensitiveValue(value: unknown, path: string, issues: ShadowEvidencePackageIssue[]): void {
  if (typeof value === "string") {
    if (containsCredentialLikeText(value)) issues.push({ path, message: "credential-like value is forbidden" });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitiveValue(item, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (SHADOW_PACKAGE_SENSITIVE_KEY_PATTERN.test(key)) issues.push({ path: `${path}.${key}`, message: "credential-like field is forbidden" });
    scanSensitiveValue(nested, `${path}.${key}`, issues);
  }
}

function isSafePackagePath(value: string): boolean {
  return value.length > 0
    && !value.includes("\\")
    && !value.startsWith("/")
    && !/^[A-Za-z]:/.test(value)
    && !value.split("/").includes("..");
}

function toPackagePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
