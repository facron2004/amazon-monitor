<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category";
import { formatCount, formatMoney, formatSignedCount, iceTypeLabel, promoText } from "../utils/formatters";

const store = useCategoryStore();
const { priceHistory } = storeToRefs(store);
</script>

<template>
  <section id="category-price-history" class="panel category-anchor">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>价格历史窗口</h2>
        <p class="panel-caption">快速回看近 30 / 60 / 90 天低价和监控低点，判断当前价格位置。</p>
      </div>
      <span>{{ priceHistory.length }} 条</span>
    </div>
    <div class="table-wrap price-history-scroll">
      <table>
        <thead>
          <tr>
            <th>ASIN</th>
            <th>品牌</th>
            <th>Ice Type</th>
            <th>当前价格</th>
            <th class="promo-col">Deal/Coupon</th>
            <th>Reviews</th>
            <th>Review Delta</th>
            <th>T30 低价</th>
            <th>T60 低价</th>
            <th>T90 低价</th>
            <th>监控低价</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in priceHistory.slice(0, 80)" :key="`${item.categoryId}-${item.asin}`">
            <td><strong>{{ item.asin }}</strong></td>
            <td>{{ item.brand || "未知品牌" }}</td>
            <td>{{ iceTypeLabel(item.iceType) }}</td>
            <td>{{ formatMoney(item.currentPrice) }}</td>
            <td class="promo-col" :title="promoText(item)">{{ promoText(item) }}</td>
            <td>{{ formatCount(item.reviewCount) }}</td>
            <td>{{ formatSignedCount(item.reviewCountChange) }}</td>
            <td>{{ formatMoney(item.t30LowPrice) }}</td>
            <td>{{ formatMoney(item.t60LowPrice) }}</td>
            <td>{{ formatMoney(item.t90LowPrice) }}</td>
            <td>{{ formatMoney(item.monitoringLowPrice) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
