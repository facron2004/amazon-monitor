import type {
  AsinWatchState,
  BrandMatrixSnapshot,
  CategoryMonitor,
  CompetitorPoolItem,
  KeywordMonitor
} from "@amazon-monitor/shared";

export interface InsightBuildContext {
  date: string;
  category: CategoryMonitor | null;
  keyword: Pick<KeywordMonitor, "id" | "keyword" | "marketplace"> | null;
  brandByName: Map<string, BrandMatrixSnapshot>;
  brandTop100ShareChangeByName: Map<string, number>;
  coreCompetitorRising3DaysByAsin: Set<string>;
  competitorsByAsin: Map<string, CompetitorPoolItem>;
  watchByAsin: Map<string, AsinWatchState>;
}

export interface CategoryInsightBuildContext extends InsightBuildContext {
  category: CategoryMonitor;
  keyword: null;
  medianReviewChange: number | null;
}
