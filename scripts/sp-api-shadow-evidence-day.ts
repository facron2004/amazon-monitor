export type EvidenceMode = "example" | "real";
export type DayStatus = "pass" | "delayed" | "failed" | "not-applicable";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidatedDay {
  businessDate: string | undefined;
  salesSourceId: string | undefined;
  fbaSourceId: string | undefined;
}

const DAY_KEYS = ["businessDate", "status", "externalReference", "sales", "fba", "mappingIssues"] as const;
const EXTERNAL_REFERENCE_KEYS = ["reportId", "downloadedAt", "sha256"] as const;
const SALES_KEYS = [
  "sourceId",
  "syncRunId",
  "storeDailyAmountMinor",
  "skuAmountMinor",
  "unmappedAmountMinor",
  "orders",
  "units",
  "factRows",
  "replayCreatedRecords",
  "replayUpdatedRecords",
] as const;
const FBA_KEYS = ["sourceId", "syncRunId", "snapshotRows", "latestRows", "asOfRows", "freshnessMinutes"] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function checkKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push({ path: `${path}.${key}`, message: "unknown field; do not put credentials or raw reports in evidence" });
    }
    if (/token|secret|password|authorization|api[-_]?key|cookie/i.test(key)) {
      issues.push({ path: `${path}.${key}`, message: "credential-like field is forbidden" });
    }
  }
}

export function requiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    issues.push({ path: `${path}.${key}`, message: "must be a non-empty string" });
    return undefined;
  }
  if (/^Bearer\s|(?:access|refresh)[-_]?token\s*=|client[-_]?secret\s*=/i.test(candidate)) {
    issues.push({ path: `${path}.${key}`, message: "credential-like value is forbidden" });
  }
  return candidate;
}

export function requiredInteger(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < 0) {
    issues.push({ path: `${path}.${key}`, message: "must be a non-negative safe integer" });
    return undefined;
  }
  return candidate;
}

export function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}

export function requiredObject(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> | undefined {
  const candidate = value[key];
  if (!isRecord(candidate)) {
    issues.push({ path: `${path}.${key}`, message: "must be an object" });
    return undefined;
  }
  return candidate;
}

export function requiredArray(value: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): unknown[] {
  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    issues.push({ path: `${path}.${key}`, message: "must be an array" });
    return [];
  }
  return candidate;
}

function checkSha256(value: string | undefined, path: string, mode: EvidenceMode | undefined, issues: ValidationIssue[]): void {
  if (mode === "example" && value === "redacted") return;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    issues.push({ path, message: "must be a lowercase/uppercase SHA-256 hex digest" });
  }
}

export function validateDay(
  value: unknown,
  index: number,
  mode: EvidenceMode | undefined,
  schemaVersion: number | undefined,
  issues: ValidationIssue[],
): ValidatedDay {
  const path = `days[${index}]`;
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return { businessDate: undefined, salesSourceId: undefined, fbaSourceId: undefined };
  }
  checkKnownKeys(value, DAY_KEYS, path, issues);
  const businessDate = requiredString(value, "businessDate", path, issues);
  if (businessDate && !parseIsoDate(businessDate)) {
    issues.push({ path: `${path}.businessDate`, message: "must be a valid YYYY-MM-DD date" });
  }
  const status = requiredString(value, "status", path, issues) as DayStatus | undefined;
  if (status && !["pass", "delayed", "failed", "not-applicable"].includes(status)) {
    issues.push({ path: `${path}.status`, message: "must be pass, delayed, failed, or not-applicable" });
  }

  const externalReference = requiredObject(value, "externalReference", path, issues);
  if (externalReference) {
    checkKnownKeys(externalReference, EXTERNAL_REFERENCE_KEYS, `${path}.externalReference`, issues);
    requiredString(externalReference, "reportId", `${path}.externalReference`, issues);
    const downloadedAt = requiredString(externalReference, "downloadedAt", `${path}.externalReference`, issues);
    if (downloadedAt && Number.isNaN(Date.parse(downloadedAt))) {
      issues.push({ path: `${path}.externalReference.downloadedAt`, message: "must be an ISO timestamp" });
    }
    const sha256 = requiredString(externalReference, "sha256", `${path}.externalReference`, issues);
    checkSha256(sha256, `${path}.externalReference.sha256`, mode, issues);
  }

  const sales = requiredObject(value, "sales", path, issues);
  let storeDailyAmountMinor: number | undefined;
  let skuAmountMinor: number | undefined;
  let unmappedAmountMinor: number | undefined;
  let replayCreatedRecords: number | undefined;
  let salesSourceId: string | undefined;
  if (sales) {
    checkKnownKeys(sales, SALES_KEYS, `${path}.sales`, issues);
    salesSourceId = requiredString(sales, "sourceId", `${path}.sales`, issues);
    requiredString(sales, "syncRunId", `${path}.sales`, issues);
    storeDailyAmountMinor = requiredInteger(sales, "storeDailyAmountMinor", `${path}.sales`, issues);
    skuAmountMinor = requiredInteger(sales, "skuAmountMinor", `${path}.sales`, issues);
    unmappedAmountMinor = requiredInteger(sales, "unmappedAmountMinor", `${path}.sales`, issues);
    requiredInteger(sales, "orders", `${path}.sales`, issues);
    requiredInteger(sales, "units", `${path}.sales`, issues);
    requiredInteger(sales, "factRows", `${path}.sales`, issues);
    replayCreatedRecords = requiredInteger(sales, "replayCreatedRecords", `${path}.sales`, issues);
    requiredInteger(sales, "replayUpdatedRecords", `${path}.sales`, issues);
  }

  const fba = requiredObject(value, "fba", path, issues);
  let freshnessMinutes: number | undefined;
  let fbaSourceId: string | undefined;
  if (fba) {
    checkKnownKeys(fba, FBA_KEYS, `${path}.fba`, issues);
    fbaSourceId = requiredString(fba, "sourceId", `${path}.fba`, issues);
    requiredString(fba, "syncRunId", `${path}.fba`, issues);
    const snapshotRows = requiredInteger(fba, "snapshotRows", `${path}.fba`, issues);
    const latestRows = requiredInteger(fba, "latestRows", `${path}.fba`, issues);
    const asOfRows = schemaVersion !== undefined && schemaVersion >= 2
      ? requiredInteger(fba, "asOfRows", `${path}.fba`, issues)
      : Object.hasOwn(fba, "asOfRows")
        ? requiredInteger(fba, "asOfRows", `${path}.fba`, issues)
        : undefined;
    if (schemaVersion !== undefined && schemaVersion < 2 && snapshotRows !== undefined && latestRows !== undefined && latestRows > snapshotRows) {
      issues.push({ path: `${path}.fba.latestRows`, message: "cannot exceed snapshotRows" });
    }
    if (asOfRows !== undefined && snapshotRows !== undefined && asOfRows > snapshotRows) {
      issues.push({ path: `${path}.fba.asOfRows`, message: "cannot exceed snapshotRows" });
    }
    freshnessMinutes = requiredInteger(fba, "freshnessMinutes", `${path}.fba`, issues);
  }

  const mappingIssues = requiredArray(value, "mappingIssues", path, issues);
  mappingIssues.forEach((item, mappingIndex) => {
    if (typeof item !== "string" || item.trim() === "") {
      issues.push({ path: `${path}.mappingIssues[${mappingIndex}]`, message: "must be a non-empty string" });
    }
  });

  if (status === "pass") {
    if (storeDailyAmountMinor !== undefined && skuAmountMinor !== undefined && unmappedAmountMinor !== undefined) {
      if (storeDailyAmountMinor !== skuAmountMinor + unmappedAmountMinor) {
        issues.push({ path: `${path}.sales`, message: "storeDailyAmountMinor must equal skuAmountMinor + unmappedAmountMinor" });
      }
      if (unmappedAmountMinor !== 0) {
        issues.push({ path: `${path}.sales.unmappedAmountMinor`, message: "must be zero for a passing day" });
      }
    }
    if (replayCreatedRecords !== undefined && replayCreatedRecords !== 0) {
      issues.push({ path: `${path}.sales.replayCreatedRecords`, message: "must be zero for an idempotent replay" });
    }
    if (mappingIssues.length > 0) {
      issues.push({ path: `${path}.mappingIssues`, message: "must be empty for a passing day" });
    }
    if (freshnessMinutes !== undefined && freshnessMinutes > 60) {
      issues.push({ path: `${path}.fba.freshnessMinutes`, message: "must be no more than 60 minutes for a passing day" });
    }
  }
  return { businessDate, salesSourceId, fbaSourceId };
}
