import type { InsightEvent, InsightEventStatus } from "@amazon-monitor/shared";
import type { Store } from "../store.js";

type RankingInsightEvent = InsightEvent & { asin: string };

function hasAsin(event: InsightEvent): event is RankingInsightEvent {
  return event.asin !== null;
}

export const agentSignalTypes = ["RANKING_JUMP"] as const;
export type AgentSignalType = (typeof agentSignalTypes)[number];

export const agentSignalSeverities = ["HIGH", "MEDIUM", "LOW"] as const;
export type AgentSignalSeverity = (typeof agentSignalSeverities)[number];

export const agentSignalStatuses = ["NEW", "INVESTIGATING", "ACTIONED", "IGNORED"] as const;
export type AgentSignalStatus = (typeof agentSignalStatuses)[number];

export interface AgentSignalEvidence {
  sourceEventId: string;
  sourceEventType: InsightEvent["eventType"];
  eventDate: string;
  observedAt: string;
  marketplace: string | null;
  categoryName: string | null;
  evidenceItems: string[];
}

export interface AgentSignal {
  id: string;
  organizationId: number;
  type: AgentSignalType;
  entityType: "ASIN";
  entityId: string;
  before: number | null;
  after: number | null;
  change: number | null;
  severity: AgentSignalSeverity;
  detectedAt: string;
  status: AgentSignalStatus;
  title: string;
  summary: string;
  suggestedAction: string;
  evidence: AgentSignalEvidence;
}

export interface AgentSignalListOptions {
  limit?: number;
  offset?: number;
}

export function listRankingSignals(
  store: Store,
  organizationId: number,
  options: AgentSignalListOptions = {},
): AgentSignal[] {
  return store.listInsightEvents({
    orgId: organizationId,
    eventType: "RANK_SURGE",
    limit: options.limit ?? 50,
    offset: options.offset,
  })
    .filter(hasAsin)
    .map(toAgentSignal);
}

export function getRankingSignal(
  store: Store,
  organizationId: number,
  id: string,
): AgentSignal | null {
  const event = store.getInsightEvent(id, organizationId);
  if (!event || event.eventType !== "RANK_SURGE" || !hasAsin(event)) return null;
  return toAgentSignal(event);
}

export function updateRankingSignalStatus(
  store: Store,
  organizationId: number,
  id: string,
  status: AgentSignalStatus,
): AgentSignal | null {
  const event = store.getInsightEvent(id, organizationId);
  if (!event || event.eventType !== "RANK_SURGE" || !hasAsin(event)) return null;
  const updated = store.updateInsightEventStatus(
    id,
    sourceStatusForSignal(status),
    undefined,
    organizationId,
  );
  return updated && updated.eventType === "RANK_SURGE" && hasAsin(updated)
    ? toAgentSignal(updated)
    : null;
}

function toAgentSignal(event: RankingInsightEvent): AgentSignal {
  return {
    id: event.id,
    organizationId: event.orgId,
    type: "RANKING_JUMP",
    entityType: "ASIN",
    entityId: event.asin,
    before: finiteOrNull(event.evidence.previousRank),
    after: finiteOrNull(event.evidence.currentRank),
    change: finiteOrNull(event.evidence.rankChange),
    severity: severityForLevel(event.eventLevel),
    detectedAt: event.createdAt,
    status: signalStatusForSource(event.status),
    title: event.eventTitle,
    summary: event.eventSummary,
    suggestedAction: event.suggestedAction,
    evidence: {
      sourceEventId: event.id,
      sourceEventType: event.eventType,
      eventDate: event.eventDate,
      observedAt: event.updatedAt,
      marketplace: event.evidence.marketplace || null,
      categoryName: event.evidence.categoryName ?? null,
      evidenceItems: [...event.evidence.evidenceItems],
    },
  };
}

function severityForLevel(level: InsightEvent["eventLevel"]): AgentSignalSeverity {
  if (level === "P0") return "HIGH";
  if (level === "P1") return "MEDIUM";
  return "LOW";
}

function signalStatusForSource(status: InsightEvent["status"]): AgentSignalStatus {
  if (status === "IGNORED") return "IGNORED";
  if (status === "WATCHING") return "INVESTIGATING";
  if (status === "FOLLOWED" || status === "REVIEWED" || status === "CONVERTED_TO_TASK") return "ACTIONED";
  return "NEW";
}

function sourceStatusForSignal(status: AgentSignalStatus): InsightEventStatus {
  if (status === "INVESTIGATING") return "WATCHING";
  if (status === "ACTIONED") return "CONVERTED_TO_TASK";
  if (status === "IGNORED") return "IGNORED";
  return "TODO";
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
