<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "@lucide/vue";
import type { CategoryRankWindow, DealCouponChoice } from "../stores/category";
import { useCategoryStore } from "../stores/category";
import { openCategoryProductByAsin } from "../utils/open-category-product";
import { formatCount, formatMoney, iceTypeLabel, imgFallback, promoText } from "../utils/formatters";

const store = useCategoryStore();
const {
  categoryDataDate,
  categoryDetail,
  categoryBrandOptions,
  categoryIceTypeOptions,
  categoryProductQuery,
  categoryBrandFilter,
  iceTypeFilter,
  dealCouponFilter,
  categoryRankWindow,
  bsrTablePage,
  bsrTablePageSize,
  selectedCategoryId
} = storeToRefs(store);

const DEAL_COUPON_OPTIONS: { value: DealCouponChoice; label: string }[] = [
  { value: "all", label: "全部 Deal/Coupon" },
  { value: "with-promotion", label: "有活动" },
  { value: "coupon-only", label: "仅 Coupon" },
  { value: "deal-only", label: "仅 Deal" }
];

const RANK_WINDOW_OPTIONS: { value: CategoryRankWindow; label: string }[] = [
  { value: "top100", label: "Top 100" },
  { value: "top50", label: "Top 50" },
  { value: "top20", label: "Top 20" },
  { value: "all", label: "全部" }
];

const paged = computed(() => store.pagedCategorySnapshots);
const total = computed(() => paged.value.total);
const pageCount = computed(() => paged.value.pageCount);

watch(
  [categoryProductQuery, categoryBrandFilter, iceTypeFilter, dealCouponFilter, categoryRankWindow],
  () => {
    if (bsrTablePage.value !== 1) {
      store.setBsrTablePage(1);
    }
  }
);

function handleQueryInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  store.categoryProductQuery = target.value.trim();
}

function handleBrandChange(event: Event): void {
  store.categoryBrandFilter = (event.target as HTMLSelectElement).value;
}

function handleIceTypeChange(event: Event): void {
  store.iceTypeFilter = (event.target as HTMLSelectElement).value;
}

function handleDealCouponChange(event: Event): void {
  store.dealCouponFilter = (event.target as HTMLSelectElement).value as DealCouponChoice;
}

function handleRankWindowChange(event: Event): void {
  store.categoryRankWindow = (event.target as HTMLSelectElement).value as CategoryRankWindow;
}

function handlePageSizeChange(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (!Number.isNaN(value) && value > 0) {
    store.setBsrTablePageSize(value);
  }
}

function gotoPage(page: number): void {
  store.setBsrTablePage(page);
}

function handleRefresh(): void {
  store.setBsrTablePage(1);
}

function handleOpenProduct(asin: string): void {
  openCategoryProductByAsin(asin, selectedCategoryId.value);
}
</script>

<template>
  <section id="category-board" class="panel dense-panel bsr-board-panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>BSR 榜单</h2>
        <p class="panel-caption">先按品牌和排名范围收敛，再交叉查看 Deal/Coupon、评分和 Review 体量。</p>
      </div>
      <span class="panel-head-meta">
        {{ categoryDataDate || "—" }} · 展示 {{ total }} / {{ categoryDetail?.snapshots.length ?? 0 }} 个 ASIN
      </span>
    </div>

    <div class="panel-controls bsr-board-controls">
      <div class="bsr-board-search">
        <input
          :value="categoryProductQuery"
          placeholder="搜索 ASIN / 标题 / 品牌"
          @input="handleQueryInput"
        />
      </div>
      <select :value="categoryBrandFilter" @change="handleBrandChange">
        <option value="all">全部品牌</option>
        <option v-for="brand in categoryBrandOptions" :key="brand" :value="brand">{{ brand }}</option>
      </select>
      <select :value="iceTypeFilter" @change="handleIceTypeChange">
        <option value="all">全部 ICE TYPE</option>
        <option v-for="label in categoryIceTypeOptions" :key="label" :value="label">{{ label }}</option>
      </select>
      <select :value="dealCouponFilter" @change="handleDealCouponChange">
        <option v-for="option in DEAL_COUPON_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <select :value="categoryRankWindow" @change="handleRankWindowChange">
        <option v-for="option in RANK_WINDOW_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <button type="button" class="bsr-board-refresh" title="重置筛选" @click="handleRefresh">
        <RefreshCw :size="14" />
        <span>重置</span>
      </button>
    </div>

    <div class="table-wrap compact-scroll bsr-board-scroll">
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>商品信息</th>
            <th>品牌</th>
            <th class="ice-col">ICE TYPE</th>
            <th class="price-col">价格</th>
            <th class="promo-col">Deal/Coupon</th>
            <th class="rating-col">评分</th>
            <th class="review-col">Reviews</th>
            <th class="link-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in paged.rows" :key="item.asin">
            <td><strong>#{{ item.rank }}</strong></td>
            <td class="product-cell">
              <div class="product-cell-content">
                <img :src="item.imageUrl" :alt="item.title" loading="lazy" decoding="async" @error="imgFallback" />
                <div>
                  <strong>{{ item.asin }}</strong>
                  <span>{{ item.title }}</span>
                  <small v-if="promoText(item) !== '-'" class="promo-inline" :title="promoText(item)">Deal/Coupon：{{ promoText(item) }}</small>
                </div>
              </div>
            </td>
            <td>{{ item.brand || "未知品牌" }}</td>
            <td class="ice-col">{{ iceTypeLabel(item.iceType) }}</td>
            <td class="price-col">{{ formatMoney(item.currentPrice) }}</td>
            <td class="promo-col" :title="promoText(item)">{{ promoText(item) }}</td>
            <td class="rating-col">{{ item.rating || "-" }}</td>
            <td class="review-col">{{ formatCount(item.reviewCount) }}</td>
            <td class="link-col">
              <button class="icon-button" title="打开 Amazon" type="button" @click="handleOpenProduct(item.asin)">
                <ExternalLink :size="17" />
              </button>
            </td>
          </tr>
          <tr v-if="paged.rows.length === 0">
            <td colspan="9" class="bsr-board-empty">当前筛选下没有 ASIN，试试放宽品牌或排名范围。</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="bsr-board-pager">
      <div class="bsr-board-pager-pages">
        <button type="button" class="pager-nav" :disabled="paged.page <= 1" @click="gotoPage(paged.page - 1)">
          <ChevronLeft :size="14" />
        </button>
        <button
          v-for="page in pageCount"
          :key="page"
          type="button"
          :class="['pager-num', { 'pager-num--active': page === paged.page }]"
          @click="gotoPage(page)"
        >
          {{ page }}
        </button>
        <button type="button" class="pager-nav" :disabled="paged.page >= pageCount" @click="gotoPage(paged.page + 1)">
          <ChevronRight :size="14" />
        </button>
      </div>
      <div class="bsr-board-pager-right">
        <label>
          <select :value="bsrTablePageSize" @change="handlePageSizeChange">
            <option v-for="size in [10, 20, 50, 100]" :key="size" :value="size">{{ size }} 条/页</option>
          </select>
        </label>
        <span class="pager-jump">
          跳至
          <input
            type="number"
            min="1"
            :max="pageCount"
            :value="paged.page"
            @change="(event) => gotoPage(Number((event.target as HTMLInputElement).value))"
          />
        </span>
        <span class="pager-meta">/ {{ pageCount }} 页</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bsr-board-controls {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1.4fr) repeat(4, minmax(0, 1fr)) auto;
}

.bsr-board-refresh {
  align-items: center;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary, #475569);
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  gap: 4px;
  padding: 6px 10px;
}

.bsr-board-refresh:hover {
  background: #f1f5f9;
}

.bsr-board-empty {
  color: var(--text-muted, #64748b);
  font-size: 12.5px;
  padding: 24px 12px;
  text-align: center;
}

.bsr-board-pager {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 4px 0;
}

.bsr-board-pager-pages {
  display: inline-flex;
  gap: 4px;
}

.pager-num,
.pager-nav {
  align-items: center;
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary, #475569);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  height: 26px;
  justify-content: center;
  min-width: 26px;
  padding: 0 8px;
}

.pager-num:hover,
.pager-nav:hover:not(:disabled) {
  background: #f1f5f9;
  color: var(--color-primary, #2563eb);
}

.pager-num--active {
  background: var(--color-primary, #2563eb);
  border-color: var(--color-primary, #2563eb);
  color: #ffffff;
}

.pager-num--active:hover {
  background: var(--color-primary, #2563eb);
  color: #ffffff;
}

.pager-nav:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.bsr-board-pager-right {
  align-items: center;
  display: inline-flex;
  gap: 10px;
}

.bsr-board-pager-right select {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  padding: 4px 6px;
}

.pager-jump {
  align-items: center;
  display: inline-flex;
  font-size: 12px;
  gap: 4px;
}

.pager-jump input {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  padding: 3px 6px;
  width: 48px;
}

.pager-meta {
  color: var(--text-muted, #64748b);
  font-size: 12px;
}

@media (max-width: 960px) {
  .bsr-board-controls {
    grid-template-columns: 1fr 1fr;
  }
  .bsr-board-search {
    grid-column: 1 / -1;
  }
  .bsr-board-refresh {
    grid-column: 1 / -1;
  }
}
</style>