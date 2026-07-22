import type { InsightEvent } from "@amazon-monitor/shared";
import { actionableStatuses } from "./actionCenterChartData";
import type { BrandActionPressureRow } from "./actionCenterChartTypes";

export function getBrandActionPressureRows(
  events: InsightEvent[],
  limit = 6,
): BrandActionPressureRow[] {
  type MutableBrandRow = BrandActionPressureRow & { topScore: number };
  const rows = new Map<string, MutableBrandRow>();

  for (const event of events) {
    if (!actionableStatuses.has(event.status)) continue;

    const explicitBrand = event.brand?.trim() ?? "";
    const brand = explicitBrand || "未知品牌";
    const isSurge = hasBrandMatrixSurgeSignal(event);
    const isDrop = hasBrandMatrixDropSignal(event);
    const current = rows.get(brand);
    if (!current) {
      rows.set(brand, {
        brand,
        value: event.scoreTotal,
        eventCount: 1,
        p0Count: event.eventLevel === "P0" ? 1 : 0,
        matrixSurgeCount: isSurge ? 1 : 0,
        matrixDropCount: isDrop ? 1 : 0,
        brandTop100ShareChange: finiteNumber(
          event.evidence.brandTop100ShareChange,
        ),
        topEventId: event.id,
        topEventTitle: event.eventTitle,
        topScore: event.scoreTotal,
        canFocus: explicitBrand.length > 0,
      });
      continue;
    }

    current.value += event.scoreTotal;
    current.eventCount += 1;
    if (event.eventLevel === "P0") {
      current.p0Count += 1;
    }
    if (isSurge) {
      current.matrixSurgeCount += 1;
    }
    if (isDrop) {
      current.matrixDropCount += 1;
    }
    current.brandTop100ShareChange = dominantShareChange(
      current.brandTop100ShareChange,
      finiteNumber(event.evidence.brandTop100ShareChange),
    );
    if (event.scoreTotal > current.topScore) {
      current.topEventId = event.id;
      current.topEventTitle = event.eventTitle;
      current.topScore = event.scoreTotal;
    }
  }

  return Array.from(rows.values())
    .sort(
      (left, right) =>
        right.value - left.value ||
        right.p0Count - left.p0Count ||
        right.eventCount - left.eventCount ||
        left.brand.localeCompare(right.brand),
    )
    .slice(0, limit)
    .map((row) => ({
      brand: row.brand,
      value: row.value,
      eventCount: row.eventCount,
      p0Count: row.p0Count,
      matrixSurgeCount: row.matrixSurgeCount,
      matrixDropCount: row.matrixDropCount,
      brandTop100ShareChange: row.brandTop100ShareChange,
      topEventId: row.topEventId,
      topEventTitle: row.topEventTitle,
      canFocus: row.canFocus,
    }));
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dominantShareChange(
  current: number | null,
  next: number | null,
): number | null {
  if (next === null) return current;
  if (current === null || Math.abs(next) > Math.abs(current)) return next;
  return current;
}

function hasBrandMatrixSurgeSignal(event: InsightEvent): boolean {
  return (
    event.eventType === "BRAND_MATRIX_SURGE" ||
    event.attributionTags.includes("BRAND_MATRIX_PUSH") ||
    (event.evidence.brandRisingCount ?? 0) >= 3 ||
    (event.evidence.brandNewEntryCount ?? 0) >= 2 ||
    (finiteNumber(event.evidence.brandTop100ShareChange) ?? 0) >= 0.05
  );
}

function hasBrandMatrixDropSignal(event: InsightEvent): boolean {
  return (
    event.eventType === "BRAND_MATRIX_DROP" ||
    (event.evidence.brandDroppedCount ?? 0) >= 2 ||
    (event.evidence.brandRankDownCount ?? 0) >= 3 ||
    (finiteNumber(event.evidence.brandTop100ShareChange) ?? 0) <= -0.05
  );
}

export function formatBrandMatrixSignal(
  pressure: Pick<
    BrandActionPressureRow,
    | "eventCount"
    | "matrixSurgeCount"
    | "matrixDropCount"
    | "brandTop100ShareChange"
  >,
): string {
  const matrix = [
    pressure.matrixSurgeCount > 0 ? `上攻 ${pressure.matrixSurgeCount}` : null,
    pressure.matrixDropCount > 0 ? `下滑 ${pressure.matrixDropCount}` : null,
    pressure.brandTop100ShareChange !== null
      ? `份额 ${formatSignedPercent(pressure.brandTop100ShareChange)}`
      : null,
  ].filter(Boolean);
  return matrix.length > 0
    ? matrix.join(" / ")
    : `${pressure.eventCount} 条事件`;
}

function formatSignedPercent(value: number): string {
  const percent = Math.round(value * 1000) / 10;
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

export function brandPressureColor(
  row: Pick<
    BrandActionPressureRow,
    "matrixSurgeCount" | "matrixDropCount" | "brandTop100ShareChange"
  >,
): string {
  if (
    row.matrixDropCount > row.matrixSurgeCount ||
    (row.brandTop100ShareChange ?? 0) < 0
  )
    return "#dc2626";
  if (
    row.matrixSurgeCount > row.matrixDropCount ||
    (row.brandTop100ShareChange ?? 0) > 0
  )
    return "#0f766e";
  if (row.matrixDropCount > 0 && row.matrixSurgeCount > 0) return "#f59e0b";
  return "#2563eb";
}
