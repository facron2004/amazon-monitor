<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2, Eye, XCircle } from "@lucide/vue";
import { ElButton, ElButtonGroup, ElTag } from "element-plus";
import {
  attributionTagLabels,
  inferInsightEventStrategyTags,
  insightEventStatusLabels,
  insightEventTypeLabels,
  strategyTagLabels,
  type InsightEvent,
  type InsightEventStatus
} from "@amazon-monitor/shared";
import InsightScoreBadge from "./InsightScoreBadge.vue";

const props = defineProps<{
  currentDate: string;
  event: InsightEvent;
  selected: boolean;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
  (event: "status", id: string, status: InsightEventStatus): void;
  (event: "watch", id: string): void;
}>();

const strategyTags = computed(() => inferInsightEventStrategyTags(props.event));

const eventMeta = computed(() => {
  const parts = [props.event.brand || "Unknown brand", insightEventStatusLabels[props.event.status]];
  parts.push(props.event.assignee ? `Owner: ${props.event.assignee}` : "Unassigned");
  return parts.join(" / ");
});

const firstEvidence = computed(() => (
  props.event.evidence.evidenceItems[0]
  ?? props.event.eventSummary.split("\n")[0]
  ?? props.event.suggestedAction
));

const actionable = computed(() => !["FOLLOWED", "IGNORED", "REVIEWED"].includes(props.event.status));
const currentRank = computed(() => formatRank(props.event.evidence.currentRank));
const previousRank = computed(() => formatRank(props.event.evidence.previousRank));
const imageInitial = computed(() => (props.event.brand || props.event.asin || "A").slice(0, 1).toUpperCase());
const productTitle = computed(() => {
  const title = props.event.evidence.title?.trim();
  return title && title !== props.event.eventTitle ? title : "";
});

const rowMeta = computed(() => {
  const asin = props.event.asin ? `ASIN ${props.event.asin}` : "品牌事件";
  const owner = props.event.assignee ? `负责人 ${props.event.assignee}` : "未分配";
  return `${props.event.brand || "未知品牌"} · ${asin} · ${insightEventStatusLabels[props.event.status]} · ${owner}`;
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

function formatRank(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `#${value}`;
}
</script>

<template>
  <article
    class="action-row"
    :id="`action-row-${event.id}`"
    :title="eventMeta"
    :class="{ 'action-row-selected': selected }"
    @click="emit('select', event)"
  >
    <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
    <div class="row-image">
      <img v-if="event.evidence.imageUrl" :src="event.evidence.imageUrl" :alt="event.eventTitle" loading="lazy" decoding="async" />
      <span v-else>{{ imageInitial }}</span>
    </div>
    <div class="action-row-main">
      <div class="row-head">
        <ElTag :type="event.eventLevel === 'P0' ? 'danger' : event.eventLevel === 'P1' ? 'warning' : 'info'" effect="light" round>
          {{ event.eventLevel }}
        </ElTag>
        <ElTag effect="plain" round>{{ insightEventTypeLabels[event.eventType] }}</ElTag>
      </div>
      <span class="row-title">{{ event.eventTitle }}</span>
      <small v-if="productTitle" class="row-product-title">{{ productTitle }}</small>
      <small>{{ rowMeta }}</small>
      <div class="row-rank-grid">
        <span><em>当前 BSR</em><strong>{{ currentRank }}</strong></span>
        <span><em>昨日 BSR</em><strong>{{ previousRank }}</strong></span>
        <span><em>变化</em><strong>{{ rankDelta }}</strong></span>
      </div>
      <p>{{ firstEvidence }}</p>
      <p class="row-action-copy">{{ event.suggestedAction }}</p>
      <div v-if="event.attributionTags.length" class="row-cues attribution-row-tags">
        <span v-for="tag in event.attributionTags.slice(0, 3)" :key="tag" class="attribution-chip">{{ attributionTagLabels[tag] }}</span>
        <span v-if="event.attributionTags.length > 3" class="attribution-chip">+{{ event.attributionTags.length - 3 }}</span>
      </div>
      <div v-if="strategyTags.length || reviewDueLabel" class="row-cues strategy-row-tags">
        <span v-for="tag in strategyTags.slice(0, 2)" :key="tag" class="strategy-chip">{{ strategyTagLabels[tag] }}</span>
        <span v-if="strategyTags.length > 2" class="strategy-chip">+{{ strategyTags.length - 2 }}</span>
        <span v-if="reviewDueLabel" class="review-due-chip" :class="`review-due-chip-${reviewDueTone}`">{{ reviewDueLabel }}</span>
      </div>
      <ElButtonGroup v-if="actionable" class="row-actions" @click.stop>
        <ElButton v-if="event.asin && event.status !== 'WATCHING'" size="small" plain @click="emit('watch', event.id)">
          <Eye :size="13" />
          <span>观察</span>
        </ElButton>
        <ElButton size="small" plain @click="emit('status', event.id, 'FOLLOWED')">
          <CheckCircle2 :size="13" />
          <span>已跟进</span>
        </ElButton>
        <ElButton size="small" plain @click="emit('status', event.id, 'IGNORED')">
          <XCircle :size="13" />
          <span>忽略</span>
        </ElButton>
      </ElButtonGroup>
    </div>
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
  gap: 10px;
  grid-template-columns: auto 48px minmax(0, 1fr);
  min-height: 128px;
  padding: 9px;
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
  place-self: start;
}

.action-row :deep(.insight-score-badge strong) {
  font-size: 13px;
}

.action-row :deep(.insight-score-badge small) {
  font-size: 9px;
  margin-top: 1px;
}

.row-image {
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  color: #475569;
  display: flex;
  font-size: 16px;
  font-weight: 800;
  height: 48px;
  justify-content: center;
  overflow: hidden;
  width: 48px;
}

.row-image img {
  height: 100%;
  object-fit: contain;
  width: 100%;
}

.action-row-main {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.row-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.row-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
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

.row-product-title {
  color: #334155 !important;
  font-weight: 700;
}

.row-rank-grid {
  display: grid;
  gap: 5px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.row-rank-grid span {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 6px 7px;
}

.row-rank-grid em {
  color: #64748b;
  font-size: 10px;
  font-style: normal;
  line-height: 1;
}

.row-rank-grid strong {
  color: #0f172a;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.action-row-main p {
  color: #475569;
  display: -webkit-box;
  font-size: 11px;
  line-height: 1.45;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.row-action-copy {
  color: #0f766e !important;
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

.attribution-chip {
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  color: #3730a3;
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

.row-actions {
  justify-self: start;
}

.row-actions :deep(.el-button) {
  align-items: center;
  display: inline-flex;
  gap: 4px;
}

@media (max-width: 760px) {
  .action-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .row-image {
    display: none;
  }

  .row-rank-grid {
    grid-template-columns: 1fr;
  }
}
</style>
