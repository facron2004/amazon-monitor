<script setup lang="ts">
import { computed } from "vue";
import {
  inferInsightEventStrategyTags,
  insightEventStatusLabels,
  strategyTagLabels,
  type InsightEvent
} from "@amazon-monitor/shared";
import InsightScoreBadge from "./InsightScoreBadge.vue";

const props = defineProps<{
  currentDate: string;
  event: InsightEvent;
  selected: boolean;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
}>();

const strategyTags = computed(() => inferInsightEventStrategyTags(props.event));

const eventMeta = computed(() => {
  const parts = [props.event.brand || "Unknown brand", insightEventStatusLabels[props.event.status]];
  parts.push(props.event.assignee ? `Owner: ${props.event.assignee}` : "Unassigned");
  return parts.join(" / ");
});

const rowMeta = computed(() => {
  const owner = props.event.assignee ? `负责人 ${props.event.assignee}` : "未分配";
  return `${props.event.brand || "未知品牌"} · ${insightEventStatusLabels[props.event.status]} · ${owner}`;
});

const rankDelta = computed(() => {
  const value = props.event.evidence.rankChange;
  if (value === null || value === undefined) return "-";
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "持平";
});

const reviewDueTone = computed<"scheduled" | "today" | "overdue">(() => {
  const dueDate = props.event.reviewDueDate;
  if (!dueDate || !props.currentDate) return "scheduled";
  if (dueDate < props.currentDate) return "overdue";
  if (dueDate === props.currentDate) return "today";
  return "scheduled";
});

const reviewDueLabel = computed(() => {
  const dueDate = props.event.reviewDueDate;
  if (!dueDate) return "";
  if (reviewDueTone.value === "overdue") return `逾期 ${dueDate.slice(5)}`;
  if (reviewDueTone.value === "today") return "今日复盘";
  return `复盘 ${dueDate.slice(5)}`;
});
</script>

<template>
  <article
    class="action-row"
    :title="eventMeta"
    :class="{ 'action-row-selected': selected }"
    @click="emit('select', event)"
  >
    <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
    <div class="action-row-main">
      <span>{{ event.eventTitle }}</span>
      <small>{{ rowMeta }}</small>
      <div v-if="strategyTags.length || reviewDueLabel" class="row-cues strategy-row-tags">
        <span v-for="tag in strategyTags.slice(0, 2)" :key="tag" class="strategy-chip">{{ strategyTagLabels[tag] }}</span>
        <span v-if="strategyTags.length > 2" class="strategy-chip">+{{ strategyTags.length - 2 }}</span>
        <span v-if="reviewDueLabel" class="review-due-chip" :class="`review-due-chip-${reviewDueTone}`">{{ reviewDueLabel }}</span>
      </div>
    </div>
    <strong>{{ rankDelta }}</strong>
  </article>
</template>

<style scoped>
.action-row {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 54px;
  padding: 7px 8px;
}

.action-row:hover {
  background: #f1f5f9;
}

.action-row-selected {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.action-row :deep(.insight-score-badge) {
  border-radius: 7px;
  min-width: 38px;
  padding: 4px;
}

.action-row :deep(.insight-score-badge strong) {
  font-size: 13px;
}

.action-row :deep(.insight-score-badge small) {
  font-size: 9px;
  margin-top: 1px;
}

.action-row-main {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.action-row-main span {
  color: #0f172a;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-row-main small {
  color: #64748b;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-row > strong {
  color: #0f172a;
  font-size: 13px;
}

.row-cues {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.row-cues span {
  border-radius: 999px;
  font-size: 10px;
  line-height: 1;
  max-width: 128px;
  overflow: hidden;
  padding: 4px 6px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.strategy-chip {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.review-due-chip {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
}

.review-due-chip-today {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}

.review-due-chip-overdue {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
</style>
