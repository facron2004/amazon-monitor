import type { BsrRankChange } from "@amazon-monitor/shared";

const levelPriority: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

export function levelWeight(value: string | null | undefined): number {
  return value ? levelPriority[value] ?? 0 : 0;
}

export function normalizeWidth(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return Math.max(14, Math.round((value / max) * 100));
}

export function compactText(value: string | null | undefined, limit = 92): string {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) {
    return "-";
  }

  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

export function rankPath(previousRank: number | null | undefined, currentRank: number | null | undefined): string {
  return `${previousRank ? `#${previousRank}` : "-"} → ${currentRank ? `#${currentRank}` : "-"}`;
}

export function rankMovementMagnitude(item: Pick<BsrRankChange, "previousRank" | "currentRank" | "rankChange">): number {
  if (item.rankChange !== null && item.rankChange !== undefined) {
    return Math.abs(item.rankChange);
  }

  if (item.previousRank && item.currentRank) {
    return Math.abs(item.previousRank - item.currentRank);
  }

  return 0;
}
