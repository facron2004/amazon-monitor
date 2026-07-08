<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2 } from "@lucide/vue";
import {
  insightEventTypeLabels,
  insightReviewResultLabels,
  type InsightEvent,
  type InsightReviewResult
} from "@amazon-monitor/shared";
import { ElCard, ElEmpty, ElTable, ElTableColumn, ElTag, ElTooltip } from "element-plus";

const props = defineProps<{
  events: InsightEvent[];
}>();

type TagType = "success" | "danger" | "warning" | "info";

interface ReviewOutcomeRow {
  id: string;
  reviewedAt: string;
  target: string;
  subtitle: string;
  resultLabel: string;
  resultTone: TagType;
  scoreTotal: number;
  note: string;
}

const reviewRows = computed<ReviewOutcomeRow[]>(() => props.events.slice(0, 8).map((event) => {
  const result = event.reviewResult ?? "UNCLEAR";
  return {
    id: event.id,
    reviewedAt: event.updatedAt.slice(5, 10),
    target: event.brand || event.asin || "未知对象",
    subtitle: event.asin || insightEventTypeLabels[event.eventType],
    resultLabel: insightReviewResultLabels[result],
    resultTone: resultTone(result),
    scoreTotal: event.scoreTotal,
    note: event.userNote ?? event.suggestedAction ?? "暂无复盘备注"
  };
}));

function resultTone(result: InsightReviewResult): TagType {
  if (result === "CONFIRMED" || result === "CONTINUING") return "success";
  if (result === "FAILED") return "danger";
  if (result === "REVERTED") return "warning";
  return "info";
}
</script>

<template>
  <ElCard shadow="never" class="review-outcome-card">
    <template #header>
      <div class="panel-title">
        <CheckCircle2 :size="16" />
        <span>复盘结果</span>
        <ElTag size="small" type="success" effect="light">{{ events.length }}</ElTag>
      </div>
    </template>

    <ElTable v-if="reviewRows.length" :data="reviewRows" size="small" class="review-table" height="260" row-key="id">
      <ElTableColumn label="日期" width="70">
        <template #default="{ row }">{{ row.reviewedAt }}</template>
      </ElTableColumn>
      <ElTableColumn label="对象" min-width="132" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="target-cell">
            <strong>{{ row.target }}</strong>
            <small>{{ row.subtitle }}</small>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="结论" width="104">
        <template #default="{ row }">
          <ElTag size="small" :type="row.resultTone" effect="plain" round>{{ row.resultLabel }}</ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="分" width="52">
        <template #default="{ row }">{{ row.scoreTotal }}</template>
      </ElTableColumn>
      <ElTableColumn label="备注" min-width="156" show-overflow-tooltip>
        <template #default="{ row }">
          <ElTooltip :content="row.note" placement="top" :show-after="350">
            <span class="note-text">{{ row.note }}</span>
          </ElTooltip>
        </template>
      </ElTableColumn>
    </ElTable>
    <ElEmpty v-else description="当前窗口暂无已完成复盘。" :image-size="72" />
  </ElCard>
</template>

<style scoped>
.review-outcome-card {
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
.note-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-cell strong {
  color: #0f172a;
  font-size: 12px;
}

.target-cell small,
.note-text {
  color: #64748b;
  font-size: 12px;
}
</style>
