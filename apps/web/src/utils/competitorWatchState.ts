import {
  asinWatchLevelLabels,
  asinWatchLevels,
  type AsinWatchLevel,
  type AsinWatchState,
  type CompetitorPoolItem
} from "@amazon-monitor/shared";

export interface CompetitorWatchLevelOption {
  label: string;
  value: AsinWatchLevel;
}

export const competitorWatchLevelOptions: CompetitorWatchLevelOption[] = asinWatchLevels.map((level) => ({
  label: asinWatchLevelLabels[level],
  value: level
}));

export function findCompetitorWatchState(
  watchStates: AsinWatchState[],
  asin: string
): AsinWatchState | null {
  return watchStates.find((state) => state.asin === asin) ?? null;
}

export function competitorWatchLevel(state: AsinWatchState | null): AsinWatchLevel {
  return state?.watchLevel ?? "NORMAL";
}

export function normalizeCompetitorWatchLevel(value: unknown): AsinWatchLevel {
  return asinWatchLevels.some((level) => level === value) ? value as AsinWatchLevel : "NORMAL";
}

export function competitorWatchLabel(state: AsinWatchState | null): string {
  return asinWatchLevelLabels[competitorWatchLevel(state)];
}

export function competitorWatchTagType(level: AsinWatchLevel): "danger" | "warning" | "info" {
  if (level === "CORE") return "danger";
  if (level === "POTENTIAL") return "warning";
  return "info";
}

export function competitorWatchReason(item: CompetitorPoolItem): string {
  return item.competitorReasons[0] ?? "运营手动设置竞品池优先级";
}
