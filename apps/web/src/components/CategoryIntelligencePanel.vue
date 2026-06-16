<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category";
import CategoryFocusQueuePanel from "./CategoryFocusQueuePanel.vue";
import CategoryOverviewStage from "./CategoryOverviewStage.vue";
import CategorySignalIntensityPanel from "./CategorySignalIntensityPanel.vue";

const store = useCategoryStore();
const {
  selectedCategory,
  categories,
  topCategorySnapshots,
  topBrandMatrix,
  categorySignals,
  filteredActivityEvents,
  visibleActionInsights,
  badBsrQuality,
  bsrQuality,
  bsrRankChanges,
  priceHistory
} = storeToRefs(store);
</script>

<template>
  <CategoryOverviewStage
    :selected-category="selectedCategory"
    :category-count="categories.length"
    :top-category-snapshots="topCategorySnapshots"
    :top-brand-matrix="topBrandMatrix"
    :category-signals="categorySignals"
    :filtered-activity-events="filteredActivityEvents"
    :visible-action-insights="visibleActionInsights"
    :bad-bsr-quality="badBsrQuality"
    :bsr-quality="bsrQuality"
    :bsr-rank-changes="bsrRankChanges"
    :price-history="priceHistory"
  />

  <CategoryFocusQueuePanel :filtered-activity-events="filteredActivityEvents" :visible-action-insights="visibleActionInsights" />

  <CategorySignalIntensityPanel :top-brand-matrix="topBrandMatrix" :category-signals="categorySignals" />
</template>
