import type { CompetitorPoolItem } from "@amazon-monitor/shared";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";

export interface FilterVisibleCompetitorsOptions {
  competitors: CompetitorPoolItem[];
  competitorQuery: string;
  competitorSourceFilter: CompetitorSourceFilter;
  competitorTierFilter: CompetitorTierFilter;
}

export function filterVisibleCompetitors(options: FilterVisibleCompetitorsOptions): CompetitorPoolItem[] {
  const query = options.competitorQuery.trim().toLowerCase();

  return options.competitors.filter((item) => {
    const matchesSource =
      options.competitorSourceFilter === "all" ||
      item.sourceType === options.competitorSourceFilter ||
      (options.competitorSourceFilter === "category" && item.sourceType === "hybrid") ||
      (options.competitorSourceFilter === "keyword" && item.sourceType === "hybrid");
    const matchesTier = options.competitorTierFilter === "all" || item.competitorTier === options.competitorTierFilter;

    if (!query) {
      return matchesSource && matchesTier;
    }

    return (
      matchesSource &&
      matchesTier &&
      (item.asin.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        (item.brand ?? "").toLowerCase().includes(query) ||
        (item.couponText ?? "").toLowerCase().includes(query) ||
        (item.dealBadge ?? "").toLowerCase().includes(query) ||
        item.competitorReasons.some((reason) => reason.toLowerCase().includes(query)))
    );
  });
}

export function findSelectedCompetitor(competitors: CompetitorPoolItem[], selectedCompetitorAsin: string | null): CompetitorPoolItem | null {
  return competitors.find((item) => item.asin === selectedCompetitorAsin) ?? null;
}
