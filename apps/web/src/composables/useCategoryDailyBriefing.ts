import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category.js";
import type {
  CategoryBriefingIcons,
  DrawerState,
} from "../types/category-daily-briefing.js";
import { compactText, levelWeight } from "../utils/category-intelligence.js";
import {
  brandJudgement,
  formatPriceDelta,
  formatRankDelta,
  rankPath,
} from "../utils/categoryDailyBriefing.js";
import {
  changeLabel,
  formatMoney,
  formatSignedCount,
  imgFallback,
  localizeGeneratedText,
  promoText,
} from "../utils/formatters.js";
import { useCategoryBattleBriefing } from "./useCategoryBattleBriefing.js";
import { useCategoryInsightCards } from "./useCategoryInsightCards.js";
import { useCategorySignalLanes } from "./useCategorySignalLanes.js";

function openExternal(url: string | null | undefined): void {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

export function useCategoryDailyBriefing(icons?: CategoryBriefingIcons) {
  const store = useCategoryStore();
  const {
    categoryDetail,
    selectedCategory,
    categoryDataDate,
    topBrandMatrix,
    activityEvents,
  } = storeToRefs(store);
  const drawer = ref<DrawerState>(null);
  const battle = useCategoryBattleBriefing(icons);
  const cards = useCategoryInsightCards();
  const yesterdayKpiSnapshot = computed(
    () => categoryDetail.value?.yesterdayKpiSnapshot ?? null,
  );
  const lanes = useCategorySignalLanes(
    activityEvents,
    categoryDataDate,
    yesterdayKpiSnapshot,
  );

  return {
    ...battle,
    ...cards,
    ...lanes,
    topBrandMatrix,
    selectedCategory,
    categoryDataDate,
    drawer,
    formatRankDelta,
    formatPriceDelta,
    brandJudgement,
    openExternal,
    imgFallback,
    rankPath,
    formatSignedCount,
    formatMoney,
    compactText,
    localizeGeneratedText,
    changeLabel,
    promoText,
  };
}

export { rankPath, compactText, levelWeight };
export type {
  BattleKpi,
  DrawerState,
  InsightCard,
  LaneEvent,
  OpportunityCard,
  ReviewGrowthBrandTotal,
} from "../types/category-daily-briefing.js";
