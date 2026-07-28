<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElEmpty, ElSegmented } from "element-plus";
import type { OwnedProductDailyMetric, ProductOperationsAccess } from "@amazon-monitor/shared";
import { useEchartsCharts } from "../../composables/useEchartsCharts";
import {
  buildProductOperationsChartOption,
  hasProductTrendEvidence,
  type ProductTrendMode,
} from "../../utils/productOperationsChartOptions";

const props = defineProps<{
  metrics: OwnedProductDailyMetric[];
  access: ProductOperationsAccess;
}>();

const mode = ref<ProductTrendMode>("commercial");
const chartElement = ref<HTMLDivElement | null>(null);
const { renderChartSpecs } = useEchartsCharts();
const options = [
  { label: "销售与利润", value: "commercial" },
  { label: "广告效率", value: "ads" },
  { label: "库存与排名", value: "visibility" },
];
const hasEvidence = computed(() => hasProductTrendEvidence(props.metrics, mode.value));
const evidenceCount = computed(() => props.metrics.filter((metric) => (
  metric.salesAmount !== null
  || metric.grossMargin !== null
  || metric.adSpend !== null
  || metric.inventoryDays !== null
  || metric.keywordRank !== null
  || metric.bsrRank !== null
)).length);
const adsDenied = computed(() => mode.value === "ads" && props.access.ads === "denied");
const profitDenied = computed(() => mode.value === "commercial" && props.access.profit === "denied");

watch(
  [() => props.metrics, mode],
  () => {
    void renderChartSpecs(
      () => [{
        key: "product-operations",
        element: chartElement.value,
        option: buildProductOperationsChartOption(props.metrics, mode.value),
      }],
      () => hasEvidence.value && !adsDenied.value,
    );
  },
  { immediate: true },
);
</script>

<template>
  <section class="product-operations-section">
    <div class="product-operations-section__head">
      <div>
        <h3>经营趋势</h3>
        <p>最近 {{ evidenceCount }} 个有证据的经营日</p>
      </div>
      <ElSegmented v-model="mode" :options="options" size="small" />
    </div>

    <div v-if="adsDenied" class="product-inline-state">
      当前角色无广告数据权限，请联系管理员或广告负责人查看。
    </div>
    <div v-else-if="!hasEvidence" class="product-inline-empty">
      <ElEmpty :image-size="48" description="当前区间没有可绘制的趋势数据" />
      <p>请在数据源中心导入经营、广告或库存日报。</p>
    </div>
    <template v-else>
      <div ref="chartElement" class="product-operations-chart" />
      <p v-if="profitDenied" class="product-access-note">
        当前角色不显示毛利率，销售趋势仍保留。
      </p>
    </template>
  </section>
</template>
