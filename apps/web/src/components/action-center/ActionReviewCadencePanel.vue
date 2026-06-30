<script setup lang="ts">
import { computed } from "vue";
import { CalendarClock, ExternalLink, RotateCw } from "@lucide/vue";
import { ElButton, ElEmpty, ElProgress, ElTable, ElTableColumn, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import {
  buildReviewCadenceSummary,
  type ReviewCadenceBucket,
  type ReviewCadenceBucketKey,
  type ReviewCadenceRow
} from "../../utils/actionCenterReviewCadence";

const props = defineProps<{
  events: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  currentDate: string;
  reviewing: boolean;
}>();

const emit = defineEmits<{
  (event: "focus-review-due"): void;
  (event: "evaluate-review-due"): void;
  (event: "select", value: InsightEvent): void;
}>();

const summary = computed(() => buildReviewCadenceSummary(props.events, props.reviewDueEvents, props.currentDate));
const maxBucketScore = computed(() => Math.max(1, ...summary.value.buckets.map((bucket) => bucket.totalScore)));
const dueNowCount = computed(() => summary.value.buckets
  .filter((bucket) => bucket.key === "overdue" || bucket.key === "today")
  .reduce((sum, bucket) => sum + bucket.count, 0));

const bucketTone: Record<ReviewCadenceBucketKey, "danger" | "warning" | "success"> = {
  overdue: "danger",
  today: "warning",
  upcoming: "success"
};

function bucketPercent(bucket: ReviewCadenceBucket): number {
  return Math.round((bucket.totalScore / maxBucketScore.value) * 100);
}

function dueCopy(row: unknown): string {
  if (!isReviewCadenceRow(row)) return "";
  if (row.daysOffset < 0) return `${Math.abs(row.daysOffset)}d overdue`;
  if (row.daysOffset === 0) return "Due today";
  return `Due in ${row.daysOffset}d`;
}

function selectRow(row: unknown): void {
  if (isReviewCadenceRow(row)) {
    emit("select", row.event);
  }
}

function isReviewCadenceRow(row: unknown): row is ReviewCadenceRow {
  return typeof row === "object" && row !== null && "event" in row && "bucket" in row && "daysOffset" in row;
}
</script>

<template>
  <section class="review-cadence-panel">
    <header>
      <div class="review-cadence-title">
        <CalendarClock :size="16" />
        <div>
          <span>Review cadence</span>
          <strong>3/7-day follow-up queue</strong>
        </div>
      </div>
      <div class="review-cadence-actions">
        <ElButton plain :disabled="dueNowCount === 0" @click="emit('focus-review-due')">
          <ExternalLink :size="14" />
          <span>Focus due</span>
        </ElButton>
        <ElButton type="primary" :loading="reviewing" :disabled="dueNowCount === 0" @click="emit('evaluate-review-due')">
          <RotateCw :size="14" />
          <span>Auto review</span>
        </ElButton>
      </div>
    </header>

    <ElEmpty v-if="summary.rows.length === 0" description="No review cadence items for the current view." :image-size="68" />
    <div v-else class="review-cadence-body">
      <div class="review-bucket-grid">
        <section v-for="bucket in summary.buckets" :key="bucket.key" class="review-bucket">
          <div class="review-bucket-head">
            <ElTag :type="bucketTone[bucket.key]" effect="light" round>{{ bucket.label }}</ElTag>
            <strong>{{ bucket.count }}</strong>
          </div>
          <ElProgress :percentage="bucketPercent(bucket)" :show-text="false" />
          <p>{{ bucket.totalScore }} score / {{ bucket.p0Count }} P0</p>
        </section>
      </div>

      <ElTable :data="summary.rows" row-key="event.id" size="small">
        <ElTableColumn label="Due" width="128">
          <template #default="scope">
            <div class="due-cell">
              <strong>{{ scope.row.event.reviewDueDate }}</strong>
              <small>{{ dueCopy(scope.row) }}</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Level" width="78" align="center">
          <template #default="scope">
            <ElTag :type="scope.row.event.eventLevel === 'P0' ? 'danger' : scope.row.event.eventLevel === 'P1' ? 'warning' : 'info'" round>
              {{ scope.row.event.eventLevel }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Signal" min-width="230" show-overflow-tooltip>
          <template #default="scope">
            <div class="signal-cell">
              <strong>{{ scope.row.event.eventTitle }}</strong>
              <small>{{ scope.row.event.brand || "Unknown brand" }} / {{ scope.row.event.asin || "Brand event" }}</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Score" width="80" align="right">
          <template #default="scope">
            <strong class="score-cell">{{ scope.row.event.scoreTotal }}</strong>
          </template>
          </ElTableColumn>
          <ElTableColumn width="84" align="right">
            <template #default="scope">
            <ElButton link type="primary" @click="selectRow(scope.row)">Open</ElButton>
            </template>
          </ElTableColumn>
      </ElTable>
    </div>
  </section>
</template>

<style scoped>
.review-cadence-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  padding: 14px;
}

.review-cadence-panel > header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.review-cadence-title,
.review-cadence-actions {
  align-items: center;
  display: flex;
  gap: 10px;
}

.review-cadence-title {
  min-width: 0;
}

.review-cadence-title svg {
  color: #0f766e;
  flex: 0 0 auto;
}

.review-cadence-title span,
.review-bucket p,
.due-cell small,
.signal-cell small {
  color: #64748b;
  font-size: 12px;
}

.review-cadence-title strong {
  color: #0f172a;
  display: block;
  font-size: 15px;
  margin-top: 2px;
}

.review-cadence-actions :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.review-cadence-body {
  display: grid;
  gap: 12px;
}

.review-bucket-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.review-bucket {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
}

.review-bucket-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.review-bucket-head strong {
  color: #0f172a;
  font-size: 22px;
  line-height: 1;
}

.review-bucket p {
  margin: 0;
}

.due-cell,
.signal-cell {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.due-cell strong,
.signal-cell strong,
.score-cell {
  color: #0f172a;
}

.signal-cell strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-cell {
  font-variant-numeric: tabular-nums;
}

.review-cadence-panel :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.review-cadence-panel :deep(.el-table) {
  border-radius: 8px;
}

@media (max-width: 900px) {
  .review-cadence-panel > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .review-bucket-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .review-cadence-actions {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }

  .review-cadence-actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
