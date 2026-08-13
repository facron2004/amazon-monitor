import { createHash } from "node:crypto";
import { parseIsoDate, type DayStatus } from "./sp-api-shadow-evidence-day.js";
import type { RunRow, SalesRow, ShadowEvidenceCollectorConfig } from "./sp-api-shadow-evidence-collector-types.js";

export const CURRENCY_EXPONENTS: Record<string, number> = {
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
  JPY: 0,
  KRW: 0,
};

export function validateConfig(config: ShadowEvidenceCollectorConfig): string[] {
  const start = parseIsoDate(config.windowStart);
  const end = parseIsoDate(config.windowEnd);
  if (!start || !end || end < start) throw new Error("Shadow evidence window must contain valid ordered dates");
  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  if (dates.length !== 7) throw new Error("Shadow evidence window must cover exactly seven business dates");
  for (const date of dates) {
    const reference = config.externalReferences[date];
    if (!reference || !/^\S+$/.test(reference.reportId) || Number.isNaN(Date.parse(reference.downloadedAt)) || !/^[a-f0-9]{64}$/i.test(reference.sha256)) {
      throw new Error(`External reference is incomplete for ${date}`);
    }
    if (!config.observedAtByDate[date] || Number.isNaN(Date.parse(config.observedAtByDate[date]))) {
      throw new Error(`observedAtByDate is incomplete for ${date}`);
    }
  }
  for (const [key, value] of Object.entries({
    marketplace: config.marketplace,
    currency: config.currency,
    businessTimezone: config.businessTimezone,
    evidenceBundleId: config.evidenceBundleId,
    organizationEvidenceId: config.organizationEvidenceId,
    commerceStoreEvidenceId: config.commerceStoreEvidenceId,
    sourceEvidenceId: config.sourceEvidenceId,
  })) {
    if (!value.trim()) throw new Error(`${key} must be non-empty`);
  }
  if (![config.orgId, config.dataSourceId, config.commerceStoreId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("orgId, dataSourceId, and commerceStoreId must be positive integers");
  }
  return dates;
}

export function chooseStatus(hasFacts: boolean, issues: string[]): DayStatus {
  if (!hasFacts || issues.some((issue) => issue.includes("currency mismatch") || issue.includes("sales amount mismatch"))) return "failed";
  return issues.length === 0 ? "pass" : "delayed";
}

export function emptySales() {
  return {
    hasFacts: false,
    syncRunId: null,
    storeDailyAmountMinor: 0,
    skuAmountMinor: 0,
    unmappedAmountMinor: 0,
    orders: 0,
    units: 0,
    factRows: 0,
    replayCreatedRecords: 0,
    replayUpdatedRecords: 0,
  };
}

export function sumAmounts(rows: SalesRow[], exponent: number): number {
  return rows.reduce((sum, row) => sum + toMinor(row.sales_amount, exponent), 0);
}

export function toMinor(value: number | null, exponent: number): number {
  if (value === null) return 0;
  if (!Number.isFinite(value) || value < 0) throw new Error("Sales amount must be a non-negative finite number");
  const minor = Math.round(value * 10 ** exponent);
  if (!Number.isSafeInteger(minor)) throw new Error("Sales amount exceeds safe integer range");
  return minor;
}

export function sumIntegers(values: Array<number | null>): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function minutesBetween(later: string, earlier: string): number {
  const difference = Date.parse(later) - Date.parse(earlier);
  if (!Number.isFinite(difference)) return 525_600;
  return Math.max(0, Math.floor(difference / 60_000));
}

export function redactedRunId(bundleId: string, runId: number | null): string {
  if (runId === null) return "run-redacted";
  const digest = createHash("sha256").update(`${bundleId}:run:${runId}`).digest("hex").slice(0, 12);
  return `run-${digest}`;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function formatIssues(issues: Array<{ path: string; message: string }>): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

export function fbaCheckpointIssues(run: RunRow, snapshotRows: number): string[] {
  if (!run.checkpoint_summary) return ["fba checkpoint unavailable"];
  let value: unknown;
  try {
    value = JSON.parse(run.checkpoint_summary);
  } catch {
    return ["fba checkpoint invalid"];
  }
  if (!isRecord(value) || value.version !== 1) return ["fba checkpoint invalid"];
  const nextToken = value.nextToken;
  const hasPendingToken = typeof nextToken === "string"
    ? nextToken.trim() !== ""
    : nextToken !== null && nextToken !== undefined;
  const issues: string[] = [];
  if (value.completed !== true || hasPendingToken) issues.push("fba checkpoint incomplete");
  if (typeof value.rowsSeen !== "number" || !Number.isSafeInteger(value.rowsSeen) || value.rowsSeen !== snapshotRows) {
    issues.push("fba checkpoint row mismatch");
  }
  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
