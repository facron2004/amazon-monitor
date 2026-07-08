<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { TrendingUp } from "@lucide/vue";
import { ElEmpty, ElSkeleton, ElStatistic, ElTag } from "element-plus";
import type { BsrRankHistory } from "@amazon-monitor/shared";
import {
  buildBsrTrendChartOption,
  getBsrTrendSummary
} from "../../utils/actionCenterBsrTrend";
import type { ChartInstance } from "../../utils/echartsRuntime";

type EchartsRuntime = typeof import("../../utils/echartsRuntime");

const props = defineProps<{
  rows: BsrRankHistory[];
  loading: boolean;
}>();

const chartEl = ref<HTMLDivElement | null>(null);
const summary = computed(() => getBsrTrendSummary(props.rows));
const rankDeltaValue = computed(() => Math.abs(summary.value?.rankDelta ?? 0));

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
  if (props.loading || props.rows.length === 0 || !chartEl.value) {
    disposeChart();
    return;
  }
  const runtime = await loadRuntime();
  if (props.loading || props.rows.length === 0 || !chartEl.value) return;
  chart = chart ?? runtime.initChart(chartEl.value);
  chart.setOption(buildBsrTrendChartOption(props.rows), true);
  chart.resize();
  bindResizeObserver();
}

async function loadRuntime(): Promise<EchartsRuntime> {
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

onBeforeUnmount(disposeChart);
</script>

<template>
  <section class="bsr-trend-card">
    <header>
      <TrendingUp :size="16" />
      <div>
        <h3>历史 BSR 趋势</h3>
        <small v-if="summary">{{ summary.pointCount }} 个历史点 · 最优 #{{ summary.bestRank }}</small>
      </div>
      <ElTag v-if="summary" :type="summary.tone" effect="light" round>
        {{ summary.label }}
      </ElTag>
    </header>

    <ElSkeleton v-if="loading" animated :rows="3" />
    <ElEmpty v-else-if="!summary" description="暂无 BSR 历史趋势" :image-size="56" />
    <template v-else>
      <div class="bsr-kpis">
        <ElStatistic title="Current BSR" :value="summary.currentRank" prefix="#" />
        <ElStatistic title="Previous BSR" :value="summary.previousRank ?? 0" :prefix="summary.previousRank ? '#' : ''" />
        <ElStatistic title="Movement" :value="rankDeltaValue" suffix=" places" />
      </div>
      <div ref="chartEl" class="bsr-chart" aria-label="historical BSR trend chart"></div>
      <p class="trend-note">
        排名轴已倒置：折线向上代表 BSR 改善；橙色虚线同步展示价格位置，便于复盘价格、Coupon、Deal 与排名变化。
      </p>
    </template>
  </section>
</template>

<style scoped>
.bsr-trend-card {
  display: grid;
  gap: 12px;
}

.bsr-trend-card > header {
  align-items: center;
  color: #0f172a;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.bsr-trend-card h3 {
  font-size: 15px;
  margin: 0;
}

.bsr-trend-card small,
.trend-note {
  color: #64748b;
  font-size: 12px;
}

.bsr-kpis {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.bsr-kpis :deep(.el-statistic) {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  padding: 10px;
}

.bsr-chart {
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  height: 220px;
  min-width: 0;
}

.trend-note {
  line-height: 1.6;
  margin: 0;
}
</style>
