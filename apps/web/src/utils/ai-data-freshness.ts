import type { AiDataFreshness } from "@amazon-monitor/shared";

export function isAiDataFreshnessSafe(freshness: AiDataFreshness | undefined): boolean {
  return freshness === undefined || (
    freshness.freshnessStatus === "fresh"
    && (freshness.syncStatus === "success" || freshness.syncStatus === "manual")
  );
}
