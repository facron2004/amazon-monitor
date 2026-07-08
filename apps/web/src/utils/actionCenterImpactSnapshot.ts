import type { InsightEvent } from "@amazon-monitor/shared";

export type ActionImpactSnapshotKey = "rank" | "price" | "review" | "promo";
export type ActionImpactSnapshotTone = "success" | "warning" | "danger" | "info";

export interface ActionImpactSnapshotRow {
  key: ActionImpactSnapshotKey;
  label: string;
  valueLabel: string;
  beforeLabel: string;
  afterLabel: string;
  deltaLabel: string;
  detail: string;
  tone: ActionImpactSnapshotTone;
  progress: number;
  hasData: boolean;
}

export function buildActionImpactSnapshotRows(event: InsightEvent): ActionImpactSnapshotRow[] {
  const rows = [
    buildRankSnapshot(event),
    buildPriceSnapshot(event),
    buildReviewSnapshot(event)
  ];
  const promo = buildPromoSnapshot(event);
  return promo ? [...rows, promo] : rows;
}

function buildRankSnapshot(event: InsightEvent): ActionImpactSnapshotRow {
  const before = toFiniteNumber(event.evidence.previousRank);
  const after = toFiniteNumber(event.evidence.currentRank);
  const delta = getRankDelta(event);

  if (delta === null && before === null && after === null) {
    return emptyRow("rank", "Current BSR", "Rank evidence is not available.");
  }

  return {
    key: "rank",
    label: "Current BSR",
    valueLabel: formatRank(after),
    beforeLabel: formatRank(before),
    afterLabel: formatRank(after),
    deltaLabel: delta === null ? "No delta" : formatSignedCount(delta, "ranks"),
    detail: rankDetail(delta),
    tone: rankTone(delta, after),
    progress: delta === null ? 0 : cappedPercent(Math.abs(delta), 100),
    hasData: true
  };
}

function buildPriceSnapshot(event: InsightEvent): ActionImpactSnapshotRow {
  const before = toFiniteNumber(event.evidence.priceBefore);
  const after = toFiniteNumber(event.evidence.priceAfter);

  if (before === null && after === null) {
    return emptyRow("price", "Current price", "Price evidence is not available.");
  }

  const delta = before !== null && after !== null ? after - before : null;
  const rate = toFiniteNumber(event.evidence.priceChangeRate) ?? (
    before !== null && after !== null && before !== 0 ? (after - before) / before : null
  );

  return {
    key: "price",
    label: "Current price",
    valueLabel: formatPrice(after),
    beforeLabel: formatPrice(before),
    afterLabel: formatPrice(after),
    deltaLabel: delta === null ? "No delta" : formatSignedPrice(delta),
    detail: priceDetail(delta),
    tone: priceTone(delta, rate),
    progress: rate === null ? 0 : cappedPercent(Math.abs(rate) * 100, 100),
    hasData: true
  };
}

function buildReviewSnapshot(event: InsightEvent): ActionImpactSnapshotRow {
  const before = toFiniteNumber(event.evidence.reviewCountBefore);
  const after = toFiniteNumber(event.evidence.reviewCountAfter);
  const delta = getReviewDelta(event);

  if (delta === null && before === null && after === null) {
    return emptyRow("review", "Review count", "Review evidence is not available.");
  }

  return {
    key: "review",
    label: "Review count",
    valueLabel: formatCount(after),
    beforeLabel: formatCount(before),
    afterLabel: formatCount(after),
    deltaLabel: delta === null ? "No delta" : formatSignedCount(delta, "reviews"),
    detail: reviewDetail(delta),
    tone: reviewTone(delta),
    progress: delta === null ? 0 : cappedPercent(Math.abs(delta), 100),
    hasData: true
  };
}

function buildPromoSnapshot(event: InsightEvent): ActionImpactSnapshotRow | null {
  const before = cleanText(event.evidence.couponBefore);
  const afterCoupon = cleanText(event.evidence.couponAfter);
  const deal = cleanText(event.evidence.dealType);

  if (!before && !afterCoupon && !deal) {
    return null;
  }

  const after = deal ?? afterCoupon;
  const removed = before !== null && after === null;

  return {
    key: "promo",
    label: "Promo signal",
    valueLabel: after ?? "Removed",
    beforeLabel: before ?? "-",
    afterLabel: after ?? "-",
    deltaLabel: deal ? "Deal active" : afterCoupon ? "Coupon active" : "Promo removed",
    detail: removed ? "Promotion disappeared in this evidence window." : "Promotion is visible in the latest evidence.",
    tone: removed ? "success" : "warning",
    progress: 100,
    hasData: true
  };
}

function emptyRow(
  key: ActionImpactSnapshotKey,
  label: string,
  detail: string
): ActionImpactSnapshotRow {
  return {
    key,
    label,
    valueLabel: "-",
    beforeLabel: "-",
    afterLabel: "-",
    deltaLabel: "No data",
    detail,
    tone: "info",
    progress: 0,
    hasData: false
  };
}

function getRankDelta(event: InsightEvent): number | null {
  const explicit = toFiniteNumber(event.evidence.rankChange);
  if (explicit !== null) return explicit;

  const before = toFiniteNumber(event.evidence.previousRank);
  const after = toFiniteNumber(event.evidence.currentRank);
  return before !== null && after !== null ? before - after : null;
}

function getReviewDelta(event: InsightEvent): number | null {
  const before = toFiniteNumber(event.evidence.reviewCountBefore);
  const after = toFiniteNumber(event.evidence.reviewCountAfter);
  if (before !== null && after !== null) return after - before;

  return toFiniteNumber(event.evidence.reviewCountChange);
}

function rankDetail(delta: number | null): string {
  if (delta === null) return "Rank movement is not available for this signal.";
  if (delta > 0) return "Competitor moved closer to the top of BSR.";
  if (delta < 0) return "Competitor lost BSR ground in this window.";
  return "BSR stayed flat in this evidence window.";
}

function rankTone(delta: number | null, currentRank: number | null): ActionImpactSnapshotTone {
  if (delta === null) return "info";
  if (delta <= 0) return delta < 0 ? "success" : "info";
  return currentRank !== null && currentRank <= 20 ? "danger" : "warning";
}

function priceDetail(delta: number | null): string {
  if (delta === null) return "Price movement is not available for this signal.";
  if (delta < 0) return "Latest price is lower than the previous evidence.";
  if (delta > 0) return "Latest price moved higher in this window.";
  return "Price stayed flat in this evidence window.";
}

function priceTone(delta: number | null, rate: number | null): ActionImpactSnapshotTone {
  if (delta === null) return "info";
  if (delta < 0) return rate !== null && rate <= -0.1 ? "danger" : "warning";
  if (delta > 0) return "success";
  return "info";
}

function reviewDetail(delta: number | null): string {
  if (delta === null) return "Review movement is not available for this signal.";
  if (delta > 0) return "Review count increased in the current evidence.";
  if (delta < 0) return "Review count decreased in the current evidence.";
  return "Review count stayed flat in this evidence window.";
}

function reviewTone(delta: number | null): ActionImpactSnapshotTone {
  if (delta === null) return "info";
  if (delta > 0) return "warning";
  if (delta < 0) return "success";
  return "info";
}

function formatRank(value: number | null): string {
  return value === null ? "-" : `#${Math.round(value)}`;
}

function formatPrice(value: number | null): string {
  return value === null ? "-" : `$${value.toFixed(2)}`;
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

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
