import type {
  AlertRule,
  AlertRuleCondition,
  AlertRuleConditionValue,
  AlertRuleRunResult,
  InsightEvent,
  InsightEventInput,
  InsightEventLevel,
  InsightEventType
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";

export interface RuleRunInput {
  orgId: number;
  date: string;
}

export interface RuleRuntimeEventData {
  eventType: InsightEventType;
  asin: string | null;
  brand: string | null;
  categoryId?: number | null;
  keywordId?: number | null;
  title: string;
  summary: string;
  evidence: InsightEventInput["evidence"];
}

export function emitRuleEvent(
  store: Store,
  rule: AlertRule,
  input: RuleRunInput,
  entityKey: string,
  data: RuleRuntimeEventData,
  events: InsightEvent[],
  skipped: AlertRuleRunResult["skipped"]
): void {
  const sourceEventKey = `${rule.ruleId}:${entityKey}`;
  const recent = store.listInsightEvents({
    orgId: input.orgId,
    eventType: data.eventType,
    asin: data.asin ?? undefined,
    limit: 1000
  }).find((event) => event.evidence.sourceEventKey === sourceEventKey);
  if (recent && recent.eventDate !== input.date && hoursBetween(recent.eventDate, input.date) < rule.config.cooldownHours) {
    skipped.push({ ruleId: rule.ruleId, entityKey, reason: "cooldown" });
    return;
  }

  const priority = priorityFor(rule.config.severity);
  const rankingScore = data.eventType === "KEYWORD_PAGE_DROP" ? 30 : 0;
  const promoScore = data.eventType === "ADS_ACOS_SPIKE" ? 20 : 0;
  const productScore = rankingScore === 0 ? 20 : 0;
  events.push(store.upsertInsightEvent({
    id: `${input.date}|rule:${rule.ruleId}|${entityKey}`,
    orgId: input.orgId,
    eventDate: input.date,
    asin: data.asin,
    brand: data.brand,
    categoryId: data.categoryId ?? null,
    keywordId: data.keywordId ?? null,
    eventType: data.eventType,
    eventLevel: priority.level,
    eventTitle: data.title,
    eventSummary: data.summary,
    attributionTags: ["NO_CLEAR_DRIVER"],
    evidence: {
      ...data.evidence,
      sourceEventKey,
      sourceEventType: "alert_rule",
      ruleId: rule.ruleId
    },
    scoreTotal: priority.score,
    scoreLevel: priority.scoreLevel,
    scoreBreakdown: {
      rankingScore,
      productScore,
      promoScore,
      brandScore: 0,
      riskScore: priority.score - rankingScore - productScore - promoScore,
      reasons: rule.config.conditions.map(conditionText)
    },
    suggestedAction: rule.suggestion,
    status: "TODO",
    assignee: null,
    reviewDueDate: addDays(input.date, 3),
    reviewResult: null,
    userNote: null
  }));
}

export function matchesRule(rule: AlertRule, metrics: Record<string, AlertRuleConditionValue>): boolean {
  return rule.config.conditions.every((condition) => {
    const actual = metrics[condition.metric];
    return actual !== undefined && compareCondition(actual, condition);
  });
}

function compareCondition(actual: AlertRuleConditionValue, condition: AlertRuleCondition): boolean {
  const expected = condition.value;
  if (condition.operator === "==") return actual === expected;
  if (condition.operator === "!=") return actual !== expected;
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  if (condition.operator === "<") return actual < expected;
  if (condition.operator === "<=") return actual <= expected;
  if (condition.operator === ">") return actual > expected;
  return actual >= expected;
}

function priorityFor(severity: AlertRule["config"]["severity"]): {
  level: InsightEventLevel;
  score: number;
  scoreLevel: InsightEventInput["scoreLevel"];
} {
  if (severity === "critical") return { level: "P0", score: 92, scoreLevel: "S" };
  if (severity === "high") return { level: "P1", score: 78, scoreLevel: "A" };
  if (severity === "medium") return { level: "P2", score: 62, scoreLevel: "B" };
  return { level: "P2", score: 45, scoreLevel: "C" };
}

function conditionText(condition: AlertRuleCondition): string {
  return `${condition.metric} ${condition.operator} ${String(condition.value)}${condition.unit ? ` ${condition.unit}` : ""}`;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function hoursBetween(fromDate: string, toDate: string): number {
  return Math.max(0, (Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 3_600_000);
}

export function formatNumber(value: number | null): string {
  return value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
