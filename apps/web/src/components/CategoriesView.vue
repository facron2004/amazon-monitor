<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import type { CategoryMonitor } from "@amazon-monitor/shared";
import {
  useCategoryDailyBriefing,
  type LaneEvent,
} from "../composables/useCategoryDailyBriefing";
import { useCategoryStore } from "../stores/category";
import CategoryBoardPanel from "./CategoryBoardPanel.vue";
import CategoryDailyBriefingDrawer from "./CategoryDailyBriefingDrawer.vue";
import CategoryHeader from "./categories/CategoryHeader.vue";
import CategoryDiffPanel from "./categories/CategoryDiffPanel.vue";
import CategoryInsightStrip from "./categories/CategoryInsightStrip.vue";
import CategoryKpiCards from "./categories/CategoryKpiCards.vue";
import CategoryLanePanel from "./categories/CategoryLanePanel.vue";
import ProductDetailDrawer from "./categories/ProductDetailDrawer.vue";
import ProductResearchAgentPanel from "./categories/ProductResearchAgentPanel.vue";

interface Props {
  date: string;
  collecting: boolean;
}

interface Emits {
  (e: "run-category-collection", categoryId?: number): void;
  (e: "toggle-category", category: CategoryMonitor): void;
  (e: "create-category"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useCategoryStore();
const { categories, selectedCategoryId } = storeToRefs(store);

const categoryDataIsFallback = computed(
  () => store.categoryDataDate !== props.date,
);
const selectedAsin = ref<string | null>(null);
const selectedCategoryName = computed(
  () =>
    categories.value.find((item) => item.id === selectedCategoryId.value)
      ?.name ?? "",
);

const {
  moversEvents,
  promotionsEvents,
  fadingEvents,
  reviewGrowthTopBrands,
  currentKpiSnapshot,
  yesterdayKpiDelta,
  priceDropTopItems,
  allInsightCards,
  drawer,
  formatRankDelta,
  formatPriceDelta,
  brandJudgement,
  openExternal,
} = useCategoryDailyBriefing();

const moversCount = computed(() => currentKpiSnapshot.value.movers);
const promotionsCount = computed(() => currentKpiSnapshot.value.promotions);
const fadingCount = computed(() => currentKpiSnapshot.value.fading);
const reviewGrowthCount = computed(() => currentKpiSnapshot.value.reviewGrowth);

// mini-table rows: 每个 lane 末尾的 4 行明细
function laneTableRows(
  events: LaneEvent[],
): { label: string; value: string }[] {
  return events.slice(0, 4).map((lane) => ({
    label: lane.asin ?? lane.brand,
    value: lane.changeLabel,
  }));
}

const moversTableRows = computed(() => laneTableRows(moversEvents.value));
const promotionsTableRows = computed(() =>
  laneTableRows(promotionsEvents.value),
);
const fadingTableRows = computed(() => laneTableRows(fadingEvents.value));

// 洞察行:风险提示 = fadingEvents 前 3 个 ASIN
const fadingAlertItems = computed<LaneEvent[]>(() =>
  fadingEvents.value.slice(0, 3),
);

function handleSelectCategory(id: number): void {
  store.selectedCategoryId = id;
  void store.loadCategoryDetail(props.date);
}

function handleRunCollection(categoryId?: number): void {
  emit("run-category-collection", categoryId);
}

function handleToggleCategory(category: CategoryMonitor): void {
  emit("toggle-category", category);
}

function handleCreateCategory(): void {
  emit("create-category");
}

function handleSelectAsin(asin: string): void {
  selectedAsin.value = asin;
}

function handleInsightJump(payload: { brand: string | null }): void {
  if (payload.brand) {
    store.categoryBrandFilter = payload.brand;
  } else {
    // 价格下降 / 风险两条点击时默认开启 Deal-Coupon 过滤,落地即可看带活动的 ASIN
    store.dealCouponFilter = "with-promotion";
  }
  // 平滑滚到 BSR 表格锚点(由 CategoryBoardPanel 的 id="category-board" 提供)
  const target =
    typeof document !== "undefined"
      ? document.querySelector("#category-board")
      : null;
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function handleLaneSelect(eventKey: string): void {
  const card = allInsightCards.value.find((item) => item.key === eventKey);
  if (card) {
    drawer.value = { mode: "event", item: card };
  }
}
</script>

<template>
  <section class="view category-view">
    <CategoryHeader
      :date="props.date"
      :collecting="props.collecting"
      :selected-category-id="selectedCategoryId"
      :selected-category-name="selectedCategoryName"
      :category-data-is-fallback="categoryDataIsFallback"
      @update:selected-category-id="handleSelectCategory"
      @run-category-collection="handleRunCollection"
      @toggle-category="handleToggleCategory"
      @create-category="handleCreateCategory"
    />

    <CategoryKpiCards
      :movers-count="moversCount"
      :promotions-count="promotionsCount"
      :fading-count="fadingCount"
      :review-growth-count="reviewGrowthCount"
      :yesterday-delta="yesterdayKpiDelta"
    />

    <div class="category-view-lanes">
      <CategoryLanePanel
        tone="movers"
        title="Movers"
        :count="moversCount"
        explainer="新进 / 上升 / 品牌矩阵变化"
        :events="moversEvents"
        mini-table-title="Movement 详情"
        :mini-table-rows="moversTableRows"
        empty-text="无 Movers 事件"
        @select="handleLaneSelect"
      />
      <CategoryLanePanel
        tone="promotions"
        title="Promotions"
        :count="promotionsCount"
        explainer="Coupon / Deal / 价格下降"
        :events="promotionsEvents"
        mini-table-title="Activity 详情"
        :mini-table-rows="promotionsTableRows"
        empty-text="无 Promotions 事件"
        @select="handleLaneSelect"
      />
      <CategoryLanePanel
        tone="fading"
        title="Fading"
        :count="fadingCount"
        explainer="Coupon 结束 / Deal 结束 / Rank 下滑"
        :events="fadingEvents"
        mini-table-title="Movement 详情"
        :mini-table-rows="fadingTableRows"
        empty-text="无 Fading 事件"
        @select="handleLaneSelect"
      />
    </div>

    <CategoryInsightStrip
      :review-growth-top-brands="reviewGrowthTopBrands"
      :price-drop-top-items="priceDropTopItems"
      :fading-alert-items="fadingAlertItems"
      @jump-to-board="handleInsightJump"
    />

    <ProductResearchAgentPanel :date="props.date" />

    <CategoryDiffPanel @select-asin="handleSelectAsin" />

    <CategoryBoardPanel @select-asin="handleSelectAsin" />

    <CategoryDailyBriefingDrawer
      v-model:drawer="drawer"
      :format-rank-delta="formatRankDelta"
      :format-price-delta="formatPriceDelta"
      :brand-judgement="brandJudgement"
      :open-external="openExternal"
    />

    <ProductDetailDrawer :asin="selectedAsin" @close="selectedAsin = null" />
  </section>
</template>

<style scoped>
.category-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.category-view-lanes {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 1000px) {
  .category-view-lanes {
    grid-template-columns: 1fr;
  }
}
</style>
