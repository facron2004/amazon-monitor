import type { ActionCenterSeries } from "./actionCenterChartTypes";

export const chartTextStyle = {
  color: "#475569",
  fontFamily: "Noto Sans SC, Microsoft YaHei, sans-serif",
};

export const actionChartTooltip = {
  backgroundColor: "rgba(255, 255, 255, 0.96)",
  borderColor: "#dbe4f0",
  borderWidth: 1,
  textStyle: { color: "#0f172a" },
  extraCssText:
    "box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12); border-radius: 12px;",
};

export function formatCompactAxisValue(value: number | string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  if (Math.abs(numericValue) >= 1000) {
    const compactValue = numericValue / 1000;
    return `${Number.isInteger(compactValue) ? compactValue : compactValue.toFixed(1)}k`;
  }
  return String(numericValue);
}

export type { ActionCenterSeries };
