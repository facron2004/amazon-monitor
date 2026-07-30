import type {
  AgentEvidenceRef,
  AgentFreshness,
  AgentToolEnvelope,
} from "@amazon-monitor/shared";

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function evidenceDate(record: Record<string, unknown>): string | null {
  return stringField(
    record,
    "snapshotDate",
    "date",
    "eventDate",
    "lastSyncedAt",
    "capturedAt",
    "createdAt",
  );
}

function freshnessFromRecords(
  records: unknown[],
  checkedAt: string,
  maxAgeHours: number,
): AgentFreshness {
  const dates = records
    .map(recordOf)
    .filter((record): record is Record<string, unknown> => record !== null)
    .map(evidenceDate)
    .filter((value): value is string => value !== null)
    .sort();
  const latest = dates.at(-1) ?? null;
  if (!latest) {
    return {
      status: "missing",
      checkedAt,
      maxAgeHours,
      oldestEvidenceAt: null,
      staleSources: [],
      dataGaps: ["No dated evidence matched the requested scope"],
      warnings: ["Collect fresh evidence before drawing a deterministic conclusion"],
    };
  }
  const timestamp = Date.parse(latest.length === 10 ? `${latest}T23:59:59.999Z` : latest);
  const ageHours = Number.isFinite(timestamp)
    ? (Date.parse(checkedAt) - timestamp) / 3_600_000
    : Number.POSITIVE_INFINITY;
  const stale = ageHours > maxAgeHours;
  return {
    status: stale ? "stale" : "fresh",
    checkedAt,
    maxAgeHours,
    oldestEvidenceAt: dates[0] ?? latest,
    staleSources: stale ? ["requested_scope"] : [],
    dataGaps: [],
    warnings: stale ? [`Latest evidence is older than ${maxAgeHours} hours`] : [],
  };
}

function evidenceRefs(source: string, records: unknown[]): AgentEvidenceRef[] {
  return records.slice(0, 100).flatMap((value, index) => {
    const record = recordOf(value);
    if (!record) return [];
    const identity = stringField(record, "id", "asin", "keywordId", "categoryId") ?? String(index + 1);
    return [{
      kind: source,
      id: `${source}:${identity}`,
      label: stringField(record, "title", "name", "asin") ?? `${source} ${identity}`,
      observedAt: evidenceDate(record),
    }];
  });
}

export function buildAgentToolEnvelope<T>(
  source: string,
  data: T,
  records: unknown[],
  maxAgeHours = 24,
): AgentToolEnvelope<T> {
  const checkedAt = new Date().toISOString();
  const freshness = freshnessFromRecords(records, checkedAt, maxAgeHours);
  return {
    data,
    evidenceRefs: evidenceRefs(source, records),
    freshness,
    dataGaps: freshness.dataGaps,
    warnings: freshness.warnings,
  };
}
