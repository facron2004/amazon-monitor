<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BarChart3, Building2, CalendarClock, Donut, Tags } from "@lucide/vue";
import { ElCol, ElRow } from "element-plus";
import type {
  AttributionTag,
  InsightEvent,
  InsightEventLevel,
  InsightEventTrendPoint,
  InsightEventType,
  InsightReviewResult,
  StrategyTag
} from "@amazon-monitor/shared";
import { useEchartsCharts } from "../../composables/useEchartsCharts";
import type { ActionEvidenceMovementFilter } from "../../utils/actionCenterEvidenceDeltas";
import type { ReviewCadenceBucketKey } from "../../utils/actionCenterReviewCadence";
import type { ActionScoreDriverFilter } from "../../utils/actionCenterScoreBreakdown";
import {
  buildActionTrendChartOption,
  buildAttributionDriverChartOption,
  buildBrandActionPressureChartOption,
  buildEvidenceMovementChartOption,
  buildEventTypeMixChartOption,
  buildPriorityMixChartOption,
  buildReviewCadenceChartOption,
  buildReviewOutcomeMixChartOption,
  buildScoreCompositionChartOption,
  buildStrategyFocusChartOption,
  buildWorkflowFunnelChartOption,
  getActionChartCaptions,
  getAttributionDriverData,
  getBrandActionPressureRows,
  getEvidenceMovementData,
  getEventTypeMixData,
  getPriorityMixData,
  getReviewOutcomeMixData,
  getStrategyFocusData
} from "../../utils/actionCenterChartOptions";
import {
  attributionChartNameToTag,
  chartBucketNameFromOffset,
  chartBucketNameFromVerticalOffset,
  eventTypeChartNameToType,
  evidenceMovementChartNameToFilter,
  pieChartNameFromOffset,
  priorityChartNameToLevel,
  reviewCadenceChartNameToFilter,
  reviewOutcomeChartNameToResult,
  scoreDriverChartNameToFilter,
  stackedScoreChartNameFromOffset,
  strategyChartNameToTag,
  workflowChartNameToColumn,
  type WorkflowChartColumn
} from "../../utils/actionCenterChartInteractions";
import { getActionScoreCompositionRows } from "../../utils/actionCenterScoreBreakdown";

type ActionChartGroup = "overview" | "drivers" | "followUp";

const workflowBucketNames = ["待处理", "处理中", "已关闭"] as const;
const reviewCadenceBucketNames = ["已逾期", "今日到期", "待到期"] as const;

const props = defineProps<{
  events: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  trend: InsightEventTrendPoint[];
  currentDate: string;
  activeGroup: ActionChartGroup;
}>();

const emit = defineEmits<{
  (event: "focus-brand", brand: string): void;
  (event: "focus-level", level: InsightEventLevel): void;
  (event: "focus-event-type", eventType: InsightEventType): void;
  (event: "focus-attribution", tag: AttributionTag): void;
  (event: "focus-evidence-movement", filter: ActionEvidenceMovementFilter): void;
  (event: "focus-review-cadence", filter: ReviewCadenceBucketKey): void;
  (event: "focus-review-result", result: InsightReviewResult): void;
  (event: "focus-score-driver", filter: ActionScoreDriverFilter): void;
  (event: "focus-strategy", tag: StrategyTag): void;
  (event: "select-workflow", column: WorkflowChartColumn): void;
}>();

const chartElements = {
  workflow: ref<HTMLDivElement | null>(null),
  priority: ref<HTMLDivElement | null>(null),
  eventType: ref<HTMLDivElement | null>(null),
  score: ref<HTMLDivElement | null>(null),
  evidence: ref<HTMLDivElement | null>(null),
  attribution: ref<HTMLDivElement | null>(null),
  strategy: ref<HTMLDivElement | null>(null),
  brand: ref<HTMLDivElement | null>(null),
  review: ref<HTMLDivElement | null>(null),
  reviewOutcome: ref<HTMLDivElement | null>(null),
  trend: ref<HTMLDivElement | null>(null)
};
const { renderChartSpecs, disposeCharts } = useEchartsCharts();
const captions = computed(() => getActionChartCaptions(props.events, props.reviewDueEvents, props.trend, props.currentDate));

watch(
  () => [props.events, props.reviewDueEvents, props.trend, props.currentDate, props.activeGroup],
  () => {
    disposeCharts();
    void renderCharts();
  },
  { immediate: true }
);

async function renderCharts(): Promise<void> {
  await renderChartSpecs(
    () => [
      { key: "workflow", element: chartElements.workflow.value, option: buildWorkflowFunnelChartOption(props.events) },
      { key: "priority", element: chartElements.priority.value, option: buildPriorityMixChartOption(props.events) },
      { key: "eventType", element: chartElements.eventType.value, option: buildEventTypeMixChartOption(props.events) },
      { key: "score", element: chartElements.score.value, option: buildScoreCompositionChartOption(props.events) },
      { key: "evidence", element: chartElements.evidence.value, option: buildEvidenceMovementChartOption(props.events) },
      { key: "attribution", element: chartElements.attribution.value, option: buildAttributionDriverChartOption(props.events) },
      { key: "strategy", element: chartElements.strategy.value, option: buildStrategyFocusChartOption(props.events) },
      { key: "brand", element: chartElements.brand.value, option: buildBrandActionPressureChartOption(props.events) },
      { key: "review", element: chartElements.review.value, option: buildReviewCadenceChartOption(props.events, props.reviewDueEvents, props.currentDate) },
      { key: "reviewOutcome", element: chartElements.reviewOutcome.value, option: buildReviewOutcomeMixChartOption(props.events) },
      { key: "trend", element: chartElements.trend.value, option: buildActionTrendChartOption(props.trend) }
    ],
    () => props.events.length > 0 || props.reviewDueEvents.length > 0 || props.trend.length > 0
  );
}

function focusPriority(event: MouseEvent): void {
  const name = pieName(event, getPriorityMixData(props.events));
  const value = priorityChartNameToLevel(name);
  if (value) emit("focus-level", value);
}

function focusEventType(event: MouseEvent): void {
  const name = verticalName(event, getEventTypeMixData(props.events).map((item) => item.name).reverse());
  const value = eventTypeChartNameToType(name);
  if (value) emit("focus-event-type", value);
}

function focusScoreDriver(event: MouseEvent): void {
  const target = rectTarget(event);
  if (!target) return;
  const value = scoreDriverChartNameToFilter(stackedScoreChartNameFromOffset(
    event.clientX - target.left,
    target.width,
    getActionScoreCompositionRows(props.events).map((row) => ({ name: row.label, value: row.value }))
  ));
  if (value) emit("focus-score-driver", value);
}

function focusEvidence(event: MouseEvent): void {
  const name = verticalName(event, getEvidenceMovementData(props.events).map((item) => item.name).reverse());
  const value = evidenceMovementChartNameToFilter(name);
  if (value) emit("focus-evidence-movement", value);
}

function focusAttribution(event: MouseEvent): void {
  const name = verticalName(event, getAttributionDriverData(props.events).map((item) => item.name).reverse());
  const value = attributionChartNameToTag(name);
  if (value) emit("focus-attribution", value);
}

function focusStrategy(event: MouseEvent): void {
  const name = verticalName(event, getStrategyFocusData(props.events).map((item) => item.name).reverse());
  const value = strategyChartNameToTag(name);
  if (value) emit("focus-strategy", value);
}

function focusBrand(event: MouseEvent): void {
  const rows = getBrandActionPressureRows(props.events);
  const brand = verticalName(event, rows.map((row) => row.brand).reverse());
  if (brand && rows.some((row) => row.brand === brand && row.canFocus)) emit("focus-brand", brand);
}

function selectWorkflow(event: MouseEvent): void {
  const value = workflowChartNameToColumn(horizontalName(event, workflowBucketNames));
  if (value) emit("select-workflow", value);
}

function focusReviewCadence(event: MouseEvent): void {
  const value = reviewCadenceChartNameToFilter(horizontalName(event, reviewCadenceBucketNames));
  if (value) emit("focus-review-cadence", value);
}

function focusReviewOutcome(event: MouseEvent): void {
  const value = reviewOutcomeChartNameToResult(pieName(event, getReviewOutcomeMixData(props.events)));
  if (value) emit("focus-review-result", value);
}

function horizontalName(event: MouseEvent, names: readonly string[]): string | null {
  const target = rectTarget(event);
  return target ? chartBucketNameFromOffset(event.clientX - target.left, target.width, names) : null;
}

function verticalName(event: MouseEvent, names: readonly string[]): string | null {
  const target = rectTarget(event);
  return target ? chartBucketNameFromVerticalOffset(event.clientY - target.top, target.height, names) : null;
}

function pieName(event: MouseEvent, data: readonly { name: string; value: number }[]): string | null {
  const target = rectTarget(event);
  return target ? pieChartNameFromOffset(event.clientX - target.left, event.clientY - target.top, target.width, target.height, data) : null;
}

function rectTarget(event: MouseEvent): DOMRect | null {
  return event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
}
</script>

<template>
  <ElRow :gutter="12" class="action-chart-grid">
    <ElCol v-if="activeGroup === 'overview'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><BarChart3 :size="15" /><span>行动漏斗</span></div><small>{{ captions.workflow }}</small></div>
        <div :ref="chartElements.workflow" class="action-chart" data-chart="action-workflow" @click.capture="selectWorkflow"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'overview'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><Donut :size="15" /><span>优先级分布</span></div><small>{{ captions.priority }}</small></div>
        <div :ref="chartElements.priority" class="action-chart" data-chart="action-priority" @click.capture="focusPriority"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'overview'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><BarChart3 :size="15" /><span>事件类型分布</span></div><small>{{ captions.eventType }}</small></div>
        <div :ref="chartElements.eventType" class="action-chart" data-chart="action-event-type" @click.capture="focusEventType"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'overview'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><Building2 :size="15" /><span>品牌压力</span></div><small>{{ captions.brandPressure }}</small></div>
        <div :ref="chartElements.brand" class="action-chart" data-chart="action-brand-pressure" @click.capture="focusBrand"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'drivers'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><BarChart3 :size="15" /><span>评分构成</span></div><small>{{ captions.score }}</small></div>
        <div :ref="chartElements.score" class="action-chart" data-chart="action-score-mix" @click.capture="focusScoreDriver"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'drivers'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><BarChart3 :size="15" /><span>证据变化</span></div><small>{{ captions.evidenceMovement }}</small></div>
        <div :ref="chartElements.evidence" class="action-chart" data-chart="action-evidence-movement" @click.capture="focusEvidence"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'drivers'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><Tags :size="15" /><span>归因驱动</span></div><small>{{ captions.attribution }}</small></div>
        <div :ref="chartElements.attribution" class="action-chart" data-chart="action-attribution" @click.capture="focusAttribution"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'drivers'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><Tags :size="15" /><span>策略标签</span></div><small>{{ captions.strategy }}</small></div>
        <div :ref="chartElements.strategy" class="action-chart" data-chart="action-strategy" @click.capture="focusStrategy"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'followUp'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><CalendarClock :size="15" /><span>复盘节奏</span></div><small>{{ captions.reviewCadence }}</small></div>
        <div :ref="chartElements.review" class="action-chart" data-chart="action-review-cadence" @click.capture="focusReviewCadence"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'followUp'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><BarChart3 :size="15" /><span>7 日行动趋势</span></div><small>{{ captions.trend }}</small></div>
        <div :ref="chartElements.trend" class="action-chart" data-chart="action-trend"></div>
      </section>
    </ElCol>
    <ElCol v-if="activeGroup === 'followUp'" :xs="24" :lg="12" :xl="8">
      <section class="action-chart-card">
        <div class="chart-heading"><div class="chart-title"><Donut :size="15" /><span>复盘结果</span></div><small>{{ captions.reviewOutcome }}</small></div>
        <div :ref="chartElements.reviewOutcome" class="action-chart" data-chart="action-review-outcomes" @click.capture="focusReviewOutcome"></div>
      </section>
    </ElCol>
  </ElRow>
</template>

<style scoped>
.action-chart-grid { row-gap: 12px; }
.action-chart-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: grid; gap: 8px; min-width: 0; padding: 10px; }
.chart-heading { display: grid; gap: 3px; min-width: 0; }
.chart-title { align-items: center; color: #0f172a; display: flex; font-size: 12px; font-weight: 800; gap: 8px; }
.chart-heading small { color: #64748b; font-size: 11px; font-weight: 600; line-height: 1.35; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.action-chart { height: 210px; min-width: 0; width: 100%; }
[data-chart="action-trend"] { height: 230px; }
[data-chart]:not([data-chart="action-trend"]) { cursor: pointer; }
@media (max-width: 760px) {
  .action-chart { height: 220px; }
  .chart-heading small { white-space: normal; }
  [data-chart="action-trend"] { height: 260px; }
}
</style>
