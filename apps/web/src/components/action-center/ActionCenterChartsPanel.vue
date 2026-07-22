<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BarChart3 } from "@lucide/vue";
import { ElAlert, ElCard, ElEmpty, ElProgress, ElSegmented, ElStatistic, ElStep, ElSteps, ElTag } from "element-plus";
import type { AttributionTag, InsightEvent, InsightEventLevel, InsightEventTrendPoint, InsightEventType, InsightReviewResult, StrategyTag } from "@amazon-monitor/shared";
import type { InsightEventFilters } from "../../stores/insightEvents";
import type { ActionEvidenceMovementFilter } from "../../utils/actionCenterEvidenceDeltas";
import type { ReviewCadenceBucketKey } from "../../utils/actionCenterReviewCadence";
import ActionBrandPressurePanel from "./ActionBrandPressurePanel.vue";
import ActionCenterChartGrid from "./ActionCenterChartGrid.vue";
import { getActionFilterBadges, type ActionFilterKey } from "../../utils/actionCenterFilterSummary";
import type { ActionScoreDriverFilter } from "../../utils/actionCenterScoreBreakdown";
import {
  getActionChartPathSteps,
  getActionChartSummary,
  getActionChartTakeaways,
  getActionReviewQueueSummary,
  getBrandActionPressureRows,
  shouldPreferFollowUpChartGroup,
  type ActionChartPathStep,
  type ActionChartTakeaway
} from "../../utils/actionCenterChartOptions";
import type { WorkflowChartColumn } from "../../utils/actionCenterChartInteractions";

type ActionChartGroup = "overview" | "drivers" | "followUp";

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

const activeChartGroup = ref<ActionChartGroup>("overview");
const brandPressureRows = computed(() => getBrandActionPressureRows(props.events));
const hasChartData = computed(() => props.events.length > 0 || props.reviewDueEvents.length > 0 || props.trend.length > 0);
const chartSummary = computed(() => getActionChartSummary(props.events, props.trend));
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
  () => [props.events.length, props.reviewDueEvents.length],
  () => {
    if (shouldPreferFollowUpChartGroup(props.events, props.reviewDueEvents)) {
      activeChartGroup.value = "followUp";
    }
  },
  { immediate: true }
);


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

      <ActionCenterChartGrid
        :events="events"
        :review-due-events="reviewDueEvents"
        :trend="trend"
        :current-date="currentDate"
        :active-group="activeChartGroup"
        @focus-brand="emit('focus-brand', $event)"
        @focus-level="emit('focus-level', $event)"
        @focus-event-type="emit('focus-event-type', $event)"
        @focus-attribution="emit('focus-attribution', $event)"
        @focus-evidence-movement="emit('focus-evidence-movement', $event)"
        @focus-review-cadence="emit('focus-review-cadence', $event)"
        @focus-review-result="emit('focus-review-result', $event)"
        @focus-score-driver="emit('focus-score-driver', $event)"
        @focus-strategy="emit('focus-strategy', $event)"
        @select-workflow="emit('select-workflow', $event)"
      />

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

<style scoped src="../../styles/action-center-charts-panel.css"></style>
