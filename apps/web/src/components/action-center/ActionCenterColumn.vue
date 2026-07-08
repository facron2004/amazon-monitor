<script setup lang="ts">
import { computed, type Component } from "vue";
import { CheckCircle2, Eye, ListTodo } from "@lucide/vue";
import { ElProgress, ElTag } from "element-plus";
import type { InsightEvent, InsightEventStatus } from "@amazon-monitor/shared";
import ActionCenterRow from "./ActionCenterRow.vue";
import { buildActionColumnSummary } from "../../utils/actionCenterColumnSummary";

type ActionColumnKey = "todo" | "mid" | "closed";

const props = defineProps<{
  column: ActionColumnKey;
  currentDate: string;
  events: InsightEvent[];
  selectedEventId?: string | null;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
  (event: "status", id: string, status: InsightEventStatus): void;
  (event: "watch", id: string): void;
}>();

const columnConfig: Record<ActionColumnKey, { icon: Component; label: string; emptyText: string }> = {
  todo: { icon: ListTodo, label: "待处理", emptyText: "没有待处理事件" },
  mid: { icon: Eye, label: "观察 / 待复盘", emptyText: "没有观察 / 待复盘事件" },
  closed: { icon: CheckCircle2, label: "已跟进 / 已复盘", emptyText: "没有已结束事件" }
};
const summary = computed(() => buildActionColumnSummary(props.events, props.currentDate));
const pressureTone = computed(() => {
  if (summary.value.p0Count > 0 || summary.value.dueNowCount > 0) return "danger";
  if (summary.value.averageScore >= 70) return "warning";
  return "info";
});
</script>

<template>
  <section class="action-column">
    <header>
      <component :is="columnConfig[props.column].icon" :size="14" />
      <span>{{ columnConfig[props.column].label }} · {{ events.length }}</span>
    </header>

    <div v-if="events.length" class="column-summary">
      <div class="summary-score">
        <span>
          <small>平均分</small>
          <strong>{{ summary.averageScore }}</strong>
        </span>
        <ElProgress :percentage="summary.averageScore" :show-text="false" />
      </div>
      <div class="summary-cues">
        <ElTag :type="pressureTone" effect="light" round>{{ summary.totalScore }} 分</ElTag>
        <ElTag :type="summary.p0Count > 0 ? 'danger' : 'info'" effect="light" round>{{ summary.p0Count }} P0</ElTag>
        <ElTag :type="summary.dueNowCount > 0 ? 'warning' : 'info'" effect="light" round>{{ summary.dueNowCount }} 到期</ElTag>
      </div>
      <div class="summary-owner">
        <span>负责人覆盖</span>
        <strong>{{ summary.assignedPercent }}%</strong>
      </div>
    </div>

    <div v-if="events.length" class="action-column-rows">
      <ActionCenterRow
        v-for="event in events"
        :key="event.id"
        :current-date="currentDate"
        :event="event"
        :selected="selectedEventId === event.id"
        @select="emit('select', $event)"
        @status="(id, status) => emit('status', id, status)"
        @watch="emit('watch', $event)"
      />
    </div>

    <p v-else class="empty-copy">{{ columnConfig[props.column].emptyText }}</p>
  </section>
</template>

<style scoped>
.action-column {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 12px;
}

.action-column > header {
  align-items: center;
  color: #64748b;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  gap: 6px;
  letter-spacing: 0.02em;
  padding-bottom: 4px;
  text-transform: uppercase;
}

.column-summary {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 9px;
}

.summary-score {
  display: grid;
  gap: 7px;
}

.summary-score > span,
.summary-owner {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
}

.summary-score small,
.summary-owner span {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.summary-score strong,
.summary-owner strong {
  color: #0f172a;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.summary-cues {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.column-summary :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.action-column-rows {
  display: grid;
  flex: 1 1 auto;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.empty-copy {
  color: #64748b;
  font-size: 13px;
  margin: 12px 0;
  text-align: center;
}

@media (max-width: 1180px) {
  .action-column {
    min-height: auto;
  }

  .action-column-rows {
    flex: 0 1 auto;
    max-height: 420px;
    overflow-y: auto;
  }
}

@media (max-width: 760px) {
  .action-column-rows {
    max-height: 360px;
  }
}
</style>
