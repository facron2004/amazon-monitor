<script setup lang="ts">
import { computed } from "vue";
import { Clock3 } from "@lucide/vue";
import {
  insightEventStatusLabels,
  insightEventTypeLabels,
  type InsightEvent
} from "@amazon-monitor/shared";
import { ElCard, ElEmpty, ElTable, ElTableColumn, ElTag, ElTooltip } from "element-plus";

const props = defineProps<{
  events: InsightEvent[];
  currentDate: string;
}>();

type TagType = "danger" | "warning" | "info";

interface ReviewQueueRow {
  id: string;
  dueLabel: string;
  dueTone: TagType;
  target: string;
  subtitle: string;
  scoreTotal: number;
  statusLabel: string;
  suggestedAction: string;
}

const reviewRows = computed<ReviewQueueRow[]>(() => props.events.slice(0, 8).map((event) => ({
  id: event.id,
  dueLabel: dueLabel(event),
  dueTone: dueTone(event),
  target: event.brand || event.asin || "未知对象",
  subtitle: event.asin || insightEventTypeLabels[event.eventType],
  scoreTotal: event.scoreTotal,
  statusLabel: insightEventStatusLabels[event.status],
  suggestedAction: event.suggestedAction
})));

function dueTone(event: InsightEvent): TagType {
  if (!event.reviewDueDate || !props.currentDate) return "info";
  if (event.reviewDueDate < props.currentDate) return "danger";
  if (event.reviewDueDate === props.currentDate) return "warning";
  return "info";
}

function dueLabel(event: InsightEvent): string {
  if (!event.reviewDueDate) return "-";
  if (!props.currentDate) return event.reviewDueDate;
  if (event.reviewDueDate < props.currentDate) return `逾期 ${event.reviewDueDate.slice(5)}`;
  if (event.reviewDueDate === props.currentDate) return "今日";
  return event.reviewDueDate.slice(5);
}
</script>

<template>
  <ElCard shadow="never" class="review-queue-card">
    <template #header>
      <div class="panel-title">
        <Clock3 :size="16" />
        <span>复盘队列</span>
        <ElTag size="small" type="warning" effect="light">{{ events.length }}</ElTag>
      </div>
    </template>

    <ElTable v-if="reviewRows.length" :data="reviewRows" size="small" class="review-table" height="286" row-key="id">
      <ElTableColumn label="到期" width="86">
        <template #default="{ row }">
          <ElTag size="small" :type="row.dueTone" effect="plain" round>{{ row.dueLabel }}</ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="对象" min-width="138" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="target-cell">
            <strong>{{ row.target }}</strong>
            <small>{{ row.subtitle }}</small>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="分" width="52">
        <template #default="{ row }">{{ row.scoreTotal }}</template>
      </ElTableColumn>
      <ElTableColumn label="状态" width="88">
        <template #default="{ row }">
          <ElTag size="small" effect="plain" round>{{ row.statusLabel }}</ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="下一步" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <ElTooltip :content="row.suggestedAction" placement="top" :show-after="350">
            <span class="action-text">{{ row.suggestedAction }}</span>
          </ElTooltip>
        </template>
      </ElTableColumn>
    </ElTable>
    <ElEmpty v-else description="当前窗口暂无待复盘事项。" :image-size="72" />
  </ElCard>
</template>

<style scoped>
.review-queue-card {
  min-width: 0;
}

.panel-title {
  align-items: center;
  color: #0f172a;
  display: flex;
  font-size: 13px;
  font-weight: 800;
  gap: 8px;
  text-transform: uppercase;
}

.review-table {
  width: 100%;
}

.target-cell {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.target-cell strong,
.target-cell small,
.action-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-cell strong {
  color: #0f172a;
  font-size: 12px;
}

.target-cell small,
.action-text {
  color: #64748b;
  font-size: 12px;
}
</style>
