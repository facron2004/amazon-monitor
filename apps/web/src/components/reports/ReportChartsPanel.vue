<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { BarChart3, Donut, Radar } from "@lucide/vue";
import { ElCard, ElEmpty, ElRow, ElCol } from "element-plus";
import type { PeriodInsightReportResponse } from "../../api-types";
import { buildBrandPressureChartOption, buildReviewLoopChartOption, buildSignalMixChartOption } from "../../utils/reportChartOptions";
import type { ChartInstance } from "../../utils/echartsRuntime";

type ReportChartsRuntime = typeof import("../../utils/echartsRuntime");

const props = defineProps<{
  report: PeriodInsightReportResponse | null;
  reportLabel: string;
}>();

const signalChartEl = ref<HTMLDivElement | null>(null);
const reviewChartEl = ref<HTMLDivElement | null>(null);
const brandChartEl = ref<HTMLDivElement | null>(null);

let runtimeReady: Promise<ReportChartsRuntime> | null = null;
let signalChart: ChartInstance | null = null;
let reviewChart: ChartInstance | null = null;
let brandChart: ChartInstance | null = null;
let resizeObserver: ResizeObserver | null = null;

watch(
  () => props.report,
  () => {
    renderCharts();
  },
  { immediate: true }
);

async function renderCharts(): Promise<void> {
  await nextTick();
  if (!props.report) {
    disposeCharts();
    return;
  }

  const runtime = await loadRuntime();
  if (!props.report) return;

  signalChart = renderChart(runtime, signalChart, signalChartEl.value, buildSignalMixChartOption(props.report));
  reviewChart = renderChart(runtime, reviewChart, reviewChartEl.value, buildReviewLoopChartOption(props.report));
  brandChart = renderChart(runtime, brandChart, brandChartEl.value, buildBrandPressureChartOption(props.report));
  bindResizeObserver();
}

function renderChart(
  runtime: ReportChartsRuntime,
  current: ChartInstance | null,
  element: HTMLDivElement | null,
  option: unknown
): ChartInstance | null {
  if (!element) return current;
  const chart = current ?? runtime.initChart(element);
  chart.setOption(option, true);
  chart.resize();
  return chart;
}

function bindResizeObserver(): void {
  if (resizeObserver) return;
  const elements = [signalChartEl.value, reviewChartEl.value, brandChartEl.value].filter((element): element is HTMLDivElement => Boolean(element));
  if (elements.length === 0) return;

  resizeObserver = new ResizeObserver(() => {
    signalChart?.resize();
    reviewChart?.resize();
    brandChart?.resize();
  });
  for (const element of elements) {
    resizeObserver.observe(element);
  }
}

function disposeCharts(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  signalChart?.dispose();
  reviewChart?.dispose();
  brandChart?.dispose();
  signalChart = null;
  reviewChart = null;
  brandChart = null;
}

function loadRuntime(): Promise<ReportChartsRuntime> {
  runtimeReady ??= import("../../utils/echartsRuntime");
  return runtimeReady;
}

onBeforeUnmount(disposeCharts);
</script>

<template>
  <ElCard shadow="never" class="report-chart-panel">
    <template #header>
      <div class="chart-panel-title">
        <BarChart3 :size="16" />
        <span>{{ reportLabel }} chart board</span>
      </div>
    </template>

    <ElEmpty v-if="!report" description="No report data available for charts." :image-size="76" />
    <ElRow v-else :gutter="12" class="chart-grid">
      <ElCol :xs="24" :lg="14">
        <section class="chart-card">
          <div class="chart-title">
            <Radar :size="15" />
            <span>Signal mix</span>
          </div>
          <div ref="signalChartEl" class="report-chart" data-chart="signal-mix"></div>
        </section>
      </ElCol>
      <ElCol :xs="24" :lg="10">
        <section class="chart-card">
          <div class="chart-title">
            <Donut :size="15" />
            <span>Review loop</span>
          </div>
          <div ref="reviewChartEl" class="report-chart" data-chart="review-loop"></div>
        </section>
      </ElCol>
      <ElCol :xs="24" :lg="24">
        <section class="chart-card chart-card-wide">
          <div class="chart-title">
            <BarChart3 :size="15" />
            <span>Brand pressure</span>
          </div>
          <div ref="brandChartEl" class="report-chart" data-chart="brand-pressure"></div>
        </section>
      </ElCol>
    </ElRow>
  </ElCard>
</template>

<style scoped>
.report-chart-panel {
  min-width: 0;
}

.chart-panel-title,
.chart-title {
  align-items: center;
  color: #0f172a;
  display: flex;
  font-weight: 800;
  gap: 8px;
}

.chart-panel-title {
  font-size: 13px;
  text-transform: uppercase;
}

.chart-grid {
  row-gap: 12px;
}

.chart-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
}

.chart-title {
  font-size: 12px;
}

.report-chart {
  height: 240px;
  min-width: 0;
  width: 100%;
}

.chart-card-wide .report-chart {
  height: 220px;
}

@media (max-width: 720px) {
  .report-chart {
    height: 220px;
  }
}
</style>
