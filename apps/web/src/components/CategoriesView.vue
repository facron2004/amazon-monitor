<script setup lang="ts">
import { computed } from "vue";
import { useCategoryStore } from "../stores/category";
import CategoryActivityPanel from "./CategoryActivityPanel.vue";
import CategoryBoardPanel from "./CategoryBoardPanel.vue";
import CategoryBrandMatrixPanel from "./CategoryBrandMatrixPanel.vue";
import CategoryIntelligencePanel from "./CategoryIntelligencePanel.vue";
import CategoryInsightsPanel from "./CategoryInsightsPanel.vue";
import CategoryMonitorPanel from "./CategoryMonitorPanel.vue";
import CategoryMovementPanel from "./CategoryMovementPanel.vue";
import CategoryPriceHistoryPanel from "./CategoryPriceHistoryPanel.vue";
import CategoryQualityPanel from "./CategoryQualityPanel.vue";
import CategorySignalsPanel from "./CategorySignalsPanel.vue";
import CategorySummaryMetrics from "./CategorySummaryMetrics.vue";
import ReviewGrowthPanel from "./ReviewGrowthPanel.vue";

interface Props {
  date: string;
  collecting: boolean;
}

interface Emits {
  (e: "run-category-collection", categoryId?: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useCategoryStore();

const categoryDataIsFallback = computed(() => store.categoryDataDate !== props.date);
</script>

<template>
  <section class="view">
    <CategoryMonitorPanel
      id="category-monitor"
      class="category-anchor"
      :collecting="collecting"
      :category-data-is-fallback="categoryDataIsFallback"
      @run-category-collection="emit('run-category-collection', $event)"
    />

    <CategoryIntelligencePanel />

    <CategorySummaryMetrics
      id="category-metrics"
      class="category-anchor"
    />

    <ReviewGrowthPanel
      id="category-review-growth"
      class="category-anchor"
    />

    <div id="category-signal" class="split category-info-grid category-anchor">
      <CategoryBrandMatrixPanel />
      <CategorySignalsPanel />
    </div>

    <CategoryBoardPanel />

    <CategoryQualityPanel />

    <CategoryMovementPanel />

    <CategoryInsightsPanel />

    <CategoryActivityPanel />

    <CategoryPriceHistoryPanel />
  </section>
</template>
