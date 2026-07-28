import type {
  AiDataFreshness,
  AiAgentOutput,
  AiRecommendedAction,
  BestsellerRankSnapshot,
  InsightEvent,
  ProductSyncStatus
} from "@amazon-monitor/shared";

const BSR_MAX_AGE_HOURS = 24;
const SAFE_SYNC_STATUSES: ProductSyncStatus[] = ["success", "manual"];

export interface AiFreshnessEvidenceRecord {
  dataSource: string;
  lastSyncedAt: string | null;
  syncStatus: ProductSyncStatus;
  syncError?: string | null;
}

interface AssessDataFreshnessInput {
  evidenceDate: string;
  records: AiFreshnessEvidenceRecord[];
  maxAgeHours: number;
  dataLabel: string;
  now?: Date;
}

export function assessDataFreshness(input: AssessDataFreshnessInput): AiDataFreshness {
  const now = input.now ?? new Date();
  const lastSyncedAt = latestSyncTime(input.records);
  const ageHours = evidenceAgeHours(input.evidenceDate, now);
  const freshnessStatus = input.records.length === 0 || ageHours === null
    ? "unknown"
    : ageHours > input.maxAgeHours
      ? "stale"
      : "fresh";
  const syncStatus = resolveSyncStatus(input.records);
  const failureReason = resolveFailureReason(input.records, syncStatus, input.dataLabel);

  return {
    evidenceDate: input.evidenceDate,
    evaluatedAt: now.toISOString(),
    dataSource: resolveDataSource(input.records),
    lastSyncedAt,
    syncStatus,
    freshnessStatus,
    ageHours,
    maxAgeHours: input.maxAgeHours,
    failureReason,
    warning: freshnessWarning({
      status: freshnessStatus,
      syncStatus,
      evidenceDate: input.evidenceDate,
      ageHours,
      maxAgeHours: input.maxAgeHours,
      dataLabel: input.dataLabel
    })
  };
}

export function assessBsrDataFreshness(
  evidenceDate: string,
  snapshots: BestsellerRankSnapshot[],
  now = new Date()
): AiDataFreshness {
  return assessDataFreshness({
    evidenceDate,
    records: snapshots.map((snapshot) => ({
      dataSource: snapshot.dataSource?.trim() || "manual",
      lastSyncedAt: snapshot.lastSyncedAt ?? null,
      syncStatus: snapshot.syncStatus ?? "manual"
    })),
    maxAgeHours: BSR_MAX_AGE_HOURS,
    dataLabel: "BSR ranking",
    now
  });
}

export function isDataFreshnessSafe(freshness: AiDataFreshness): boolean {
  return freshness.freshnessStatus === "fresh"
    && freshness.syncStatus !== null
    && SAFE_SYNC_STATUSES.includes(freshness.syncStatus);
}

export function insightEventFreshnessRecords(events: InsightEvent[]): AiFreshnessEvidenceRecord[] {
  return events.map((event) => ({
    dataSource: "insight_events",
    lastSyncedAt: event.createdAt,
    syncStatus: "success"
  }));
}

export function guardAgentOutput(
  output: AiAgentOutput,
  dataFreshness: AiDataFreshness,
  refreshAction: AiRecommendedAction
): AiAgentOutput {
  if (isDataFreshnessSafe(dataFreshness)) {
    return { ...output, dataFreshness };
  }
  const warning = dataFreshness.warning ?? dataFreshness.failureReason ?? "Evidence freshness cannot be confirmed.";
  return {
    ...output,
    evidence: [warning, ...output.evidence].slice(0, 8),
    impact: `Evidence is not ready for execution. ${output.impact}`,
    recommended_actions: [{ ...refreshAction, priority: "P2", needs_human_approval: true }],
    confidence: Math.min(0.49, output.confidence),
    dataFreshness
  };
}

function evidenceAgeHours(evidenceDate: string, now: Date): number | null {
  const evidenceDay = Date.parse(`${evidenceDate}T00:00:00.000Z`);
  if (!Number.isFinite(evidenceDay)) return null;
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((currentDay - evidenceDay) / 3_600_000));
}

function resolveDataSource(records: AiFreshnessEvidenceRecord[]): string {
  const sources = [...new Set(records.map((item) => item.dataSource.trim()).filter(Boolean))].sort();
  return sources.length > 0 ? sources.join(", ") : "Unavailable";
}

function latestSyncTime(records: AiFreshnessEvidenceRecord[]): string | null {
  return records
    .map((item) => item.lastSyncedAt)
    .filter((item): item is string => typeof item === "string" && Number.isFinite(Date.parse(item)))
    .sort()
    .at(-1) ?? null;
}

function resolveSyncStatus(records: AiFreshnessEvidenceRecord[]): ProductSyncStatus | null {
  if (records.length === 0) return null;
  const statuses = records.map((item) => item.syncStatus);
  if (statuses.every((status) => status === "failed")) return "failed";
  if (statuses.includes("failed") || statuses.includes("partial")) return "partial";
  if (statuses.includes("pending")) return "pending";
  if (statuses.every((status) => status === "manual")) return "manual";
  return "success";
}

function resolveFailureReason(
  records: AiFreshnessEvidenceRecord[],
  syncStatus: ProductSyncStatus | null,
  dataLabel: string
): string | null {
  const errors = [...new Set(records.map((item) => item.syncError?.trim()).filter((item): item is string => Boolean(item)))];
  if (errors.length > 0) return errors.join("; ");
  if (syncStatus === "failed") return `${dataLabel} 采集失败，请检查来源任务后重试。`;
  if (syncStatus === "partial") return `${dataLabel} 仅部分采集成功，当前结论可能遗漏证据。`;
  if (syncStatus === "pending") return `${dataLabel} 仍在采集中。`;
  return null;
}

function freshnessWarning(input: {
  status: AiDataFreshness["freshnessStatus"];
  syncStatus: ProductSyncStatus | null;
  evidenceDate: string;
  ageHours: number | null;
  maxAgeHours: number;
  dataLabel: string;
}): string | null {
  if (input.status === "unknown") {
    return `${input.dataLabel} 数据新鲜度无法确认，请先完成采集或导入后再执行。`;
  }
  if (input.status === "stale") {
    return `${input.dataLabel} 证据日期 ${input.evidenceDate}，已超过 ${input.maxAgeHours} 小时新鲜度要求；请重新采集后再执行。`;
  }
  if (input.syncStatus && !SAFE_SYNC_STATUSES.includes(input.syncStatus)) {
    return `${input.dataLabel} 采集状态为 ${input.syncStatus}，请等待完整刷新后再执行。`;
  }
  return null;
}
