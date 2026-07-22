<script setup lang="ts">
import { AlertTriangle, BarChart3, Save, Store, TrendingUp } from "@lucide/vue";
import { ElButton } from "element-plus";
import type { CommerceStore, OwnedProductDetail } from "@amazon-monitor/shared";
import {
  formatCount,
  formatMoney,
  formatPercent,
} from "../../utils/formatters";

defineProps<{
  product: OwnedProductDetail | null;
  stores: CommerceStore[];
}>();

const emit = defineEmits<{
  editStore: [];
  editMetric: [product: OwnedProductDetail];
}>();

function storeName(stores: CommerceStore[], id: number | null): string {
  if (id === null) return "未分配店铺";
  return stores.find((item) => item.id === id)?.name ?? `店铺 #${id}`;
}
</script>

<template>
  <aside class="panel products-detail-panel">
    <div v-if="!product" class="empty-state">
      <BarChart3 :size="28" />
      <p>选择一个 SKU 查看评分依据和近期指标。</p>
    </div>
    <template v-else>
      <div class="panel-head">
        <div>
          <h2>{{ product.sku }}</h2>
          <span>
            {{ storeName(stores, product.storeId) }} · {{ product.asin }} ·
            {{ product.brand || "未标品牌" }}
          </span>
        </div>
        <div class="products-panel-actions">
          <ElButton size="small" @click="emit('editStore')">
            <template #icon><Store :size="12" /></template>
            店铺归属
          </ElButton>
          <ElButton
            size="small"
            type="primary"
            @click="emit('editMetric', product)"
          >
            <template #icon><Save :size="12" /></template>
            录入指标
          </ElButton>
        </div>
      </div>

      <div class="product-score-grid">
        <article>
          <AlertTriangle :size="18" />
          <span>风险分</span>
          <strong>{{ product.riskScore.score }}</strong>
        </article>
        <article>
          <TrendingUp :size="18" />
          <span>机会分</span>
          <strong>{{ product.opportunityScore.score }}</strong>
        </article>
      </div>

      <section class="product-score-section">
        <h3>风险评分依据</h3>
        <div
          v-for="dimension in product.riskScore.dimensions"
          :key="dimension.key"
          class="product-score-row"
        >
          <span>{{ dimension.label }}</span>
          <strong>{{ dimension.score }}</strong>
          <small>{{ dimension.reason }}</small>
        </div>
      </section>

      <section class="product-score-section">
        <h3>机会评分依据</h3>
        <div
          v-for="dimension in product.opportunityScore.dimensions"
          :key="dimension.key"
          class="product-score-row"
        >
          <span>{{ dimension.label }}</span>
          <strong>{{ dimension.score }}</strong>
          <small>{{ dimension.reason }}</small>
        </div>
      </section>

      <section class="product-score-section">
        <h3>近期指标</h3>
        <div class="table-wrap compact-scroll product-metric-history">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>销售额</th>
                <th>库存天数</th>
                <th>ACOS</th>
                <th>BSR</th>
                <th>核心词</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="metric in product.metrics.slice(0, 10)"
                :key="metric.id"
              >
                <td>{{ metric.date }}</td>
                <td>{{ formatMoney(metric.salesAmount) }}</td>
                <td>{{ metric.inventoryDays ?? "-" }}</td>
                <td>{{ formatPercent(metric.acos) }}</td>
                <td>{{ formatCount(metric.bsrRank) }}</td>
                <td>{{ formatCount(metric.keywordRank) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </aside>
</template>
