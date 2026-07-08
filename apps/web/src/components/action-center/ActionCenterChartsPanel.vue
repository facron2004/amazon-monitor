<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BarChart3, Building2, CalendarClock, Donut, Tags } from "@lucide/vue";
import { ElAlert, ElCard, ElCol, ElEmpty, ElProgress, ElRow, ElSegmented, ElStatistic, ElStep, ElSteps, ElTag } from "element-plus";
import type { AttributionTag, InsightEvent, InsightEventLevel, InsightEventTrendPoint, InsightEventType, InsightReviewResult, StrategyTag } from "@amazon-monitor/shared";
import type { InsightEventFilters } from "../../stores/insightEvents";
import type { ActionEvidenceMovementFilter } from "../../utils/actionCenterEvidenceDeltas";
import type { ReviewCadenceBucketKey } from "../../utils/actionCenterReviewCadence";
import ActionBrandPressurePanel from "./ActionBrandPressurePanel.vue";
import { getActionFilterBadges, type ActionFilterKey } from "../../utils/actionCenterFilterSummary";
import {
  getActionScoreCompositionRows,
  type ActionScoreDriverFilter
} from "../../utils/actionCenterScoreBreakdown";
import { useEchartsCharts } from "../../composables/useEchartsCharts";
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
  getActionChartPathSteps,
  getActionChartSummary,
  getActionChartTakeaways,
  getActionReviewQueueSummary,
  getAttributionDriverData,
  getBrandActionPressureRows,
  getEvidenceMovementData,
  getEventTypeMixData,
  getPriorityMixData,
  getReviewOutcomeMixData,
  getStrategyFocusData,
  shouldPreferFollowUpChartGroup,
  type ActionChartPathStep,
  type ActionChartTakeaway
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

type ActionChartGroup = "overview" | "drivers" | "followUp";

const workflowBucketNames = ["待处理", "处理中", "已关闭"] as const;
const reviewCadenceBucketNames = ["已逾期", "今日到期", "待到期"] as const;
const chartGroupOptions: Array<{ label: string; value: ActionChartGroup }> = [
  { label: "总览", value: "overview" },
  { label: "驱动", value: "drivers" },
  { label: "复盘", value: "followUp" }
];

const props = defineProps<{
  events: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  trend: InsightEventTrendPoint[];
  currentDate: string;
  filters: InsightEventFilters;
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
  (event: "focus-review-due"): void;
  (event: "focus-strategy", tag: StrategyTag): void;
  (event: "clear-filter", key: ActionFilterKey): void;
  (event: "select", value: InsightEvent): void;
  (event: "select-workflow", column: WorkflowChartColumn): void;
}>();

const workflowChartEl = ref<HTMLDivElement | null>(null);
const priorityChartEl = ref<HTMLDivElement | null>(null);
const eventTypeChartEl = ref<HTMLDivElement | null>(null);
const scoreChartEl = ref<HTMLDivElement | null>(null);
const evidenceChartEl = ref<HTMLDivElement | null>(null);
const attributionChartEl = ref<HTMLDivElement | null>(null);
const strategyChartEl = ref<HTMLDivElement | null>(null);
const brandChartEl = ref<HTMLDivElement | null>(null);
const reviewChartEl = ref<HTMLDivElement | null>(null);
const reviewOutcomeChartEl = ref<HTMLDivElement | null>(null);
const trendChartEl = ref<HTMLDivElement | null>(null);

const activeChartGroup = ref<ActionChartGroup>("overview");
const { renderChartSpecs, disposeCharts } = useEchartsCharts();
const brandPressureRows = computed(() => getBrandActionPressureRows(props.events));
const hasChartData = computed(() => props.events.length > 0 || props.reviewDueEvents.length > 0 || props.trend.length > 0);
const chartSummary = computed(() => getActionChartSummary(props.events, props.trend));
const chartCaptions = computed(() => getActionChartCaptions(props.events, props.reviewDueEvents, props.trend, props.currentDate));
const chartTakeaways = computed(() => getActionChartTakeaways(props.events, props.reviewDueEvents, props.trend, props.currentDate));
const chartActionPathSteps = computed(() => getActionChartPathSteps(props.events, props.reviewDueEvents, props.trend, props.currentDate));
const reviewQueueSummary = computed(() => getActionReviewQueueSummary(props.events, props.reviewDueEvents, props.currentDate));
const chartScopeBadges = computed(() => getActionFilterBadges(props.filters).filter((badge) => badge.key !== "sortBy"));
const visibleChartScopeBadges = computed(() => chartScopeBadges.value.slice(0, 4));
const hiddenChartScopeCount = computed(() => Math.max(0, chartScopeBadges.value.length - visibleChartScopeBadges.value.length));
const topScoreDriverDetail = computed(() => {
  const driver = chartSummary.value.topScoreDriver;
  return driver ? `${driver.percent}% 分数占比` : "暂无评分压力";
});
const topEvidenceMovementDetail = computed(() => {
  const movement = chartSummary.value.topEvidenceMovement;
  return movement ? `${movement.value} 条匹配信号` : "暂无证据变化";
});
const topBrandPressureDetail = computed(() => {
  const pressure = chartSummary.value.topBrandPressure;
  if (!pressure) return "暂无品牌压力";
  const matrix = [
    pressure.matrixSurgeCount > 0 ? `上攻 ${pressure.matrixSurgeCount}` : null,
    pressure.matrixDropCount > 0 ? `下滑 ${pressure.matrixDropCount}` : null,
    pressure.brandTop100ShareChange !== null ? `份额 ${formatSignedPercent(pressure.brandTop100ShareChange)}` : null
  ].filter(Boolean);
  return matrix.length > 0 ? `${matrix.join(" / ")} / ${pressure.p0Count} P0` : `${pressure.eventCount} 条事件 / ${pressure.p0Count} P0`;
});
const topStrategyFocusDetail = computed(() => {
  const strategy = chartSummary.value.topStrategyFocus;
  return strategy ? `${strategy.value} 条策略信号` : "暂无策略标签";
});
const latestTrendDetail = computed(() => {
  const latestTrend = chartSummary.value.latestTrend;
  if (!latestTrend) return "暂无趋势";
  return `${latestTrend.date.slice(5)} / ${formatTrendDelta(chartSummary.value.trendDelta)}`;
});
const activeActionPathKey = computed<ActionChartPathStep["key"]>(() => {
  if (activeChartGroup.value === "drivers") return "driver";
  if (activeChartGroup.value === "followUp") return "followUp";
  return chartSummary.value.openCount > 0 ? "pressure" : "scope";
});
const activeActionPathIndex = computed(() => {
  const index = chartActionPathSteps.value.findIndex((step) => step.key === activeActionPathKey.value);
  return Math.max(0, index);
});

watch(
  () => [props.events, props.reviewDueEvents, props.trend, props.currentDate],
  () => {
    renderCharts();
  },
  { immediate: true }
);
watch(activeChartGroup, () => {
  disposeCharts();
  renderCharts();
});
watch(
  () => [props.events.length, props.reviewDueEvents.length],
  () => {
    if (shouldPreferFollowUpChartGroup(props.events, props.reviewDueEvents)) {
      activeChartGroup.value = "followUp";
    }
  },
  { immediate: true }
);

async function renderCharts(): Promise<void> {
  await renderChartSpecs(
    () => [
      { key: "workflow", element: workflowChartEl.value, option: buildWorkflowFunnelChartOption(props.events) },
      { key: "priority", element: priorityChartEl.value, option: buildPriorityMixChartOption(props.events) },
      { key: "eventType", element: eventTypeChartEl.value, option: buildEventTypeMixChartOption(props.events) },
      { key: "score", element: scoreChartEl.value, option: buildScoreCompositionChartOption(props.events) },
      { key: "evidence", element: evidenceChartEl.value, option: buildEvidenceMovementChartOption(props.events) },
      { key: "attribution", element: attributionChartEl.value, option: buildAttributionDriverChartOption(props.events) },
      { key: "strategy", element: strategyChartEl.value, option: buildStrategyFocusChartOption(props.events) },
      { key: "brand", element: brandChartEl.value, option: buildBrandActionPressureChartOption(props.events) },
      { key: "review", element: reviewChartEl.value, option: buildReviewCadenceChartOption(props.events, props.reviewDueEvents, props.currentDate) },
      { key: "reviewOutcome", element: reviewOutcomeChartEl.value, option: buildReviewOutcomeMixChartOption(props.events) },
      { key: "trend", element: trendChartEl.value, option: buildActionTrendChartOption(props.trend) }
    ],
    () => hasChartData.value
  );
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

function focusAttributionFromPointer(event: MouseEvent): void {
  const bucketNames = getAttributionDriverData(props.events).reverse().map((item) => item.name);
  const bucketName = verticalChartBucketNameFromPointer(event, bucketNames);
  const tag = attributionChartNameToTag(bucketName);
  if (tag) {
    emit("focus-attribution", tag);
  }
}

function focusEventTypeFromPointer(event: MouseEvent): void {
  const bucketNames = getEventTypeMixData(props.events).reverse().map((item) => item.name);
  const bucketName = verticalChartBucketNameFromPointer(event, bucketNames);
  const eventType = eventTypeChartNameToType(bucketName);
  if (eventType) {
    emit("focus-event-type", eventType);
  }
}

function focusEvidenceMovementFromPointer(event: MouseEvent): void {
  const bucketNames = getEvidenceMovementData(props.events).reverse().map((item) => item.name);
  const bucketName = verticalChartBucketNameFromPointer(event, bucketNames);
  const filter = evidenceMovementChartNameToFilter(bucketName);
  if (filter) {
    emit("focus-evidence-movement", filter);
  }
}

function focusScoreDriverFromPointer(event: MouseEvent): void {
  const target = event.currentTarget;
  if (!isRectTarget(target)) return;
  const rect = target.getBoundingClientRect();
  const bucketName = stackedScoreChartNameFromOffset(
    event.clientX - rect.left,
    rect.width,
    getActionScoreCompositionRows(props.events).map((row) => ({
      name: row.label,
      value: row.value
    }))
  );
  const filter = scoreDriverChartNameToFilter(bucketName);
  if (filter) {
    emit("focus-score-driver", filter);
  }
}

function focusTopScoreDriver(): void {
  const driver = chartSummary.value.topScoreDriver;
  if (!driver) return;
  activeChartGroup.value = "drivers";
  emit("focus-score-driver", driver.key);
}

function focusTopEvidenceMovement(): void {
  const movement = chartSummary.value.topEvidenceMovement;
  if (!movement) return;
  activeChartGroup.value = "drivers";
  emit("focus-evidence-movement", movement.filter);
}

function focusTopBrandPressure(): void {
  const pressure = chartSummary.value.topBrandPressure;
  if (!pressure) return;
  activeChartGroup.value = "overview";
  if (pressure.canFocus) {
    emit("focus-brand", pressure.brand);
  }
}

function focusTopStrategy(): void {
  const strategy = chartSummary.value.topStrategyFocus;
  if (!strategy) return;
  activeChartGroup.value = "drivers";
  emit("focus-strategy", strategy.tag);
}

function showLatestTrendChart(): void {
  if (!chartSummary.value.latestTrend) return;
  activeChartGroup.value = "followUp";
}

function focusReviewQueue(): void {
  if (reviewQueueSummary.value.totalCount === 0) return;
  activeChartGroup.value = "followUp";
  if (reviewQueueSummary.value.dueNowCount > 0) {
    emit("focus-review-due");
  }
}

function focusChartTakeaway(key: ActionChartTakeaway["key"]): void {
  if (!isChartTakeawayActionable(key)) return;
  if (key === "pressure") {
    focusTopBrandPressure();
    return;
  }
  if (key === "driver") {
    if (chartSummary.value.topScoreDriver) {
      focusTopScoreDriver();
    } else if (chartSummary.value.topEvidenceMovement) {
      focusTopEvidenceMovement();
    } else {
      focusTopStrategy();
    }
    return;
  }
  focusReviewQueue();
}

function focusActionPathStep(step: ActionChartPathStep): void {
  if (step.key === "scope") {
    activeChartGroup.value = "overview";
    return;
  }

  if (step.key === "pressure") {
    activeChartGroup.value = "overview";
    if (isChartTakeawayActionable("pressure")) {
      focusChartTakeaway("pressure");
    }
    return;
  }

  if (step.key === "driver") {
    activeChartGroup.value = "drivers";
    if (isChartTakeawayActionable("driver")) {
      focusChartTakeaway("driver");
    }
    return;
  }

  activeChartGroup.value = "followUp";
  if (isChartTakeawayActionable("followUp")) {
    focusChartTakeaway("followUp");
  }
}

function isChartTakeawayActionable(key: ActionChartTakeaway["key"]): boolean {
  if (key === "pressure") return chartSummary.value.topBrandPressure?.canFocus === true;
  if (key === "driver") {
    return Boolean(
      chartSummary.value.topScoreDriver
      || chartSummary.value.topEvidenceMovement
      || chartSummary.value.topStrategyFocus
    );
  }
  return reviewQueueSummary.value.totalCount > 0;
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

function focusReviewCadenceFromPointer(event: MouseEvent): void {
  const bucketName = chartBucketNameFromPointer(event, reviewCadenceBucketNames);
  const filter = reviewCadenceChartNameToFilter(bucketName);
  if (filter) {
    emit("focus-review-cadence", filter);
  }
}

function focusReviewOutcomeFromPointer(event: MouseEvent): void {
  const bucketName = pieChartNameFromPointer(event, getReviewOutcomeMixData(props.events));
  const result = reviewOutcomeChartNameToResult(bucketName);
  if (result) {
    emit("focus-review-result", result);
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

function formatTrendDelta(delta: number | null): string {
  if (delta === null) return "无对比";
  if (delta === 0) return "持平";
  return `${delta > 0 ? "+" : ""}${delta} 条信号`;
}

function formatSignedPercent(value: number): string {
  const percent = Math.round(value * 1000) / 10;
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

</script>

<template>
  <ElCard shadow="never" class="action-chart-panel">
    <template #header>
      <div class="chart-panel-header">
        <div class="chart-panel-heading">
          <div class="chart-panel-title">
            <BarChart3 :size="16" />
            <span>行动图表</span>
          </div>
          <div class="chart-scope-row" aria-label="图表筛选范围">
            <span class="chart-scope-label">范围</span>
            <ElTag v-if="visibleChartScopeBadges.length === 0" size="small" effect="plain" round disable-transitions>
              全局行动视图
            </ElTag>
            <ElTag
              v-for="badge in visibleChartScopeBadges"
              :key="badge.key"
              size="small"
              effect="plain"
              closable
              round
              disable-transitions
              @close="emit('clear-filter', badge.key)"
            >
              {{ badge.label }}: {{ badge.value }}
            </ElTag>
            <ElTag v-if="hiddenChartScopeCount > 0" size="small" effect="plain" round disable-transitions>
              +{{ hiddenChartScopeCount }} 个
            </ElTag>
          </div>
        </div>
        <ElSegmented v-model="activeChartGroup" :options="chartGroupOptions" size="small" />
      </div>
    </template>

    <ElEmpty v-if="!hasChartData" description="当前没有可视化事件" :image-size="70" />
    <div v-else class="action-chart-stack">
      <div class="chart-summary-strip" aria-label="图表摘要">
        <div class="chart-summary-item">
          <ElStatistic title="可见信号" :value="chartSummary.visibleCount" />
        </div>
        <div class="chart-summary-item">
          <ElStatistic title="打开动作" :value="chartSummary.openCount" />
          <small>{{ chartSummary.reviewedCount }} 个已复盘</small>
        </div>
        <button
          v-if="chartSummary.topScoreDriver"
          type="button"
          class="chart-summary-item chart-summary-action"
          aria-label="聚焦最高评分驱动"
          @click="focusTopScoreDriver"
        >
          <span>最高评分驱动</span>
          <strong>{{ chartSummary.topScoreDriver.label }}</strong>
          <small>{{ topScoreDriverDetail }}</small>
        </button>
        <div v-else class="chart-summary-item">
          <span>最高评分驱动</span>
          <strong>暂无</strong>
          <small>{{ topScoreDriverDetail }}</small>
        </div>
        <button
          v-if="chartSummary.topEvidenceMovement"
          type="button"
          class="chart-summary-item chart-summary-action"
          aria-label="聚焦最高证据变化"
          @click="focusTopEvidenceMovement"
        >
          <span>最高证据变化</span>
          <strong>{{ chartSummary.topEvidenceMovement.label }}</strong>
          <small>{{ topEvidenceMovementDetail }}</small>
        </button>
        <div v-else class="chart-summary-item">
          <span>最高证据变化</span>
          <strong>暂无</strong>
          <small>{{ topEvidenceMovementDetail }}</small>
        </div>
        <button
          v-if="chartSummary.topBrandPressure?.canFocus"
          type="button"
          class="chart-summary-item chart-summary-action"
          aria-label="聚焦最高品牌压力"
          @click="focusTopBrandPressure"
        >
          <span>最高品牌压力</span>
          <strong>{{ chartSummary.topBrandPressure.brand }}</strong>
          <small>{{ topBrandPressureDetail }}</small>
        </button>
        <div v-else class="chart-summary-item">
          <span>最高品牌压力</span>
          <strong>{{ chartSummary.topBrandPressure?.brand ?? "暂无" }}</strong>
          <small>{{ topBrandPressureDetail }}</small>
        </div>
        <button
          v-if="chartSummary.topStrategyFocus"
          type="button"
          class="chart-summary-item chart-summary-action"
          aria-label="聚焦最高策略标签"
          @click="focusTopStrategy"
        >
          <span>最高策略标签</span>
          <strong>{{ chartSummary.topStrategyFocus.label }}</strong>
          <small>{{ topStrategyFocusDetail }}</small>
        </button>
        <div v-else class="chart-summary-item">
          <span>最高策略标签</span>
          <strong>暂无</strong>
          <small>{{ topStrategyFocusDetail }}</small>
        </div>
        <button
          v-if="reviewQueueSummary.totalCount > 0"
          type="button"
          class="chart-summary-item chart-summary-action chart-summary-review"
          aria-label="聚焦复盘队列"
          @click="focusReviewQueue"
        >
          <span>复盘队列</span>
          <strong>{{ reviewQueueSummary.totalCount }}</strong>
          <small>
            <ElTag :type="reviewQueueSummary.healthTone" effect="light" round size="small">
              {{ reviewQueueSummary.healthLabel }}
            </ElTag>
          </small>
          <ElProgress :percentage="reviewQueueSummary.dueNowPercent" :show-text="false" />
        </button>
        <div v-else class="chart-summary-item">
          <span>复盘队列</span>
          <strong>0</strong>
          <small>暂无复盘队列</small>
        </div>
        <button
          v-if="chartSummary.latestTrend"
          type="button"
          class="chart-summary-item chart-summary-action"
          aria-label="显示最新趋势图"
          @click="showLatestTrendChart"
        >
          <span>最新趋势</span>
          <strong>{{ chartSummary.latestTrend.totalCount }}</strong>
          <small>{{ latestTrendDetail }}</small>
        </button>
        <div v-else class="chart-summary-item">
          <span>最新趋势</span>
          <strong>0</strong>
          <small>{{ latestTrendDetail }}</small>
        </div>
      </div>

      <div class="chart-action-path" aria-label="行动路径">
        <ElSteps
          :active="activeActionPathIndex"
          finish-status="success"
          align-center
          class="chart-action-steps"
        >
          <ElStep
            v-for="step in chartActionPathSteps"
            :key="step.key"
            :title="step.label"
            :description="step.title"
            :status="step.status"
          />
        </ElSteps>
        <div class="chart-action-path-actions">
          <button
            v-for="step in chartActionPathSteps"
            :key="step.key"
            type="button"
            :class="['chart-path-action', { 'is-active': step.key === activeActionPathKey }]"
            :aria-pressed="step.key === activeActionPathKey"
            @click="focusActionPathStep(step)"
          >
            <span>{{ step.label }}</span>
            <strong>{{ step.title }}</strong>
            <small>{{ step.detail }}</small>
            <ElTag size="small" effect="plain" round disable-transitions>
              {{ step.actionLabel }}
            </ElTag>
          </button>
        </div>
      </div>

      <div class="chart-takeaway-strip" aria-label="图表结论">
        <ElAlert
          v-for="takeaway in chartTakeaways"
          :key="takeaway.key"
          :type="takeaway.tone"
          :closable="false"
          show-icon
          :class="['chart-takeaway', { 'is-actionable': isChartTakeawayActionable(takeaway.key) }]"
          :role="isChartTakeawayActionable(takeaway.key) ? 'button' : undefined"
          :tabindex="isChartTakeawayActionable(takeaway.key) ? 0 : undefined"
          @click="focusChartTakeaway(takeaway.key)"
          @keydown.enter.prevent="focusChartTakeaway(takeaway.key)"
          @keydown.space.prevent="focusChartTakeaway(takeaway.key)"
        >
          <template #title>
            <span class="chart-takeaway-label">{{ takeaway.label }}</span>
            <strong>{{ takeaway.title }}</strong>
          </template>
          <span class="chart-takeaway-detail">
            {{ takeaway.detail }}
            <ElTag
              v-if="isChartTakeawayActionable(takeaway.key) && takeaway.actionLabel"
              size="small"
              effect="plain"
              round
              disable-transitions
            >
              {{ takeaway.actionLabel }}
            </ElTag>
          </span>
        </ElAlert>
      </div>

      <ElRow :gutter="12" class="action-chart-grid">
        <ElCol v-if="activeChartGroup === 'overview'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <BarChart3 :size="15" />
                <span>行动漏斗</span>
              </div>
              <small>{{ chartCaptions.workflow }}</small>
            </div>
            <div
              ref="workflowChartEl"
              class="action-chart"
              data-chart="action-workflow"
              @click.capture="selectWorkflowFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'overview'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <Donut :size="15" />
                <span>优先级分布</span>
              </div>
              <small>{{ chartCaptions.priority }}</small>
            </div>
            <div
              ref="priorityChartEl"
              class="action-chart"
              data-chart="action-priority"
              @click.capture="focusPriorityFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'overview'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <BarChart3 :size="15" />
                <span>事件类型分布</span>
              </div>
              <small>{{ chartCaptions.eventType }}</small>
            </div>
            <div
              ref="eventTypeChartEl"
              class="action-chart"
              data-chart="action-event-type"
              @click.capture="focusEventTypeFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'overview'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <Building2 :size="15" />
                <span>品牌压力</span>
              </div>
              <small>{{ chartCaptions.brandPressure }}</small>
            </div>
            <div
              ref="brandChartEl"
              class="action-chart"
              data-chart="action-brand-pressure"
              @click.capture="focusBrandFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'drivers'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <BarChart3 :size="15" />
                <span>评分构成</span>
              </div>
              <small>{{ chartCaptions.score }}</small>
            </div>
            <div
              ref="scoreChartEl"
              class="action-chart"
              data-chart="action-score-mix"
              @click.capture="focusScoreDriverFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'drivers'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <BarChart3 :size="15" />
                <span>证据变化</span>
              </div>
              <small>{{ chartCaptions.evidenceMovement }}</small>
            </div>
            <div
              ref="evidenceChartEl"
              class="action-chart"
              data-chart="action-evidence-movement"
              @click.capture="focusEvidenceMovementFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'drivers'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <Tags :size="15" />
                <span>归因驱动</span>
              </div>
              <small>{{ chartCaptions.attribution }}</small>
            </div>
            <div
              ref="attributionChartEl"
              class="action-chart"
              data-chart="action-attribution"
              @click.capture="focusAttributionFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'drivers'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <Tags :size="15" />
                <span>策略标签</span>
              </div>
              <small>{{ chartCaptions.strategy }}</small>
            </div>
            <div
              ref="strategyChartEl"
              class="action-chart"
              data-chart="action-strategy"
              @click.capture="focusStrategyFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'followUp'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <CalendarClock :size="15" />
                <span>复盘节奏</span>
              </div>
              <small>{{ chartCaptions.reviewCadence }}</small>
            </div>
            <div
              ref="reviewChartEl"
              class="action-chart"
              data-chart="action-review-cadence"
              @click.capture="focusReviewCadenceFromPointer"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'followUp'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <BarChart3 :size="15" />
                <span>7 日行动趋势</span>
              </div>
              <small>{{ chartCaptions.trend }}</small>
            </div>
            <div
              ref="trendChartEl"
              class="action-chart"
              data-chart="action-trend"
            ></div>
          </section>
        </ElCol>
        <ElCol v-if="activeChartGroup === 'followUp'" :xs="24" :lg="12" :xl="8">
          <section class="action-chart-card">
            <div class="chart-heading">
              <div class="chart-title">
                <Donut :size="15" />
                <span>复盘结果</span>
              </div>
              <small>{{ chartCaptions.reviewOutcome }}</small>
            </div>
            <div
              ref="reviewOutcomeChartEl"
              class="action-chart"
              data-chart="action-review-outcomes"
              @click.capture="focusReviewOutcomeFromPointer"
            ></div>
          </section>
        </ElCol>
      </ElRow>

      <ActionBrandPressurePanel
        v-if="brandPressureRows.length"
        :rows="brandPressureRows"
        :events="events"
        @focus-brand="emit('focus-brand', $event)"
        @select="emit('select', $event)"
      />
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

.chart-summary-strip {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.chart-summary-item {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 9px 10px;
}

button.chart-summary-item {
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.chart-summary-action {
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.chart-summary-action:hover {
  border-color: #93c5fd;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.10);
  transform: translateY(-1px);
}

.chart-summary-action:focus-visible {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
  outline: none;
}

.chart-summary-item span,
.chart-summary-item small {
  color: #64748b;
  font-size: 12px;
}

.chart-summary-item strong {
  color: #0f172a;
  display: -webkit-box;
  font-size: 18px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}

.chart-summary-item :deep(.el-statistic__head) {
  color: #64748b;
  font-size: 12px;
  margin-bottom: 2px;
}

.chart-summary-item :deep(.el-statistic__content) {
  color: #0f172a;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.2;
}

.chart-summary-review :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.chart-action-path {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 10px;
}

.chart-action-steps {
  min-width: 0;
}

.chart-action-steps :deep(.el-step__title) {
  color: #334155;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.25;
}

.chart-action-steps :deep(.el-step__description) {
  color: #64748b;
  display: -webkit-box;
  font-size: 11px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.25;
  max-width: 160px;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
}

.chart-action-path-actions {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.chart-path-action {
  align-items: flex-start;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 4px;
  min-width: 0;
  padding: 9px;
  text-align: left;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.chart-path-action:hover {
  border-color: #93c5fd;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.1);
  transform: translateY(-1px);
}

.chart-path-action:focus-visible {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
  outline: none;
}

.chart-path-action.is-active {
  border-color: #2563eb;
  box-shadow: inset 3px 0 0 #2563eb;
}

.chart-path-action span,
.chart-path-action small {
  color: #64748b;
  font-size: 11px;
  line-height: 1.25;
}

.chart-path-action strong {
  color: #0f172a;
  display: -webkit-box;
  font-size: 13px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.25;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
}

.chart-path-action :deep(.el-tag) {
  justify-self: start;
  max-width: 100%;
}

.chart-path-action :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.chart-panel-header {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.chart-panel-heading {
  display: grid;
  gap: 8px;
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

.chart-scope-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.chart-scope-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.chart-scope-row :deep(.el-tag__content) {
  max-width: 176px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chart-takeaway-strip {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.chart-takeaway {
  min-width: 0;
}

.chart-takeaway.is-actionable {
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.chart-takeaway.is-actionable:hover {
  border-color: #93c5fd;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.1);
}

.chart-takeaway.is-actionable:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.chart-takeaway :deep(.el-alert__content) {
  min-width: 0;
}

.chart-takeaway :deep(.el-alert__title) {
  align-items: baseline;
  display: flex;
  gap: 6px;
  min-width: 0;
}

.chart-takeaway :deep(.el-alert__title strong) {
  color: #0f172a;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.chart-takeaway :deep(.el-alert__description) {
  color: #475569;
  font-size: 12px;
  margin-top: 4px;
}

.chart-takeaway-detail {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chart-takeaway-label {
  color: #64748b;
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 800;
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

.chart-heading {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.chart-heading small {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-chart {
  height: 210px;
  min-width: 0;
  width: 100%;
}

[data-chart="action-trend"] {
  height: 230px;
}

[data-chart="action-workflow"],
[data-chart="action-priority"],
[data-chart="action-event-type"],
[data-chart="action-score-mix"],
[data-chart="action-evidence-movement"],
[data-chart="action-attribution"],
[data-chart="action-strategy"],
[data-chart="action-brand-pressure"],
[data-chart="action-review-cadence"],
[data-chart="action-review-outcomes"] {
  cursor: pointer;
}

@media (max-width: 1100px) {
  .chart-summary-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .chart-action-path-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-takeaway-strip {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .chart-panel-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .chart-panel-header :deep(.el-segmented) {
    width: 100%;
  }

  .chart-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-action-steps {
    display: none;
  }

  .chart-action-path-actions {
    grid-template-columns: 1fr;
  }

  .chart-takeaway :deep(.el-alert__title) {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .action-chart {
    height: 220px;
  }

  .chart-heading small {
    white-space: normal;
  }

  [data-chart="action-trend"] {
    height: 260px;
  }
}

@media (max-width: 340px) {
  .chart-summary-strip {
    grid-template-columns: 1fr;
  }
}
</style>
