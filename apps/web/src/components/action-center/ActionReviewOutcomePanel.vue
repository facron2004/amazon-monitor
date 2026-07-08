<script setup lang="ts">
import { computed } from "vue";
import { Clock3, History } from "@lucide/vue";
import { ElButton, ElEmpty, ElProgress, ElStatistic, ElTable, ElTableColumn, ElTag } from "element-plus";
import type { InsightEvent, InsightReviewResult } from "@amazon-monitor/shared";
import {
  buildReviewOutcomeSummary,
  type ReviewOutcomeRow
} from "../../utils/actionCenterReviewOutcomes";

const props = defineProps<{
  events: InsightEvent[];
  currentDate: string;
}>();

const emit = defineEmits<{
  (event: "focus-review-due"): void;
  (event: "focus-review-result", result: InsightReviewResult): void;
  (event: "select", value: InsightEvent): void;
}>();

const summary = computed(() => buildReviewOutcomeSummary(props.events, props.currentDate));
const eventById = computed(() => new Map(props.events.map((event) => [event.id, event])));

function selectRow(row: unknown): void {
  if (!isReviewOutcomeRow(row)) return;
  const event = eventById.value.get(row.topEventId);
  if (event) {
    emit("select", event);
  }
}

function focusRow(row: unknown): void {
  if (!isReviewOutcomeRow(row)) return;
  emit("focus-review-result", row.result);
}

function isReviewOutcomeRow(row: unknown): row is ReviewOutcomeRow {
  return typeof row === "object" && row !== null && "result" in row && "topEventId" in row;
}
</script>

<template>
  <section class="review-outcome-panel">
    <header>
      <div class="review-outcome-title">
        <History :size="16" />
        <div>
          <span>复盘结果</span>
          <strong>闭环判断分布</strong>
        </div>
      </div>
      <div class="review-outcome-actions">
        <ElTag :type="summary.health.healthTone" effect="light" round>{{ summary.health.healthLabel }}</ElTag>
        <ElButton link type="primary" :disabled="summary.dueNowCount === 0" @click="emit('focus-review-due')">
          <Clock3 :size="14" />
          <span>{{ summary.dueNowCount }} 个待复盘</span>
        </ElButton>
      </div>
    </header>

    <div class="review-outcome-kpis">
      <ElStatistic title="已复盘" :value="summary.health.reviewedCount" />
      <section class="review-outcome-card">
        <span>成立率</span>
        <strong>{{ summary.health.validatedPercent }}%</strong>
        <ElProgress :percentage="summary.health.validatedPercent" :show-text="false" />
      </section>
      <section class="review-outcome-card">
        <span>待复盘</span>
        <strong>{{ summary.health.pendingReviewCount }}</strong>
        <ElProgress :percentage="summary.health.pendingPercent" :show-text="false" />
      </section>
      <section class="review-outcome-card">
        <span>最高结果</span>
        <strong>{{ summary.health.topOutcomeLabel }}</strong>
        <small>{{ summary.health.dueNowCount }} 个待复盘</small>
      </section>
    </div>

    <ElEmpty v-if="summary.rows.length === 0" description="当前视图暂无复盘结果" :image-size="64" />
    <div v-else class="review-outcome-body">
      <ElTable :data="summary.rows" row-key="result" size="small">
        <ElTableColumn label="结果" min-width="160">
          <template #default="scope">
            <div class="outcome-cell">
              <ElTag :type="scope.row.tone" effect="light" round>{{ scope.row.label }}</ElTag>
              <small>{{ scope.row.count }} 个已复盘事件</small>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="占比" min-width="150">
          <template #default="scope">
            <div class="share-cell">
              <ElProgress :percentage="scope.row.percent" :show-text="false" />
              <strong>{{ scope.row.percent }}%</strong>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="P0" width="72" align="center">
          <template #default="scope">
            <ElTag :type="scope.row.p0Count > 0 ? 'danger' : 'info'" effect="light" round>{{ scope.row.p0Count }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="最高信号" min-width="220" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.topEventTitle }}
          </template>
        </ElTableColumn>
        <ElTableColumn width="128" align="right">
          <template #default="scope">
            <div class="outcome-actions">
              <ElButton link type="primary" @click="focusRow(scope.row)">聚焦</ElButton>
              <ElButton link type="primary" @click="selectRow(scope.row)">打开</ElButton>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="review-outcome-mobile-list">
        <article v-for="row in summary.rows" :key="row.result" class="review-outcome-mobile-row">
          <div class="review-outcome-mobile-head">
            <ElTag :type="row.tone" effect="light" round>{{ row.label }}</ElTag>
            <strong>{{ row.percent }}%</strong>
          </div>
          <ElProgress :percentage="row.percent" :show-text="false" />
          <b>{{ row.topEventTitle }}</b>
          <small>{{ row.count }} 个已复盘事件 / {{ row.p0Count }} P0 / {{ row.totalScore }} 分</small>
          <div class="review-outcome-mobile-actions">
            <ElButton link type="primary" @click="focusRow(row)">聚焦</ElButton>
            <ElButton link type="primary" @click="selectRow(row)">打开</ElButton>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.review-outcome-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  padding: 14px;
}

.review-outcome-panel > header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.review-outcome-title {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.review-outcome-actions {
  align-items: center;
  display: flex;
  gap: 10px;
}

.review-outcome-title svg {
  color: #7c3aed;
  flex: 0 0 auto;
}

.review-outcome-title span,
.review-outcome-card span,
.review-outcome-card small,
.outcome-cell small {
  color: #64748b;
  font-size: 12px;
}

.review-outcome-title strong {
  color: #0f172a;
  display: block;
  font-size: 15px;
  margin-top: 2px;
}

.review-outcome-panel > header :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.review-outcome-kpis {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.review-outcome-kpis :deep(.el-statistic),
.review-outcome-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  padding: 9px 10px;
}

.review-outcome-card {
  display: grid;
  gap: 5px;
}

.review-outcome-kpis :deep(.el-statistic__head) {
  color: #64748b;
  font-size: 12px;
}

.review-outcome-kpis :deep(.el-statistic__content),
.review-outcome-card strong {
  color: #0f172a;
  display: block;
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}

.review-outcome-body {
  display: grid;
  gap: 10px;
}

.outcome-cell {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.share-cell {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(72px, 1fr) auto;
}

.share-cell strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.outcome-actions {
  align-items: center;
  display: inline-flex;
  gap: 6px;
  justify-content: flex-end;
}

.outcome-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.review-outcome-panel :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.review-outcome-panel :deep(.el-table) {
  border-radius: 8px;
}

.review-outcome-mobile-list {
  display: none;
}

.review-outcome-mobile-row {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
}

.review-outcome-mobile-head,
.review-outcome-mobile-actions {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
}

.review-outcome-mobile-row b,
.review-outcome-mobile-head strong {
  color: #0f172a;
}

.review-outcome-mobile-row b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-outcome-mobile-row small {
  color: #64748b;
  display: -webkit-box;
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.review-outcome-mobile-actions {
  justify-content: flex-end;
}

.review-outcome-mobile-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 760px) {
  .review-outcome-panel > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .review-outcome-actions {
    justify-content: space-between;
    width: 100%;
  }

  .review-outcome-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .review-outcome-kpis {
    grid-template-columns: 1fr;
  }

  .review-outcome-panel :deep(.el-table) {
    display: none;
  }

  .review-outcome-mobile-list {
    display: grid;
    gap: 10px;
  }
}
</style>
