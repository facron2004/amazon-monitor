<script setup lang="ts">
import { computed } from "vue";
import type { OwnedProductListItem } from "@amazon-monitor/shared";
import { formatMoney } from "../../utils/formatters";

const props = defineProps<{ products: OwnedProductListItem[] }>();

const highRiskCount = computed(
  () => props.products.filter((item) => item.riskScore.level === "high").length,
);
const lowInventoryCount = computed(
  () =>
    props.products.filter((item) => {
      const days = item.latestMetric?.inventoryDays;
      return days !== null && days !== undefined && days < 21;
    }).length,
);
const totalSales = computed(() =>
  props.products.reduce(
    (sum, item) => sum + (item.spApiEvidence.sales?.salesAmount ?? item.latestMetric?.salesAmount ?? 0),
    0,
  ),
);
const averageOpportunity = computed(() => {
  if (props.products.length === 0) return 0;
  return Math.round(
    props.products.reduce((sum, item) => sum + item.opportunityScore.score, 0) /
      props.products.length,
  );
});
</script>

<template>
  <div class="metrics products-metrics">
    <article class="metric">
      <span>自营 SKU</span>
      <strong>{{ products.length }}</strong>
    </article>
    <article class="metric hot">
      <span>高风险 SKU</span>
      <strong>{{ highRiskCount }}</strong>
    </article>
    <article class="metric">
      <span>库存低于 21 天</span>
      <strong>{{ lowInventoryCount }}</strong>
    </article>
    <article class="metric">
      <span>当日销售额</span>
      <strong>{{ formatMoney(totalSales) }}</strong>
    </article>
    <article class="metric review-metric">
      <span>平均机会分</span>
      <strong>{{ averageOpportunity }}</strong>
    </article>
  </div>
</template>
