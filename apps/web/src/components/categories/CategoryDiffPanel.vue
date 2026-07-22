<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ArrowDown, ArrowUp, Minus } from "@lucide/vue";
import { isoDateOffset, type CategorySnapshotDiffItem, type CategorySnapshotDiffType } from "@amazon-monitor/shared";
import { useCategoryStore } from "../../stores/category";
import { formatCount, formatMoney, imgFallback } from "../../utils/formatters";

type DiffPeriod = "1" | "7" | "30" | "custom";
type DiffFilter = "all" | CategorySnapshotDiffType | "promotion";

const emit = defineEmits<{ selectAsin: [asin: string] }>();
const store = useCategoryStore();
const { categoryDataDate, categoryDiff, categoryDiffError, categoryDiffLoading, selectedCategoryId } = storeToRefs(store);
const period = ref<DiffPeriod>("7");
const customCompareDate = ref("");
const filter = ref<DiffFilter>("all");

const compareDate = computed(() => {
  if (!categoryDataDate.value) return "";
  if (period.value === "custom") return customCompareDate.value;
  return isoDateOffset(categoryDataDate.value, -Number(period.value));
});

const maxCompareDate = computed(() => categoryDataDate.value ? isoDateOffset(categoryDataDate.value, -1) : "");
const items = computed(() => categoryDiff.value?.items ?? []);
const filteredItems = computed(() => items.value.filter((item) => matchesFilter(item, filter.value)));
const summary = computed(() => ({
  newEntries: countType(items.value, "new_entry"),
  dropped: countType(items.value, "dropped"),
  rankMoves: items.value.filter((item) => item.changeTypes.includes("rank_up") || item.changeTypes.includes("rank_down")).length,
  commercial: items.value.filter((item) => item.changeTypes.some((type) => ["price_changed", "coupon_changed", "deal_changed"].includes(type))).length
}));

watch([selectedCategoryId, categoryDataDate, compareDate], () => {
  if (period.value === "custom" && (!customCompareDate.value || customCompareDate.value > maxCompareDate.value)) return;
  void store.loadCategoryDiff(compareDate.value);
}, { immediate: true });

function selectPeriod(value: DiffPeriod): void {
  if (value === "custom" && !customCompareDate.value && categoryDataDate.value) {
    customCompareDate.value = isoDateOffset(categoryDataDate.value, -7);
  }
  period.value = value;
}

function handleCustomDate(event: Event): void {
  customCompareDate.value = (event.target as HTMLInputElement).value;
  period.value = "custom";
}

function matchesFilter(item: CategorySnapshotDiffItem, value: DiffFilter): boolean {
  if (value === "all") return true;
  if (value === "promotion") {
    return item.changeTypes.includes("coupon_changed") || item.changeTypes.includes("deal_changed");
  }
  return item.changeTypes.includes(value);
}

function countType(itemsToCount: CategorySnapshotDiffItem[], type: CategorySnapshotDiffType): number {
  return itemsToCount.filter((item) => item.changeTypes.includes(type)).length;
}

function rankDelta(item: CategorySnapshotDiffItem): string {
  if (item.rankChange === null) return "";
  if (item.rankChange === 0) return "持平";
  return `${item.rankChange > 0 ? "+" : ""}${item.rankChange}`;
}

function signedMoney(change: number): string {
  if (change === 0) return formatMoney(0);
  return `${change > 0 ? "+" : "-"}${formatMoney(Math.abs(change))}`;
}

function changeLabel(type: CategorySnapshotDiffType): string {
  const labels: Record<CategorySnapshotDiffType, string> = {
    new_entry: "新进榜",
    dropped: "掉榜",
    rank_up: "排名上升",
    rank_down: "排名下降",
    price_changed: "价格变化",
    coupon_changed: "Coupon 变化",
    deal_changed: "Deal 变化",
    review_growth: "Review 增长"
  };
  return labels[type];
}
</script>

<template>
  <section class="panel dense-panel category-diff-panel">
    <div class="panel-head diff-head">
      <div class="panel-head-copy">
        <h2>榜单 Diff</h2>
        <p class="panel-caption">对比两个快照日期，集中查看新进、掉榜、排名与经营动作变化。</p>
      </div>
      <span class="panel-head-meta">{{ compareDate || "-" }} → {{ categoryDataDate || "-" }}</span>
    </div>

    <div class="diff-controls">
      <div class="diff-periods" aria-label="对比周期">
        <button v-for="value in ['1', '7', '30'] as DiffPeriod[]" :key="value" type="button" :class="{ active: period === value }" @click="selectPeriod(value)">
          {{ value }} 日
        </button>
        <button type="button" :class="{ active: period === 'custom' }" @click="selectPeriod('custom')">自定义</button>
      </div>
      <input type="date" :value="compareDate" :max="maxCompareDate" aria-label="对比日期" @change="handleCustomDate" />
      <select v-model="filter" aria-label="Diff 类型">
        <option value="all">全部变化</option>
        <option value="new_entry">新进榜</option>
        <option value="dropped">掉榜</option>
        <option value="rank_up">排名上升</option>
        <option value="rank_down">排名下降</option>
        <option value="price_changed">价格变化</option>
        <option value="promotion">Coupon / Deal</option>
        <option value="review_growth">Review 增长</option>
      </select>
    </div>

    <div class="diff-summary" aria-label="Diff 汇总">
      <span><b>{{ summary.newEntries }}</b> 新进</span>
      <span><b>{{ summary.dropped }}</b> 掉榜</span>
      <span><b>{{ summary.rankMoves }}</b> 排名异动</span>
      <span><b>{{ summary.commercial }}</b> 价格活动变化</span>
    </div>

    <p v-if="categoryDiffError" class="diff-state diff-state--error" role="alert">{{ categoryDiffError }}</p>
    <p v-else-if="categoryDiffLoading" class="diff-state">正在计算榜单差异…</p>
    <p v-else-if="!categoryDiff?.compareCount" class="diff-state">对比日期暂无榜单快照，请选择有采集记录的日期。</p>
    <p v-else-if="filteredItems.length === 0" class="diff-state">当前筛选下没有变化。</p>

    <div v-else class="table-wrap compact-scroll diff-table-wrap">
      <table>
        <thead>
          <tr>
            <th>变化类型</th>
            <th>商品</th>
            <th>排名</th>
            <th>价格</th>
            <th>Coupon / Deal</th>
            <th>Reviews</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredItems" :key="`${item.marketplace}:${item.asin}`" class="diff-row" @click="emit('selectAsin', item.asin)">
            <td class="diff-types">
              <span v-for="type in item.changeTypes" :key="type" :class="['diff-tag', `diff-tag--${type}`]">{{ changeLabel(type) }}</span>
            </td>
            <td>
              <div class="diff-product">
                <img :src="item.imageUrl" :alt="item.title" loading="lazy" @error="imgFallback" />
                <div><strong>{{ item.asin }}</strong><span>{{ item.title }}</span><small>{{ item.brand || "未知品牌" }}</small></div>
              </div>
            </td>
            <td>
              <div class="diff-value">
                <span>{{ item.previousRank ? `#${item.previousRank}` : "未上榜" }} → {{ item.currentRank ? `#${item.currentRank}` : "掉榜" }}</span>
                <b v-if="item.rankChange !== null" :class="item.rankChange > 0 ? 'up' : item.rankChange < 0 ? 'down' : ''">
                  <ArrowUp v-if="item.rankChange > 0" :size="12" />
                  <ArrowDown v-else-if="item.rankChange < 0" :size="12" />
                  <Minus v-else :size="12" />
                  {{ rankDelta(item) }}
                </b>
              </div>
            </td>
            <td><div class="diff-value"><span>{{ formatMoney(item.previousPrice) }} → {{ formatMoney(item.currentPrice) }}</span><b v-if="item.priceChange !== null && item.changeTypes.includes('price_changed')">{{ signedMoney(item.priceChange) }}</b></div></td>
            <td class="diff-promo">
              <small>Coupon：{{ item.previousCoupon || "-" }} → {{ item.currentCoupon || "-" }}</small>
              <small>Deal：{{ item.previousDeal || "-" }} → {{ item.currentDeal || "-" }}</small>
            </td>
            <td><div class="diff-value"><span>{{ formatCount(item.previousReviewCount) }} → {{ formatCount(item.currentReviewCount) }}</span><b v-if="item.reviewCountChange !== null && item.reviewCountChange > 0" class="up">+{{ formatCount(item.reviewCountChange) }}</b></div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.diff-head { align-items: flex-end; }
.diff-controls { display: grid; gap: 8px; grid-template-columns: auto 150px minmax(150px, 220px); margin-bottom: 10px; }
.diff-controls input, .diff-controls select { background: #fff; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font: inherit; font-size: 12px; padding: 6px 9px; }
.diff-periods { background: #f1f5f9; border-radius: 7px; display: inline-flex; padding: 3px; }
.diff-periods button { background: transparent; border: 0; border-radius: 5px; color: var(--text-muted); cursor: pointer; font-size: 12px; font-weight: 600; padding: 5px 10px; }
.diff-periods button.active { background: #fff; box-shadow: 0 1px 2px rgb(15 23 42 / 12%); color: var(--text-primary); }
.diff-summary { align-items: center; border-bottom: 1px solid var(--border-color); border-top: 1px solid var(--border-color); display: flex; flex-wrap: wrap; gap: 8px 22px; margin-bottom: 8px; padding: 8px 2px; }
.diff-summary span { color: var(--text-muted); font-size: 11.5px; }
.diff-summary b { color: var(--text-primary); font-size: 14px; margin-right: 3px; }
.diff-state { color: var(--text-muted); font-size: 12.5px; margin: 0; padding: 22px 8px; text-align: center; }
.diff-state--error { color: #b91c1c; }
.diff-table-wrap { max-height: 520px; }
.diff-table-wrap table { min-width: 1040px; }
.diff-row { cursor: pointer; }
.diff-types { max-width: 150px; }
.diff-tag { border-radius: 4px; display: inline-block; font-size: 10px; font-weight: 600; margin: 1px 3px 1px 0; padding: 2px 5px; white-space: nowrap; }
.diff-tag--new_entry, .diff-tag--rank_up, .diff-tag--review_growth { background: #ecfdf5; color: #047857; }
.diff-tag--dropped, .diff-tag--rank_down { background: #fef2f2; color: #b91c1c; }
.diff-tag--price_changed, .diff-tag--coupon_changed, .diff-tag--deal_changed { background: #fff7ed; color: #b45309; }
.diff-product { align-items: center; display: flex; gap: 8px; min-width: 270px; }
.diff-product img { height: 38px; object-fit: contain; width: 38px; }
.diff-product div, .diff-value { align-items: flex-start; display: flex; flex-direction: column; gap: 2px; }
.diff-product strong { font-size: 11.5px; }
.diff-product span { display: block; font-size: 11px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-product small, .diff-promo small { color: var(--text-muted); font-size: 10.5px; }
.diff-value span { font-size: 11.5px; white-space: nowrap; }
.diff-value b { align-items: center; color: var(--text-secondary); display: inline-flex; font-size: 10.5px; gap: 2px; }
.diff-value .up { color: #15803d; }
.diff-value .down { color: #b91c1c; }
.diff-promo { max-width: 230px; }
.diff-promo small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 720px) {
  .diff-head { align-items: flex-start; }
  .diff-controls { grid-template-columns: 1fr 1fr; }
  .diff-periods { grid-column: 1 / -1; overflow-x: auto; }
  .diff-periods button { flex: 1 0 auto; }
  .diff-summary { gap: 7px 14px; }
}
</style>
