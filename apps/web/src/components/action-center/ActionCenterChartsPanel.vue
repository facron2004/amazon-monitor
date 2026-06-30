<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { BarChart3, Building2, CalendarClock, Donut, Tags } from "@lucide/vue";
import { ElButton, ElCard, ElCol, ElEmpty, ElProgress, ElRow, ElTable, ElTableColumn, ElTag } from "element-plus";
import type { InsightEvent, InsightEventLevel, StrategyTag } from "@amazon-monitor/shared";
import {
  buildBrandActionPressureChartOption,
  buildPriorityMixChartOption,
  buildReviewCadenceChartOption,
  buildStrategyFocusChartOption,
  buildWorkflowFunnelChartOption,
  getBrandActionPressureRows,
  getPriorityMixData,
  getStrategyFocusData
} from "../../utils/actionCenterChartOptions";
import {
  chartBucketNameFromOffset,
  chartBucketNameFromVerticalOffset,
  isDueReviewCadenceChartName,
  pieChartNameFromOffset,
  priorityChartNameToLevel,
  strategyChartNameToTag,
  workflowChartNameToColumn,
  type WorkflowChartColumn
} from "../../utils/actionCenterChartInteractions";
import type { ChartInstance } from "../../utils/echartsRuntime";

type EchartsRuntime = typeof import("../../utils/echartsRuntime");

const workflowBucketNames = ["Todo", "In progress", "Closed"] as const;
const reviewCadenceBucketNames = ["Overdue", "Today", "Upcoming"] as const;

const props = defineProps<{
  events: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  currentDate: string;
}>();

const emit = defineEmits<{
  (event: "focus-brand", brand: string): void;
  (event: "focus-level", level: InsightEventLevel): void;
  (event: "focus-review-due"): void;
  (event: "focus-strategy", tag: StrategyTag): void;
  (event: "select-workflow", column: WorkflowChartColumn): void;
}>();

const workflowChartEl = ref<HTMLDivElement | null>(null);
const priorityChartEl = ref<HTMLDivElement | null>(null);
const strategyChartEl = ref<HTMLDivElement | null>(null);
const brandChartEl = ref<HTMLDivElement | null>(null);
const reviewChartEl = ref<HTMLDivElement | null>(null);

let runtimeReady: Promise<EchartsRuntime> | null = null;
let workflowChart: ChartInstance | null = null;
let priorityChart: ChartInstance | null = null;
let strategyChart: ChartInstance | null = null;
let brandChart: ChartInstance | null = null;
let reviewChart: ChartInstance | null = null;
let resizeObserver: ResizeObserver | null = null;

const brandPressureRows = computed(() => getBrandActionPressureRows(props.events));
const maxBrandPressure = computed(() => Math.max(1, ...brandPressureRows.value.map((row) => row.value)));

watch(
  () => [props.events, props.reviewDueEvents, props.currentDate],
  () => {
    renderCharts();
  },
  { immediate: true }
);

async function renderCharts(): Promise<void> {
  await nextTick();
  if (props.events.length === 0) {
    disposeCharts();
    return;
  }

  const runtime = await loadRuntime();
  if (props.events.length === 0) return;

  workflowChart = renderChart(runtime, workflowChart, workflowChartEl.value, buildWorkflowFunnelChartOption(props.events));
  priorityChart = renderChart(runtime, priorityChart, priorityChartEl.value, buildPriorityMixChartOption(props.events));
  strategyChart = renderChart(runtime, strategyChart, strategyChartEl.value, buildStrategyFocusChartOption(props.events));
  brandChart = renderChart(runtime, brandChart, brandChartEl.value, buildBrandActionPressureChartOption(props.events));
  reviewChart = renderChart(
    runtime,
    reviewChart,
    reviewChartEl.value,
    buildReviewCadenceChartOption(props.events, props.reviewDueEvents, props.currentDate)
  );
  bindResizeObserver();
}

function renderChart(
  runtime: EchartsRuntime,
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
  const elements = [workflowChartEl.value, priorityChartEl.value, strategyChartEl.value, brandChartEl.value, reviewChartEl.value].filter(
    (element): element is HTMLDivElement => Boolean(element)
  );
  if (elements.length === 0) return;

  resizeObserver = new ResizeObserver(() => {
    workflowChart?.resize();
    priorityChart?.resize();
    strategyChart?.resize();
    brandChart?.resize();
    reviewChart?.resize();
  });
  for (const element of elements) {
    resizeObserver.observe(element);
  }
}

function disposeCharts(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  workflowChart?.dispose();
  priorityChart?.dispose();
  strategyChart?.dispose();
  brandChart?.dispose();
  reviewChart?.dispose();
  workflowChart = null;
  priorityChart = null;
  strategyChart = null;
  brandChart = null;
  reviewChart = null;
}

function loadRuntime(): Promise<EchartsRuntime> {
  runtimeReady ??= import("../../utils/echartsRuntime");
  return runtimeReady;
}

function brandPressurePercent(value: number): number {
  return Math.round((value / maxBrandPressure.value) * 100);
}

function focusPriorityFromPointer(event: MouseEvent): void {
  const bucketName = pieChartNameFromPointer(event, getPriorityMixData(props.events));
  const level = priorityChartNameToLevel(bucketName);
  if (level) {
    emit("focus-level", level);
  }
}

function focusStrategyFromPointer(event: MouseEvent): void {
  const bucketNames = getStrategyFocusData(props.events).reverse().map((item) => item.name);
  const bucketName = verticalChartBucketNameFromPointer(event, bucketNames);
  const tag = strategyChartNameToTag(bucketName);
  if (tag) {
    emit("focus-strategy", tag);
  }
}

function focusBrandFromPointer(event: MouseEvent): void {
  const bucketNames = brandPressureRows.value.map((row) => row.brand).reverse();
  const brand = verticalChartBucketNameFromPointer(event, bucketNames);
  const canFocus = brandPressureRows.value.some((row) => row.brand === brand && row.canFocus);
  if (brand && canFocus) {
    emit("focus-brand", brand);
  }
}

function selectWorkflowFromPointer(event: MouseEvent): void {
  const bucketName = chartBucketNameFromPointer(event, workflowBucketNames);
  const column = workflowChartNameToColumn(bucketName);
  if (column) {
    emit("select-workflow", column);
  }
}

function focusReviewDueFromPointer(event: MouseEvent): void {
  const bucketName = chartBucketNameFromPointer(event, reviewCadenceBucketNames);
  if (isDueReviewCadenceChartName(bucketName)) {
    emit("focus-review-due");
  }
}

function chartBucketNameFromPointer(event: MouseEvent, bucketNames: readonly string[]): string | null {
  const target = event.currentTarget;
  if (!isRectTarget(target)) return null;
  const rect = target.getBoundingClientRect();
  return chartBucketNameFromOffset(event.clientX - rect.left, rect.width, bucketNames);
}

function verticalChartBucketNameFromPointer(event: MouseEvent, bucketNames: readonly string[]): string | null {
  const target = event.currentTarget;
  if (!isRectTarget(target)) return null;
  const rect = target.getBoundingClientRect();
  return chartBucketNameFromVerticalOffset(event.clientY - rect.top, rect.height, bucketNames);
}

function pieChartNameFromPointer(event: MouseEvent, data: readonly { name: string; value: number }[]): string | null {
  const target = event.currentTarget;
  if (!isRectTarget(target)) return null;
  const rect = target.getBoundingClientRect();
  return pieChartNameFromOffset(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, data);
}

function isRectTarget(target: EventTarget | null): target is HTMLElement {
  return target !== null && "getBoundingClientRect" in target;
}

onBeforeUnmount(disposeCharts);
</script>

<template>
  <ElCard shadow="never" class="action-chart-panel">
    <template #header>
      <div class="chart-panel-title">
        <BarChart3 :size="16" />
        <span>Action chart board</span>
      </div>
    </template>

    <ElEmpty v-if="events.length === 0" description="No visible events for charts." :image-size="70" />
    <div v-else class="action-chart-stack">
      <ElRow :gutter="12" class="action-chart-grid">
        <ElCol :xs="24" :lg="12" :xl="8">
        <section class="action-chart-card">
          <div class="chart-title">
            <BarChart3 :size="15" />
            <span>Workflow funnel</span>
          </div>
          <div
            ref="workflowChartEl"
            class="action-chart"
            data-chart="action-workflow"
            @click.capture="selectWorkflowFromPointer"
          ></div>
        </section>
      </ElCol>
      <ElCol :xs="24" :lg="12" :xl="8">
        <section class="action-chart-card">
          <div class="chart-title">
            <Donut :size="15" />
            <span>Priority mix</span>
          </div>
          <div
            ref="priorityChartEl"
            class="action-chart"
            data-chart="action-priority"
            @click.capture="focusPriorityFromPointer"
          ></div>
        </section>
      </ElCol>
      <ElCol :xs="24" :lg="12" :xl="8">
        <section class="action-chart-card">
          <div class="chart-title">
            <Tags :size="15" />
            <span>Strategy focus</span>
          </div>
          <div
            ref="strategyChartEl"
            class="action-chart"
            data-chart="action-strategy"
            @click.capture="focusStrategyFromPointer"
          ></div>
        </section>
      </ElCol>
      <ElCol :xs="24" :lg="12" :xl="8">
        <section class="action-chart-card">
          <div class="chart-title">
            <Building2 :size="15" />
            <span>Brand pressure</span>
          </div>
          <div
            ref="brandChartEl"
            class="action-chart"
            data-chart="action-brand-pressure"
            @click.capture="focusBrandFromPointer"
          ></div>
        </section>
      </ElCol>
      <ElCol :xs="24" :lg="12" :xl="8">
        <section class="action-chart-card">
          <div class="chart-title">
            <CalendarClock :size="15" />
            <span>Review cadence</span>
          </div>
          <div
            ref="reviewChartEl"
            class="action-chart"
            data-chart="action-review-cadence"
            @click.capture="focusReviewDueFromPointer"
          ></div>
        </section>
      </ElCol>
      </ElRow>

      <section v-if="brandPressureRows.length" class="brand-pressure-flow">
        <header>
          <div class="chart-title">
            <Building2 :size="15" />
            <span>Brand pressure queue</span>
          </div>
          <small>{{ brandPressureRows.length }} brands with open action score</small>
        </header>
        <ElTable :data="brandPressureRows" row-key="brand" size="small">
          <ElTableColumn label="Brand" min-width="150">
            <template #default="scope">
              <div class="brand-cell">
                <strong>{{ scope.row.brand }}</strong>
                <small>{{ scope.row.eventCount }} open events</small>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="Open score" min-width="160">
            <template #default="scope">
              <div class="pressure-cell">
                <ElProgress :percentage="brandPressurePercent(scope.row.value)" :show-text="false" />
                <strong>{{ scope.row.value }}</strong>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="P0" width="72" align="center">
            <template #default="scope">
              <ElTag :type="scope.row.p0Count > 0 ? 'danger' : 'info'" effect="light" round>
                {{ scope.row.p0Count }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="Top signal" min-width="220" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.topEventTitle }}
            </template>
          </ElTableColumn>
          <ElTableColumn width="92" align="right">
            <template #default="scope">
              <ElButton link type="primary" :disabled="!scope.row.canFocus" @click="emit('focus-brand', scope.row.brand)">
                Focus
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>
    </div>
  </ElCard>
</template>

<style scoped>
.action-chart-panel {
  flex: 0 0 auto;
  min-width: 0;
}

.action-chart-panel :deep(.el-card__body) {
  overflow: visible;
}

.action-chart-stack {
  display: grid;
  gap: 12px;
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

.action-chart-grid {
  row-gap: 12px;
}

.action-chart-card {
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

.action-chart {
  height: 210px;
  min-width: 0;
  width: 100%;
}

[data-chart="action-workflow"],
[data-chart="action-priority"],
[data-chart="action-strategy"],
[data-chart="action-brand-pressure"],
[data-chart="action-review-cadence"] {
  cursor: pointer;
}

.brand-pressure-flow {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 10px;
  padding-top: 12px;
}

.brand-pressure-flow > header {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.brand-pressure-flow > header small,
.brand-cell small {
  color: #64748b;
  font-size: 12px;
}

.brand-cell {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.brand-cell strong {
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pressure-cell {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(70px, 1fr) auto;
}

.pressure-cell strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.brand-pressure-flow :deep(.el-table) {
  border-radius: 8px;
}

.brand-pressure-flow :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

@media (max-width: 760px) {
  .action-chart {
    height: 220px;
  }

  .brand-pressure-flow > header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
