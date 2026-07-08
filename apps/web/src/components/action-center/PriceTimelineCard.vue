<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Activity, DollarSign, MessageSquare, Tag } from "@lucide/vue";
import { ElEmpty, ElSkeleton, ElStatistic, ElTag } from "element-plus";
import type { ProductPriceHistory } from "@amazon-monitor/shared";
import {
  buildProductPriceTimelineChartOption,
  getProductPriceTimelinePoints,
  getProductPriceTimelineSummary
} from "../../utils/actionCenterPriceTimeline";
import type { ChartInstance } from "../../utils/echartsRuntime";

type EchartsRuntime = typeof import("../../utils/echartsRuntime");

const props = defineProps<{
  rows: ProductPriceHistory[];
  loading: boolean;
}>();

const chartEl = ref<HTMLDivElement | null>(null);
const summary = computed(() => getProductPriceTimelineSummary(props.rows));
const recentRows = computed(() => getProductPriceTimelinePoints(props.rows).reverse().slice(0, 8));
const priceDeltaValue = computed(() => Math.abs(summary.value?.effectivePriceDelta ?? 0));

let runtimeReady: Promise<EchartsRuntime> | null = null;
let chart: ChartInstance | null = null;
let resizeObserver: ResizeObserver | null = null;

watch(
  () => [props.rows, props.loading],
  () => {
    renderChart();
  },
  { immediate: true }
);

async function renderChart(): Promise<void> {
  await nextTick();
  if (props.loading || !summary.value || !chartEl.value) {
    disposeChart();
    return;
  }
  const runtime = await loadRuntime();
  if (props.loading || !summary.value || !chartEl.value) return;
  chart = chart ?? runtime.initChart(chartEl.value);
  chart.setOption(buildProductPriceTimelineChartOption(props.rows), true);
  chart.resize();
  bindResizeObserver();
}

function loadRuntime(): Promise<EchartsRuntime> {
  runtimeReady ??= import("../../utils/echartsRuntime");
  return runtimeReady;
}

function bindResizeObserver(): void {
  if (resizeObserver || !chartEl.value) return;
  resizeObserver = new ResizeObserver(() => {
    chart?.resize();
  });
  resizeObserver.observe(chartEl.value);
}

function disposeChart(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  chart?.dispose();
  chart = null;
}

function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `$${value.toFixed(2)}`;
}

function formatSignedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${value > 0 ? "+" : ""}$${value.toFixed(2)}`;
}

function formatReview(value: number | null | undefined, change: number | null | undefined): string {
  const total = value === null || value === undefined ? "-" : String(value);
  if (change === null || change === undefined || change === 0) return total;
  return `${total} (${change > 0 ? "+" : ""}${change})`;
}

onBeforeUnmount(disposeChart);
</script>

<template>
  <section class="price-timeline-card">
    <header>
      <Activity :size="16" />
      <div>
        <h3>ASIN price timeline</h3>
        <small v-if="summary">{{ summary.pointCount }} price points / {{ summary.promoDayCount }} promo days</small>
      </div>
      <ElTag v-if="summary" :type="summary.tone" effect="light" round>
        {{ summary.label }}
      </ElTag>
    </header>

    <ElSkeleton v-if="loading" animated :rows="3" />
    <ElEmpty v-else-if="!summary" description="No price history evidence yet" :image-size="56" />
    <template v-else>
      <div class="timeline-kpis">
        <ElStatistic title="List price" :value="summary.latestCurrentPrice ?? 0" prefix="$" :precision="2" />
        <ElStatistic title="Effective price" :value="summary.latestEffectivePrice ?? 0" prefix="$" :precision="2" />
        <ElStatistic title="Price movement" :value="priceDeltaValue" prefix="$" :precision="2" />
        <ElStatistic title="Reviews" :value="summary.latestReviewCount ?? 0" />
        <ElStatistic title="Review delta" :value="summary.reviewDelta ?? 0" />
        <ElStatistic title="Lowest effective" :value="summary.lowestEffectivePrice ?? 0" prefix="$" :precision="2" />
      </div>

      <div ref="chartEl" class="price-chart" aria-label="price and review timeline chart"></div>

      <div class="timeline-rows">
        <article v-for="row in recentRows" :key="`${row.date}-${row.effectivePrice ?? 'na'}`">
          <time>{{ row.date.slice(5) }}</time>
          <strong>{{ formatMoney(row.effectivePrice) }}</strong>
          <span>
            <DollarSign :size="13" />
            {{ formatMoney(row.currentPrice) }}
          </span>
          <span>
            <MessageSquare :size="13" />
            {{ formatReview(row.reviewCount, row.reviewCountChange) }}
          </span>
          <em>
            <Tag v-if="row.promoLabel" :size="13" />
            {{ row.promoLabel || "No promo" }}
          </em>
        </article>
      </div>

      <p class="trend-note">
        Effective price uses final estimated price when coupons are available; orange markers show Coupon or Deal days.
        Latest effective price movement: {{ formatSignedMoney(summary.effectivePriceDelta) }}.
      </p>
    </template>
  </section>
</template>

<style scoped>
.price-timeline-card {
  display: grid;
  gap: 12px;
}

.price-timeline-card > header {
  align-items: center;
  color: #0f172a;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.price-timeline-card h3 {
  font-size: 15px;
  margin: 0;
}

.price-timeline-card small,
.timeline-rows em,
.timeline-rows span,
.trend-note {
  color: #64748b;
  font-size: 12px;
}

.timeline-kpis {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.timeline-kpis :deep(.el-statistic) {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  padding: 10px;
}

.price-chart {
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  height: 240px;
  min-width: 0;
}

.timeline-rows {
  display: grid;
  gap: 6px;
}

.timeline-rows article {
  align-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  grid-template-columns: 48px 72px 72px 88px minmax(0, 1fr);
  min-height: 38px;
  padding: 7px 9px;
}

.timeline-rows time {
  color: #475569;
  font-size: 12px;
}

.timeline-rows strong {
  color: #0f172a;
  font-weight: 700;
}

.timeline-rows span,
.timeline-rows em {
  align-items: center;
  display: inline-flex;
  gap: 4px;
  min-width: 0;
}

.timeline-rows em {
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-rows svg {
  color: #0f766e;
  flex: 0 0 auto;
}

.trend-note {
  line-height: 1.6;
  margin: 0;
}

@media (max-width: 640px) {
  .timeline-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .timeline-rows article {
    align-items: start;
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .timeline-rows article > *:not(time) {
    grid-column: 2;
  }
}
</style>
