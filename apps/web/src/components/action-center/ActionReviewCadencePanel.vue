<script setup lang="ts">
import { computed } from "vue";
import { CalendarClock, ExternalLink, RotateCw } from "@lucide/vue";
import { ElButton, ElEmpty, ElProgress, ElStatistic, ElTable, ElTableColumn, ElTag } from "element-plus";
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
  (event: "focus-review-cadence", value: ReviewCadenceBucketKey): void;
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

function eventScorePercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function dueCopy(row: unknown): string {
  if (!isReviewCadenceRow(row)) return "";
  if (row.daysOffset < 0) return `逾期 ${Math.abs(row.daysOffset)} 天`;
  if (row.daysOffset === 0) return "今日到期";
  return `${row.daysOffset} 天后到期`;
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
          <span>复盘节奏</span>
          <strong>3/7 天跟进队列</strong>
        </div>
      </div>
      <div class="review-cadence-actions">
        <ElButton plain :disabled="dueNowCount === 0" @click="emit('focus-review-due')">
          <ExternalLink :size="14" />
          <span>聚焦到期</span>
        </ElButton>
        <ElButton type="primary" :loading="reviewing" :disabled="dueNowCount === 0" @click="emit('evaluate-review-due')">
          <RotateCw :size="14" />
          <span>自动复盘</span>
        </ElButton>
      </div>
    </header>

    <ElEmpty v-if="summary.rows.length === 0" description="当前视图暂无复盘排期" :image-size="68" />
    <div v-else class="review-cadence-body">
      <div class="review-cadence-health">
        <ElStatistic title="复盘队列" :value="summary.health.totalCount" />
        <section class="review-health-card">
          <span>需立即复盘</span>
          <strong>{{ summary.health.dueNowCount }}</strong>
          <ElProgress :percentage="summary.health.dueNowPercent" :show-text="false" />
        </section>
        <section class="review-health-card">
          <span>P0 到期</span>
          <strong>{{ summary.health.p0DueCount }}</strong>
          <ElTag :type="summary.health.healthTone" effect="light" round>{{ summary.health.healthLabel }}</ElTag>
        </section>
        <section class="review-health-card">
          <span>下个检查点</span>
          <strong>{{ summary.health.nextDueLabel }}</strong>
          <small>队列总分 {{ summary.health.totalScore }}</small>
        </section>
      </div>

      <div class="review-bucket-grid">
        <button
          v-for="bucket in summary.buckets"
          :key="bucket.key"
          type="button"
          class="review-bucket"
          @click="emit('focus-review-cadence', bucket.key)"
        >
          <div class="review-bucket-head">
            <ElTag :type="bucketTone[bucket.key]" effect="light" round>{{ bucket.label }}</ElTag>
            <strong>{{ bucket.count }}</strong>
          </div>
          <ElProgress :percentage="bucketPercent(bucket)" :show-text="false" />
          <p>{{ bucket.totalScore }} 分 / {{ bucket.p0Count }} P0</p>
        </button>
      </div>

      <ElTable :data="summary.rows" row-key="event.id" size="small">
        <ElTableColumn label="到期" width="128">
          <template #default="scope">
            <div class="due-cell">
              <strong>{{ scope.row.event.reviewDueDate }}</strong>
              <small>{{ dueCopy(scope.row) }}</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="等级" width="78" align="center">
          <template #default="scope">
            <ElTag :type="scope.row.event.eventLevel === 'P0' ? 'danger' : scope.row.event.eventLevel === 'P1' ? 'warning' : 'info'" round>
              {{ scope.row.event.eventLevel }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="信号" min-width="230" show-overflow-tooltip>
          <template #default="scope">
            <div class="signal-cell">
              <strong>{{ scope.row.event.eventTitle }}</strong>
              <small>{{ scope.row.event.brand || "未知品牌" }} / {{ scope.row.event.asin || "品牌事件" }}</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="分数" width="80" align="right">
          <template #default="scope">
            <strong class="score-cell">{{ scope.row.event.scoreTotal }}</strong>
          </template>
          </ElTableColumn>
          <ElTableColumn width="84" align="right">
            <template #default="scope">
            <ElButton link type="primary" @click="selectRow(scope.row)">打开</ElButton>
            </template>
          </ElTableColumn>
      </ElTable>

      <div class="review-mobile-list">
        <button
          v-for="row in summary.rows"
          :key="row.event.id"
          type="button"
          class="review-mobile-row"
          @click="selectRow(row)"
        >
          <span class="review-mobile-head">
            <strong>{{ row.event.reviewDueDate }}</strong>
            <ElTag :type="row.event.eventLevel === 'P0' ? 'danger' : row.event.eventLevel === 'P1' ? 'warning' : 'info'" round>
              {{ row.event.eventLevel }}
            </ElTag>
          </span>
          <b>{{ row.event.eventTitle }}</b>
          <small>{{ dueCopy(row) }} / {{ row.event.brand || "未知品牌" }} / {{ row.event.asin || "品牌事件" }}</small>
          <span class="review-mobile-score">
            <ElProgress :percentage="eventScorePercent(row.event.scoreTotal)" :show-text="false" />
            <strong>{{ row.event.scoreTotal }}</strong>
          </span>
        </button>
      </div>
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

.review-cadence-health {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.review-cadence-health :deep(.el-statistic),
.review-health-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  padding: 9px 10px;
}

.review-cadence-health :deep(.el-statistic__head),
.review-health-card span,
.review-health-card small {
  color: #64748b;
  font-size: 12px;
}

.review-cadence-health :deep(.el-statistic__content),
.review-health-card strong {
  color: #0f172a;
  display: block;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  margin-top: 3px;
}

.review-health-card {
  display: grid;
  gap: 5px;
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
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 8px;
  font: inherit;
  min-width: 0;
  padding: 10px;
  text-align: left;
}

.review-bucket:hover {
  border-color: #93c5fd;
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

.review-mobile-list {
  display: none;
}

.review-mobile-row {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  text-align: left;
}

.review-mobile-row:hover {
  border-color: #93c5fd;
}

.review-mobile-head,
.review-mobile-score {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
}

.review-mobile-row b,
.review-mobile-head strong,
.review-mobile-score strong {
  color: #0f172a;
}

.review-mobile-row b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-mobile-row small {
  color: #64748b;
  display: -webkit-box;
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.review-mobile-score {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}

.review-mobile-score strong {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .review-cadence-panel > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .review-cadence-health {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .review-cadence-health {
    grid-template-columns: 1fr;
  }

  .review-cadence-panel :deep(.el-table) {
    display: none;
  }

  .review-mobile-list {
    display: grid;
    gap: 10px;
  }
}
</style>
