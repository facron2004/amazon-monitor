<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import { storeToRefs } from "pinia";
import type { BestsellerRankSnapshot } from "@amazon-monitor/shared";
import type { CategoryRankWindow } from "../stores/category";
import { useCategoryStore } from "../stores/category";
import { openCategoryProductByAsin } from "../utils/open-category-product";
import { formatCount, formatMoney, iceTypeLabel, imgFallback, promoText } from "../utils/formatters";

const store = useCategoryStore();
const {
  categoryDataDate,
  categoryDetail,
  topCategorySnapshots,
  categoryProductQuery,
  categoryBrandFilter,
  categoryBrandOptions,
  categoryRankWindow,
  selectedCategoryId
} = storeToRefs(store);

function handleOpenProduct(item: BestsellerRankSnapshot): void {
  openCategoryProductByAsin(item.asin, selectedCategoryId.value);
}
</script>

<template>
  <section id="category-board" class="panel dense-panel bsr-board-panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>BSR 榜单</h2>
        <p class="panel-caption">先按品牌和排名范围收敛，再交叉查看 Deal/Coupon、评分和 Review 体量。</p>
      </div>
      <span>{{ categoryDataDate }} · 展示 {{ topCategorySnapshots.length }} / {{ categoryDetail?.snapshots.length ?? 0 }} 个 ASIN</span>
    </div>
    <div class="panel-controls">
      <input :value="categoryProductQuery" placeholder="筛选 ASIN / 标题 / 品牌" @input="categoryProductQuery = ($event.target as HTMLInputElement).value.trim()" />
      <select :value="categoryBrandFilter" @change="categoryBrandFilter = ($event.target as HTMLSelectElement).value">
        <option value="all">全部品牌</option>
        <option v-for="brand in categoryBrandOptions" :key="brand" :value="brand">{{ brand }}</option>
      </select>
      <select
        :value="categoryRankWindow"
        @change="categoryRankWindow = ($event.target as HTMLSelectElement).value as CategoryRankWindow"
      >
        <option value="top100">Top 100</option>
        <option value="top50">Top 50</option>
        <option value="top20">Top 20</option>
        <option value="all">全部</option>
      </select>
    </div>
    <div class="table-wrap compact-scroll bsr-board-scroll">
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>商品</th>
            <th>品牌</th>
            <th class="ice-col">Ice Type</th>
            <th class="price-col">价格</th>
            <th class="promo-col">Deal/Coupon</th>
            <th class="rating-col">评分</th>
            <th class="review-col">Reviews</th>
            <th class="link-col">打开</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in topCategorySnapshots" :key="item.asin">
            <td><strong>#{{ item.rank }}</strong></td>
            <td class="product-cell">
              <img :src="item.imageUrl" :alt="item.title" loading="lazy" decoding="async" @error="imgFallback" />
              <div>
                <strong>{{ item.asin }}</strong>
                <span>{{ item.title }}</span>
                <small v-if="promoText(item) !== '-'" class="promo-inline" :title="promoText(item)">Deal/Coupon：{{ promoText(item) }}</small>
              </div>
            </td>
            <td>{{ item.brand || "未知品牌" }}</td>
            <td class="ice-col">{{ iceTypeLabel(item.iceType) }}</td>
            <td class="price-col">{{ formatMoney(item.currentPrice) }}</td>
            <td class="promo-col" :title="promoText(item)">{{ promoText(item) }}</td>
            <td class="rating-col">{{ item.rating || "-" }}</td>
            <td class="review-col">{{ formatCount(item.reviewCount) }}</td>
            <td class="link-col">
              <button class="icon-button" title="打开 Amazon" type="button" @click="handleOpenProduct(item)">
                <ExternalLink :size="17" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
