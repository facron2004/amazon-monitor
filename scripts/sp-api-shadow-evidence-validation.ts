import {
  checkKnownKeys,
  isRecord,
  parseIsoDate,
  requiredArray,
  requiredInteger,
  requiredString,
  validateDay,
  type EvidenceMode,
  type ValidationIssue,
} from "./sp-api-shadow-evidence-day.js";

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "evidenceMode",
  "evidenceBundleId",
  "organizationId",
  "commerceStoreId",
  "marketplace",
  "currency",
  "businessTimezone",
  "windowStart",
  "windowEnd",
  "days",
] as const;

export interface ShadowEvidenceValidation {
  ok: boolean;
  evidenceBundleId: string | null;
  evidenceMode: EvidenceMode | null;
  window: { start: string | null; end: string | null };
  dayCount: number;
  statuses: string[];
  issues: ValidationIssue[];
}

export interface ShadowEvidenceValidationOptions {
  allowExample?: boolean;
  requireAllPass?: boolean;
}

function expectedDates(start: string | undefined, end: string | undefined): string[] {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  for (const cursor = new Date(startDate); cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function checkTimezone(value: string | undefined, issues: ValidationIssue[]): void {
  if (!value) return;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    issues.push({ path: "$.businessTimezone", message: "must be a valid IANA timezone" });
  }
}

function emptyValidation(issues: ValidationIssue[]): ShadowEvidenceValidation {
  return {
    ok: false,
    evidenceBundleId: null,
    evidenceMode: null,
    window: { start: null, end: null },
    dayCount: 0,
    statuses: [],
    issues,
  };
}

export function validateEvidenceBundle(
  input: unknown,
  options: ShadowEvidenceValidationOptions = {},
): ShadowEvidenceValidation {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return emptyValidation([{ path: "$", message: "evidence bundle must be an object" }]);

  checkKnownKeys(input, TOP_LEVEL_KEYS, "$", issues);
  const schemaVersion = requiredInteger(input, "schemaVersion", "$", issues);
  if (schemaVersion !== undefined && ![1, 2].includes(schemaVersion)) {
    issues.push({ path: "$.schemaVersion", message: "unsupported schema version; expected 1 or 2" });
  }
  const evidenceMode = requiredString(input, "evidenceMode", "$", issues) as EvidenceMode | undefined;
  if (evidenceMode && !["example", "real"].includes(evidenceMode)) {
    issues.push({ path: "$.evidenceMode", message: "must be example or real" });
  }
  if (evidenceMode === "example" && !options.allowExample) {
    issues.push({ path: "$.evidenceMode", message: "example evidence requires --allow-example and cannot prove a real store run" });
  }

  const evidenceBundleId = requiredString(input, "evidenceBundleId", "$", issues);
  requiredString(input, "organizationId", "$", issues);
  requiredString(input, "commerceStoreId", "$", issues);
  requiredString(input, "marketplace", "$", issues);
  requiredString(input, "currency", "$", issues);
  const businessTimezone = requiredString(input, "businessTimezone", "$", issues);
  checkTimezone(businessTimezone, issues);
  const windowStart = requiredString(input, "windowStart", "$", issues);
  const windowEnd = requiredString(input, "windowEnd", "$", issues);
  const expected = expectedDates(windowStart, windowEnd);
  if (expected.length !== 7) {
    issues.push({ path: "$.window", message: "windowStart/windowEnd must cover exactly seven calendar business dates" });
  }

  const rawDays = requiredArray(input, "days", "$", issues);
  const dates: string[] = [];
  const statuses: string[] = [];
  const salesSources = new Set<string>();
  const fbaSources = new Set<string>();
  rawDays.forEach((day, index) => {
    const validated = validateDay(day, index, evidenceMode, schemaVersion, issues);
    if (validated.businessDate) dates.push(validated.businessDate);
    if (validated.salesSourceId) salesSources.add(validated.salesSourceId);
    if (validated.fbaSourceId) fbaSources.add(validated.fbaSourceId);
    if (isRecord(day) && typeof day.status === "string") statuses.push(day.status);
  });
  if (rawDays.length !== 7) issues.push({ path: "$.days", message: "must contain exactly seven daily records" });
  if (new Set(dates).size !== dates.length) issues.push({ path: "$.days", message: "businessDate values must be unique" });
  if (expected.length === 7 && dates.length === 7 && expected.some((date, index) => date !== dates[index])) {
    issues.push({ path: "$.days", message: "daily records must be ordered and cover the declared window exactly" });
  }
  if (salesSources.size > 1) issues.push({ path: "$.days.sales.sourceId", message: "must remain stable across the seven-day window" });
  if (fbaSources.size > 1) issues.push({ path: "$.days.fba.sourceId", message: "must remain stable across the seven-day window" });
  if ((options.requireAllPass ?? true) && statuses.some((status) => status !== "pass")) {
    issues.push({ path: "$.days.status", message: "all seven days must be pass for release acceptance" });
  }

  return {
    ok: issues.length === 0,
    evidenceBundleId: evidenceBundleId ?? null,
    evidenceMode: evidenceMode && ["example", "real"].includes(evidenceMode) ? evidenceMode : null,
    window: { start: windowStart ?? null, end: windowEnd ?? null },
    dayCount: rawDays.length,
    statuses,
    issues,
  };
}
