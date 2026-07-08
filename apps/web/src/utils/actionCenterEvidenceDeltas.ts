import {
  isActionEvidenceMovementMatch,
  type ActionEvidenceMovementFilter,
  type InsightEvent
} from "@amazon-monitor/shared";

export { isActionEvidenceMovementMatch };
export type { ActionEvidenceMovementFilter };

export type ActionEvidenceDeltaKey = "rank" | "price" | "review";
export type ActionEvidenceDeltaTone = "success" | "warning" | "danger" | "info";

export interface ActionEvidenceDeltaRow {
  key: ActionEvidenceDeltaKey;
  label: string;
  beforeLabel: string;
  afterLabel: string;
  deltaLabel: string;
  detail: string;
  tone: ActionEvidenceDeltaTone;
  progress: number;
  hasData: boolean;
}

export interface ActionEvidenceMovementRow {
  key: ActionEvidenceDeltaKey;
  filter: ActionEvidenceMovementFilter;
  label: string;
  value: number;
  detail: string;
  color: string;
}

export const actionEvidenceMovementFilterLabels: Record<ActionEvidenceMovementFilter, string> = {
  rankGain: "BSR 上升",
  priceCut: "价格下探",
  reviewGrowth: "Review 增长"
};

export const actionEvidenceMovementFilterOptions: Array<{ value: ActionEvidenceMovementFilter; label: string }> = [
  { value: "rankGain", label: actionEvidenceMovementFilterLabels.rankGain },
  { value: "priceCut", label: actionEvidenceMovementFilterLabels.priceCut },
  { value: "reviewGrowth", label: actionEvidenceMovementFilterLabels.reviewGrowth }
];

export function getActionEvidenceDeltaRows(event: InsightEvent): ActionEvidenceDeltaRow[] {
  return [
    buildRankDelta(event),
    buildPriceDelta(event),
    buildReviewDelta(event)
  ];
}

export function getActionEvidenceMovementRows(events: InsightEvent[]): ActionEvidenceMovementRow[] {
  return [
    {
      key: "rank",
      filter: "rankGain",
      label: "BSR 上升",
      value: events.filter((event) => isActionEvidenceMovementMatch(event, "rankGain")).length,
      detail: "竞品排名上升",
      color: "#2563eb"
    },
    {
      key: "price",
      filter: "priceCut",
      label: "价格下探",
      value: events.filter((event) => isActionEvidenceMovementMatch(event, "priceCut")).length,
      detail: "竞品价格降低",
      color: "#f97316"
    },
    {
      key: "review",
      filter: "reviewGrowth",
      label: "Review 增长",
      value: events.filter((event) => isActionEvidenceMovementMatch(event, "reviewGrowth")).length,
      detail: "Review 数增长",
      color: "#0f766e"
    }
  ];
}

function buildRankDelta(event: InsightEvent): ActionEvidenceDeltaRow {
  const before = event.evidence.previousRank;
  const after = event.evidence.currentRank;
  const inferredDelta = getRankDelta(event);

  if (inferredDelta === null) {
    return emptyRow("rank", "BSR 排名", "暂无排名变化数据");
  }

  return {
    key: "rank",
    label: "BSR 排名",
    beforeLabel: formatRank(before),
    afterLabel: formatRank(after),
    deltaLabel: formatSignedCount(inferredDelta, "名"),
    detail: rankDetail(inferredDelta),
    tone: rankTone(inferredDelta, after),
    progress: cappedPercent(Math.abs(inferredDelta), 100),
    hasData: true
  };
}

function buildPriceDelta(event: InsightEvent): ActionEvidenceDeltaRow {
  const before = getPriceBefore(event);
  const after = getPriceAfter(event);
  if (before === null || after === null) {
    return emptyRow("price", "价格", "暂无价格变化数据");
  }

  const delta = after - before;
  const rate = toFiniteNumber(event.evidence.priceChangeRate) ?? (before === 0 ? 0 : delta / before);

  return {
    key: "price",
    label: "价格",
    beforeLabel: formatPrice(before),
    afterLabel: formatPrice(after),
    deltaLabel: formatSignedPrice(delta),
    detail: priceDetail(delta),
    tone: priceTone(delta, rate),
    progress: cappedPercent(Math.abs(rate) * 100, 100),
    hasData: true
  };
}

function buildReviewDelta(event: InsightEvent): ActionEvidenceDeltaRow {
  const before = getReviewBefore(event);
  const after = getReviewAfter(event);
  const delta = getReviewDelta(event);

  if (delta === null) {
    return emptyRow("review", "Review", "暂无 Review 变化数据");
  }

  return {
    key: "review",
    label: "Review",
    beforeLabel: formatCount(before),
    afterLabel: formatCount(after),
    deltaLabel: formatSignedCount(delta, "条 Review"),
    detail: reviewDetail(delta),
    tone: delta > 0 ? "warning" : delta < 0 ? "success" : "info",
    progress: cappedPercent(Math.abs(delta), 100),
    hasData: true
  };
}

function emptyRow(key: ActionEvidenceDeltaKey, label: string, detail: string): ActionEvidenceDeltaRow {
  return {
    key,
    label,
    beforeLabel: "-",
    afterLabel: "-",
    deltaLabel: "无数据",
    detail,
    tone: "info",
    progress: 0,
    hasData: false
  };
}

function rankDetail(delta: number): string {
  if (delta > 0) return "竞品排名上升，威胁压力增加。";
  if (delta < 0) return "竞品排名回落，压力有所缓解。";
  return "当前证据窗口内排名持平。";
}

function rankTone(delta: number, currentRank: number | null | undefined): ActionEvidenceDeltaTone {
  if (delta <= 0) return delta < 0 ? "success" : "info";
  const rank = toFiniteNumber(currentRank);
  return rank !== null && rank <= 20 ? "danger" : "warning";
}

function priceDetail(delta: number): string {
  if (delta < 0) return "价格下探，转化压力可能增强。";
  if (delta > 0) return "价格上调，价格压力有所缓解。";
  return "当前证据窗口内价格持平。";
}

function priceTone(delta: number, rate: number): ActionEvidenceDeltaTone {
  if (delta < 0) return rate <= -0.1 ? "danger" : "warning";
  if (delta > 0) return "success";
  return "info";
}

function reviewDetail(delta: number): string {
  if (delta > 0) return "Review 数增长，销量动能可能延续。";
  if (delta < 0) return "当前证据窗口内 Review 数下降。";
  return "Review 数持平。";
}

function getRankDelta(event: InsightEvent): number | null {
  const before = toFiniteNumber(event.evidence.previousRank);
  const after = toFiniteNumber(event.evidence.currentRank);
  return before !== null && after !== null ? before - after : toFiniteNumber(event.evidence.rankChange);
}

function getPriceDelta(event: InsightEvent): number | null {
  const before = getPriceBefore(event);
  const after = getPriceAfter(event);
  return before !== null && after !== null ? after - before : null;
}

function getReviewDelta(event: InsightEvent): number | null {
  const before = getReviewBefore(event);
  const after = getReviewAfter(event);
  return before !== null && after !== null ? after - before : toFiniteNumber(event.evidence.reviewCountChange);
}

function getPriceBefore(event: InsightEvent): number | null {
  return toFiniteNumber(event.evidence.priceBefore);
}

function getPriceAfter(event: InsightEvent): number | null {
  return toFiniteNumber(event.evidence.priceAfter);
}

function getReviewBefore(event: InsightEvent): number | null {
  return toFiniteNumber(event.evidence.reviewCountBefore);
}

function getReviewAfter(event: InsightEvent): number | null {
  return toFiniteNumber(event.evidence.reviewCountAfter);
}

function formatRank(value: number | null | undefined): string {
  const rank = toFiniteNumber(value);
  return rank === null ? "-" : `#${Math.round(rank)}`;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatCount(value: number | null): string {
  return value === null ? "-" : Math.round(value).toLocaleString("en-US");
}

function formatSignedPrice(value: number): string {
  if (value === 0) return "$0.00";
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}$${Math.abs(value).toFixed(2)}`;
}

function formatSignedCount(value: number, unit: string): string {
  if (value === 0) return `0 ${unit}`;
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${Math.abs(Math.round(value)).toLocaleString("en-US")} ${unit}`;
}

function cappedPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
