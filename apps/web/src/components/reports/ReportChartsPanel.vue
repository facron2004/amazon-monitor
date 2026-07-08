<script setup lang="ts">
import { ref, watch } from "vue";
import { BarChart3, Donut, Radar } from "@lucide/vue";
import { ElCard, ElCol, ElEmpty, ElRow } from "element-plus";
import type { PeriodInsightReportResponse } from "../../api-types";
import { buildBrandPressureChartOption, buildReviewLoopChartOption, buildSignalMixChartOption } from "../../utils/reportChartOptions";
import { useEchartsCharts } from "../../composables/useEchartsCharts";

const props = defineProps<{
  report: PeriodInsightReportResponse | null;
  reportLabel: string;
}>();

const signalChartEl = ref<HTMLDivElement | null>(null);
const reviewChartEl = ref<HTMLDivElement | null>(null);
const brandChartEl = ref<HTMLDivElement | null>(null);
const { renderChartSpecs } = useEchartsCharts();

watch(
  () => props.report,
  () => {
    renderCharts();
  },
  { immediate: true }
);

async function renderCharts(): Promise<void> {
  await renderChartSpecs(
    () => props.report
      ? [
          { key: "signal", element: signalChartEl.value, option: buildSignalMixChartOption(props.report) },
          { key: "review", element: reviewChartEl.value, option: buildReviewLoopChartOption(props.report) },
          { key: "brand", element: brandChartEl.value, option: buildBrandPressureChartOption(props.report) }
        ]
      : [],
    () => props.report !== null
  );
}
</script>

<template>
  <ElCard shadow="never" class="report-chart-panel">
    <template #header>
      <div class="chart-panel-title">
        <BarChart3 :size="16" />
        <span>{{ reportLabel }}图表看板</span>
      </div>
    </template>

    <ElEmpty v-if="!report" description="暂无图表报告数据。" :image-size="76" />
    <ElRow v-else :gutter="12" class="chart-grid">
      <ElCol :xs="24" :lg="14">
        <section class="chart-card">
          <div class="chart-title">
            <Radar :size="15" />
            <span>信号分布</span>
          </div>
          <div ref="signalChartEl" class="report-chart" data-chart="signal-mix"></div>
        </section>
      </ElCol>
      <ElCol :xs="24" :lg="10">
        <section class="chart-card">
          <div class="chart-title">
            <Donut :size="15" />
            <span>复盘闭环</span>
          </div>
          <div ref="reviewChartEl" class="report-chart" data-chart="review-loop"></div>
        </section>
      </ElCol>
      <ElCol :xs="24" :lg="24">
        <section class="chart-card chart-card-wide">
          <div class="chart-title">
            <BarChart3 :size="15" />
            <span>品牌压力</span>
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
