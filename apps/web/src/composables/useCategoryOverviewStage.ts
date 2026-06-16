import { computed } from "vue";
import type {
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrRankChange,
  BsrSnapshotQuality,
  CategoryMonitor,
  CategorySignalLog,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import {
  buildCommandStories,
  buildFlowSections,
  buildHeroDetail,
  buildOverviewBands,
  countHighPriorityItems,
  countHighPrioritySignals,
  countPromoActive,
  findSteepestRankMove,
  findStrongestBrand
} from "../utils/category-overview-stage";

export interface CategoryOverviewStageSource {
  selectedCategory: CategoryMonitor | null;
  categoryCount: number;
  topCategorySnapshots: BestsellerRankSnapshot[];
  topBrandMatrix: BrandMatrixSnapshot[];
  categorySignals: CategorySignalLog[];
  filteredActivityEvents: CompetitorActivityEvent[];
  visibleActionInsights: CompetitorActionInsight[];
  badBsrQuality: BsrSnapshotQuality[];
  bsrQuality: BsrSnapshotQuality[];
  bsrRankChanges: BsrRankChange[];
  priceHistory: ProductPriceHistory[];
}

export function useCategoryOverviewStage(source: CategoryOverviewStageSource) {
  const trackedCount = computed(() => source.topCategorySnapshots.length);
  const promoActiveCount = computed(() => countPromoActive(source.topCategorySnapshots));
  const strongestBrand = computed(() => findStrongestBrand(source.topBrandMatrix));
  const highestPrioritySignals = computed(() => countHighPrioritySignals(source.categorySignals));
  const highestPriorityItems = computed(() => countHighPriorityItems(source.filteredActivityEvents, source.visibleActionInsights));
  const steepestRankMove = computed(() => findSteepestRankMove(source.bsrRankChanges));

  const overviewBands = computed(() =>
    buildOverviewBands({
      trackedCount: trackedCount.value,
      promoActiveCount: promoActiveCount.value,
      strongestBrand: strongestBrand.value,
      highestPrioritySignals: highestPrioritySignals.value,
      highestPriorityItems: highestPriorityItems.value,
      filteredActivityEventCount: source.filteredActivityEvents.length,
      visibleActionInsightCount: source.visibleActionInsights.length,
      bsrQuality: source.bsrQuality,
      badBsrQuality: source.badBsrQuality
    })
  );

  const heroDetail = computed(() => buildHeroDetail(strongestBrand.value));

  const commandStories = computed(() =>
    buildCommandStories({
      steepestRankMove: steepestRankMove.value,
      promoActiveCount: promoActiveCount.value,
      trackedCount: trackedCount.value,
      badBsrQualityCount: source.badBsrQuality.length
    })
  );

  const flowSections = computed(() =>
    buildFlowSections({
      categoryCount: source.categoryCount,
      topBrandCount: source.topBrandMatrix.length,
      signalCount: source.categorySignals.length,
      trackedCount: source.topCategorySnapshots.length,
      badBsrQualityCount: source.badBsrQuality.length,
      activityEventCount: source.filteredActivityEvents.length,
      priceHistoryCount: source.priceHistory.length
    })
  );

  return {
    strongestBrand,
    heroDetail,
    commandStories,
    overviewBands,
    flowSections
  };
}
