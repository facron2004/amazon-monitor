<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ChevronLeft, ChevronRight, Search } from "@lucide/vue";
import type { KeywordRankMatrixProductKind } from "@amazon-monitor/shared";
import { useKeywordStore } from "../../stores/keyword";

type KindFilter = "all" | KeywordRankMatrixProductKind;

const store = useKeywordStore();
const { rankMatrix, rankMatrixLoading, rankMatrixError } = storeToRefs(store);
const query = ref("");
const kind = ref<KindFilter>("all");
const page = ref(1);
const pageSize = 10;

const filteredProducts = computed(() => {
  const normalized = query.value.trim().toLowerCase();
  return (rankMatrix.value?.products ?? []).filter((product) => {
    if (kind.value !== "all" && product.kind !== kind.value) return false;
    if (!normalized) return true;
    return [product.asin, product.title, product.brand ?? ""].some((value) => value.toLowerCase().includes(normalized));
  });
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredProducts.value.length / pageSize)));
const products = computed(() => filteredProducts.value.slice((page.value - 1) * pageSize, page.value * pageSize));

watch([query, kind], () => {
  page.value = 1;
});

const cellIndex = computed(() => new Map(
  (rankMatrix.value?.rows ?? []).map((row) => [
    row.keywordId,
    new Map(row.cells.map((cell) => [cell.productKey, cell]))
  ])
));

const rows = computed(() => (rankMatrix.value?.rows ?? []).map((row) => ({
  row,
  cells: products.value.map((product) => ({
    product,
    cell: cellIndex.value.get(row.keywordId)?.get(product.key) ?? null
  }))
})));

function rankLabel(rank: number | null): string {
  return rank === null ? "—" : `#${rank}`;
}

function changeLabel(change: number | null): string {
  if (change === null) return "7日 —";
  if (change === 0) return "7日 持平";
  return `7日 ${change > 0 ? "+" : ""}${change}`;
}
</script>

<template>
  <section class="panel rank-matrix-panel">
    <div class="panel-head matrix-head">
      <div>
        <h2>关键词排名矩阵</h2>
        <span v-if="rankMatrix?.date">
          快照 {{ rankMatrix.date }} · 昨日 {{ rankMatrix.previousDate }} · 7日前 {{ rankMatrix.sevenDayDate }}
        </span>
        <span v-else>暂无可用关键词快照</span>
      </div>
      <div class="matrix-legend">
        <span v-if="rankMatrix?.isFallback" class="matrix-stale">请求 {{ rankMatrix.requestedDate }}</span>
        <span title="当前采集器未返回 Amazon Choice 与 Best Seller 徽标">Choice / Best Seller 未采集</span>
      </div>
    </div>

    <div class="matrix-toolbar">
      <label class="matrix-search">
        <Search :size="15" />
        <input v-model="query" placeholder="搜索 ASIN、标题或品牌" />
      </label>
      <div class="matrix-segmented" aria-label="商品归属筛选">
        <button v-for="option in ([['all', '全部'], ['owned', '自营'], ['competitor', '竞品']] as const)" :key="option[0]" type="button" :class="{ active: kind === option[0] }" @click="kind = option[0]">
          {{ option[1] }}
        </button>
      </div>
      <div v-if="filteredProducts.length > pageSize" class="matrix-page-controls">
        <span>{{ (page - 1) * pageSize + 1 }}-{{ Math.min(page * pageSize, filteredProducts.length) }} / {{ filteredProducts.length }}</span>
        <button class="icon-button" type="button" title="上一组商品" :disabled="page === 1" @click="page--">
          <ChevronLeft :size="15" />
        </button>
        <button class="icon-button" type="button" title="下一组商品" :disabled="page === pageCount" @click="page++">
          <ChevronRight :size="15" />
        </button>
      </div>
    </div>

    <div v-if="rankMatrixLoading" class="matrix-state">正在聚合排名快照...</div>
    <div v-else-if="rankMatrixError" class="matrix-state matrix-error">{{ rankMatrixError }}</div>
    <div v-else-if="!rankMatrix?.date || rankMatrix.products.length === 0" class="matrix-state">
      当前快照中没有出现已登记的自营或竞品 ASIN。
    </div>
    <div v-else-if="products.length === 0" class="matrix-state">没有符合筛选条件的商品。</div>

    <div v-else class="matrix-scroll">
      <table class="rank-matrix-table">
        <thead>
          <tr>
            <th class="matrix-keyword-column">关键词</th>
            <th v-for="product in products" :key="product.key" class="matrix-product-column">
              <div class="matrix-product-head">
                <span :class="['matrix-kind', product.kind]">{{ product.kind === "owned" ? "自营" : "竞品" }}</span>
                <strong>{{ product.asin }}</strong>
                <small>{{ product.brand || "未知品牌" }}</small>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in rows" :key="entry.row.keywordId">
            <th class="matrix-keyword-column" scope="row">
              <strong>{{ entry.row.keyword }}</strong>
              <small>{{ entry.row.categoryTag || entry.row.marketplace }}</small>
            </th>
            <td v-for="item in entry.cells" :key="item.product.key">
              <div v-if="item.cell" class="matrix-cell">
                <div class="matrix-ranks">
                  <strong>{{ rankLabel(item.cell.currentOrganicRank) }}</strong>
                  <span>昨日 {{ rankLabel(item.cell.previousOrganicRank) }}</span>
                  <span :class="{ positive: (item.cell.sevenDayRankChange ?? 0) > 0, negative: (item.cell.sevenDayRankChange ?? 0) < 0 }">
                    {{ changeLabel(item.cell.sevenDayRankChange) }}
                  </span>
                </div>
                <div class="matrix-signals">
                  <span v-if="item.cell.isSponsored" title="当前快照出现广告位">AD {{ rankLabel(item.cell.sponsoredRank) }}</span>
                  <span v-if="item.cell.hasBestsellerRank" title="采集到 BSR 排名记录">BSR</span>
                  <span v-if="item.cell.hasCoupon">Coupon</span>
                  <span v-if="item.cell.hasDeal">Deal</span>
                </div>
              </div>
              <span v-else class="matrix-empty">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.rank-matrix-panel { padding: 14px; }
.matrix-head { align-items: flex-start; }
.matrix-head > div:first-child { display: grid; gap: 4px; }
.matrix-head span { color: #6e6e73; font-size: 12px; }
.matrix-legend { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.matrix-legend span { padding: 4px 7px; border: 1px solid rgba(29, 29, 31, .09); border-radius: 6px; background: #f7f7f9; }
.matrix-legend .matrix-stale { background: #fff8e5; color: #713f12; }
.matrix-toolbar { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.matrix-search { display: flex; align-items: center; gap: 7px; width: min(360px, 100%); padding-left: 10px; border: 1px solid rgba(29, 29, 31, .09); border-radius: 6px; background: #fff; color: #86868b; }
.matrix-search input { min-height: 34px; padding-left: 0; border: 0; box-shadow: none; }
.matrix-segmented { display: flex; padding: 2px; border-radius: 6px; background: #f2f2f7; }
.matrix-segmented button { min-height: 30px; padding: 0 12px; border: 0; box-shadow: none; background: transparent; font-size: 12px; }
.matrix-segmented button.active { background: #fff; color: #0071e3; box-shadow: 0 1px 3px rgba(0, 0, 0, .08); }
.matrix-page-controls { display: flex; align-items: center; gap: 4px; margin-left: auto; color: #6e6e73; font-size: 11px; white-space: nowrap; }
.matrix-page-controls button { width: 30px; min-height: 30px; padding: 0; box-shadow: none; }
.matrix-state { display: grid; place-items: center; min-height: 120px; color: #86868b; font-size: 13px; }
.matrix-error { color: #991b1b; }
.matrix-scroll { overflow: auto; border: 1px solid rgba(29, 29, 31, .09); border-radius: 8px; }
.rank-matrix-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; }
.rank-matrix-table th, .rank-matrix-table td { padding: 9px 10px; }
.matrix-keyword-column { position: sticky; left: 0; z-index: 2; width: 190px; min-width: 190px; background: #fbfbfd; }
thead .matrix-keyword-column { z-index: 4; }
.matrix-keyword-column strong, .matrix-keyword-column small { display: block; }
.matrix-keyword-column strong { color: #1d1d1f; font-size: 13px; }
.matrix-keyword-column small { margin-top: 3px; color: #86868b; font-size: 11px; font-weight: 500; }
.matrix-product-column { width: 176px; min-width: 176px; }
.matrix-product-head { display: grid; gap: 3px; }
.matrix-product-head strong { color: #1d1d1f; font-size: 12px; }
.matrix-product-head small { overflow: hidden; color: #86868b; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.matrix-kind { width: max-content; padding: 2px 5px; border-radius: 4px; background: #f2f2f7; color: #515154; font-size: 10px; }
.matrix-kind.owned { background: #e8f2ff; color: #005bb5; }
.matrix-cell { display: grid; gap: 7px; min-height: 61px; }
.matrix-ranks { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; align-items: baseline; }
.matrix-ranks strong { grid-row: span 2; color: #1d1d1f; font-size: 18px; }
.matrix-ranks span { color: #86868b; font-size: 10px; white-space: nowrap; }
.matrix-ranks .positive { color: #166534; }
.matrix-ranks .negative { color: #991b1b; }
.matrix-signals { display: flex; flex-wrap: wrap; gap: 4px; }
.matrix-signals span { padding: 2px 4px; border-radius: 4px; background: #f2f2f7; color: #515154; font-size: 9px; font-weight: 700; }
.matrix-empty { color: #c7c7cc; }
@media (max-width: 760px) {
  .matrix-toolbar { align-items: stretch; flex-direction: column; }
  .matrix-search { width: 100%; }
  .matrix-segmented button { flex: 1; }
  .matrix-page-controls { justify-content: flex-end; margin-left: 0; }
  .matrix-keyword-column { width: 142px; min-width: 142px; }
  .matrix-product-column { width: 156px; min-width: 156px; }
}
</style>
