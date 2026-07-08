<script setup lang="ts">
import { computed } from "vue";
import { Activity, ArrowRight, Clock3 } from "@lucide/vue";
import { ElCard, ElEmpty, ElProgress, ElStatistic, ElTag, ElTimeline, ElTimelineItem } from "element-plus";
import type { InsightEvent, InsightEventLevel } from "@amazon-monitor/shared";
import {
  getActionSignalFlowRows,
  getActionSignalFlowStageRows,
  getActionSignalFlowSummary,
  type ActionSignalFlowStageKey,
  type ActionSignalFlowRow
} from "../../utils/actionCenterSignalFlow";

const props = withDefaults(defineProps<{
  events: InsightEvent[];
  currentDate: string;
  limit?: number;
  activeStage?: ActionSignalFlowStageKey | "";
}>(), {
  limit: 6,
  activeStage: ""
});

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
  (event: "focus-stage", value: ActionSignalFlowStageKey): void;
}>();

const rows = computed(() => getActionSignalFlowRows(props.events, props.currentDate, props.limit));
const summary = computed(() => getActionSignalFlowSummary(props.events, props.currentDate, props.limit));
const stageRows = computed(() => getActionSignalFlowStageRows(props.events, props.currentDate));

function selectRow(row: ActionSignalFlowRow): void {
  const event = props.events.find((item) => item.id === row.id);
  if (event) {
    emit("select", event);
  }
}

function levelTagType(level: InsightEventLevel): "danger" | "warning" | "info" {
  if (level === "P0") return "danger";
  if (level === "P1") return "warning";
  return "info";
}

function timelineType(row: ActionSignalFlowRow): "danger" | "warning" | "primary" {
  if (row.isReviewDue || row.level === "P0") return "danger";
  if (row.level === "P1") return "warning";
  return "primary";
}

function progressStatus(tone: "danger" | "warning" | "success" | "info"): "exception" | "warning" | "success" | undefined {
  if (tone === "danger") return "exception";
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  return undefined;
}
</script>

<template>
  <ElCard shadow="never" class="signal-flow-panel">
    <template #header>
      <div class="signal-flow-header">
        <div>
          <span>
            <Activity :size="16" />
            信息流
          </span>
          <small>按复盘到期、优先级和分数组织当前可见事件</small>
        </div>
        <strong>{{ rows.length }} / {{ events.length }}</strong>
      </div>
    </template>

    <ElEmpty v-if="rows.length === 0" description="当前筛选下暂无可见事件" :image-size="64" />
    <div v-else class="signal-flow-body">
      <div class="signal-flow-metrics">
        <ElStatistic title="可见队列" :value="summary.totalCount" />
        <section class="signal-flow-metric">
          <span>展示条数</span>
          <strong>{{ summary.renderedCount }}</strong>
          <small>按到期、等级、分数取前 {{ limit }} 条</small>
        </section>
        <section class="signal-flow-metric">
          <span>到期 / P0 压力</span>
          <strong>{{ summary.dueNowCount }} / {{ summary.p0Count }}</strong>
          <ElTag :type="summary.pressureTone" effect="light" round>{{ summary.pressureLabel }}</ElTag>
        </section>
        <section class="signal-flow-metric">
          <span>平均分</span>
          <strong>{{ summary.averageScore }}</strong>
          <ElProgress :percentage="summary.averageScorePercent" :show-text="false" />
        </section>
      </div>

      <div class="signal-stage-board" aria-label="信息流行动阶段分布">
        <button
          v-for="stage in stageRows"
          :key="stage.key"
          type="button"
          :class="['signal-stage-row', { 'is-active': activeStage === stage.key }]"
          :disabled="stage.count === 0"
          @click="emit('focus-stage', stage.key)"
        >
          <div class="signal-stage-main">
            <ElTag :type="stage.tone" effect="light" round>{{ stage.label }}</ElTag>
            <strong>{{ stage.count }}</strong>
          </div>
          <ElProgress :percentage="stage.percent" :show-text="false" :status="progressStatus(stage.tone)" />
          <small>{{ stage.detail }} · {{ stage.percent }}%</small>
        </button>
      </div>

      <ElTimeline class="signal-timeline">
      <ElTimelineItem
        v-for="row in rows"
        :key="row.id"
        :timestamp="row.timestampLabel"
        :type="timelineType(row)"
        hollow
      >
        <button type="button" class="signal-flow-item" @click="selectRow(row)">
          <span class="signal-flow-title">
            <span>
              <ElTag :type="levelTagType(row.level)" effect="dark" round>{{ row.level }}</ElTag>
              <ElTag v-if="row.isReviewDue" type="danger" effect="light" round>
                <Clock3 :size="12" />
                复盘到期
              </ElTag>
              <ElTag :type="row.actionStageTone" effect="light" round>{{ row.actionStageLabel }}</ElTag>
              <ElTag effect="plain" round>{{ row.statusLabel }}</ElTag>
            </span>
            <ArrowRight :size="15" />
          </span>

          <strong>{{ row.title }}</strong>
          <small>{{ row.summary }}</small>

          <span class="signal-next-action">
            <b>{{ row.driverLabel }}</b>
            <em>{{ row.nextActionLabel }}</em>
          </span>

          <span class="signal-flow-meta">
            <em>{{ row.typeLabel }}</em>
            <em>{{ row.brandLabel }}</em>
            <em>{{ row.asinLabel }}</em>
          </span>

          <span class="signal-score">
            <ElProgress :percentage="row.scorePercent" :show-text="false" />
            <b>{{ row.scoreTotal }}</b>
          </span>
        </button>
      </ElTimelineItem>
      </ElTimeline>
    </div>
  </ElCard>
</template>

<style scoped>
.signal-flow-panel {
  flex: 0 0 auto;
  min-width: 0;
}

.signal-flow-panel :deep(.el-card__body) {
  padding-bottom: 6px;
}

.signal-flow-body {
  display: grid;
  gap: 12px;
}

.signal-flow-header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.signal-flow-header div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.signal-flow-header span {
  align-items: center;
  color: #0f172a;
  display: inline-flex;
  font-size: 13px;
  font-weight: 800;
  gap: 8px;
  text-transform: uppercase;
}

.signal-flow-header small {
  color: #64748b;
  font-size: 12px;
}

.signal-flow-header strong {
  color: #0f766e;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.signal-flow-metrics {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.signal-flow-metrics :deep(.el-statistic),
.signal-flow-metric {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  padding: 9px 10px;
}

.signal-flow-metrics :deep(.el-statistic__head),
.signal-flow-metric span,
.signal-flow-metric small {
  color: #64748b;
  font-size: 12px;
}

.signal-flow-metrics :deep(.el-statistic__content),
.signal-flow-metric strong {
  color: #0f172a;
  display: block;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  margin-top: 3px;
}

.signal-flow-metric {
  display: grid;
  gap: 5px;
}

.signal-timeline {
  display: grid;
  margin: 0;
  padding: 2px 0 0 2px;
}

.signal-flow-item {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  text-align: left;
  width: 100%;
}

.signal-flow-item:hover {
  border-color: #14b8a6;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.signal-flow-title {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  min-width: 0;
}

.signal-flow-title > span,
.signal-flow-meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.signal-flow-title svg {
  color: #64748b;
  flex: 0 0 auto;
}

.signal-flow-title :deep(.el-tag__content) {
  align-items: center;
  display: inline-flex;
  gap: 4px;
}

.signal-flow-item strong {
  color: #0f172a;
  font-size: 14px;
  line-height: 1.35;
}

.signal-flow-item small {
  color: #64748b;
  display: -webkit-box;
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.signal-next-action {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
}

.signal-next-action b {
  color: #0f172a;
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signal-next-action em {
  color: #64748b;
  display: -webkit-box;
  font-size: 12px;
  font-style: normal;
  line-height: 1.4;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.signal-flow-meta em {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  color: #475569;
  font-size: 11px;
  font-style: normal;
  line-height: 1;
  max-width: 180px;
  overflow: hidden;
  padding: 5px 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signal-score {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(80px, 1fr) auto;
}

.signal-score b {
  color: #0f172a;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.signal-score :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.signal-flow-metric :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.signal-stage-board {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.signal-stage-row {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 7px;
  min-width: 0;
  padding: 9px 10px;
  text-align: left;
}

.signal-stage-row:hover:not(:disabled),
.signal-stage-row.is-active {
  border-color: #14b8a6;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}

.signal-stage-row:disabled {
  cursor: default;
  opacity: 0.72;
}

.signal-stage-main {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
}

.signal-stage-main strong {
  color: #0f172a;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.signal-stage-row small {
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signal-stage-row :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

@media (max-width: 760px) {
  .signal-flow-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .signal-flow-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .signal-stage-board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .signal-flow-meta em {
    max-width: 100%;
  }
}

@media (max-width: 560px) {
  .signal-flow-metrics {
    grid-template-columns: 1fr;
  }

  .signal-stage-board {
    grid-template-columns: 1fr;
  }
}
</style>
