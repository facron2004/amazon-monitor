<script setup lang="ts">
import { computed } from "vue";
import { UserRound, UsersRound } from "@lucide/vue";
import { ElButton, ElEmpty, ElProgress, ElStatistic, ElTable, ElTableColumn, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import {
  buildOwnershipLoadSummary,
  getOwnershipLoadRows,
  type OwnershipLoadRow
} from "../../utils/actionCenterOwnership";

const props = defineProps<{
  events: InsightEvent[];
}>();

const emit = defineEmits<{
  (event: "focus-assignee", assignee: string | null): void;
}>();

const rows = computed(() => getOwnershipLoadRows(props.events));
const summary = computed(() => buildOwnershipLoadSummary(props.events));
const maxScore = computed(() => Math.max(1, ...rows.value.map((row) => row.totalScore)));

function scorePercent(value: number): number {
  return Math.round((value / maxScore.value) * 100);
}

function focusRow(row: unknown): void {
  if (isOwnershipLoadRow(row)) {
    emit("focus-assignee", row.assignee);
  }
}

function isOwnershipLoadRow(row: unknown): row is OwnershipLoadRow {
  return typeof row === "object" && row !== null && "assignee" in row && "label" in row && "totalScore" in row;
}
</script>

<template>
  <section class="ownership-panel">
    <header>
      <div class="ownership-title">
        <UsersRound :size="16" />
        <div>
          <span>负责人负载</span>
          <strong>打开动作分布</strong>
        </div>
      </div>
      <ElTag :type="summary.loadTone" effect="light" round>{{ summary.loadLabel }}</ElTag>
    </header>

    <ElEmpty v-if="rows.length === 0" description="当前视图暂无负责人负载" :image-size="64" />
    <div v-else class="ownership-body">
      <div class="ownership-metrics">
        <ElStatistic title="打开动作" :value="summary.openCount" />
        <section class="ownership-metric">
          <span>负责人覆盖</span>
          <strong>{{ summary.assignedPercent }}%</strong>
          <ElProgress :percentage="summary.assignedPercent" :show-text="false" />
        </section>
        <section class="ownership-metric">
          <span>未分配压力</span>
          <strong>{{ summary.unassignedCount }}</strong>
          <small>占打开队列 {{ summary.unassignedPercent }}%</small>
        </section>
        <section class="ownership-metric">
          <span>P0 / 复盘队列</span>
          <strong>{{ summary.p0Count }} / {{ summary.reviewPendingCount }}</strong>
          <small>{{ summary.ownerCount }} 个负责人，最高 {{ summary.topOwnerLabel }} / {{ summary.topOwnerScore }}</small>
        </section>
      </div>

      <ElTable :data="rows" row-key="label" size="small">
        <ElTableColumn label="负责人" min-width="150">
          <template #default="scope">
            <div class="owner-cell">
              <UserRound :size="14" />
              <div>
                <strong>{{ scope.row.label }}</strong>
                <small>{{ scope.row.eventCount }} 条打开事件</small>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="负载" min-width="170">
          <template #default="scope">
            <div class="load-cell">
              <ElProgress :percentage="scorePercent(scope.row.totalScore)" :show-text="false" />
              <strong>{{ scope.row.totalScore }}</strong>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="P0" width="70" align="center">
          <template #default="scope">
            <ElTag :type="scope.row.p0Count > 0 ? 'danger' : 'info'" effect="light" round>
              {{ scope.row.p0Count }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="复盘" width="88" align="center">
          <template #default="scope">
            <ElTag :type="scope.row.reviewPendingCount > 0 ? 'warning' : 'info'" effect="light" round>
              {{ scope.row.reviewPendingCount }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="最高信号" min-width="220" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.topEventTitle }}
          </template>
        </ElTableColumn>
        <ElTableColumn width="92" align="right">
          <template #default="scope">
            <ElButton link type="primary" @click="focusRow(scope.row)">聚焦</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="ownership-mobile-list">
        <button
          v-for="row in rows"
          :key="row.label"
          type="button"
          class="ownership-mobile-row"
          @click="focusRow(row)"
        >
          <span class="ownership-mobile-head">
            <strong>{{ row.label }}</strong>
            <ElTag :type="row.p0Count > 0 ? 'danger' : 'info'" effect="light" round>{{ row.p0Count }} P0</ElTag>
          </span>
          <small>{{ row.eventCount }} 条打开事件 / {{ row.reviewPendingCount }} 个复盘 / {{ row.topEventTitle }}</small>
          <span class="ownership-mobile-load">
            <ElProgress :percentage="scorePercent(row.totalScore)" :show-text="false" />
            <b>{{ row.totalScore }}</b>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ownership-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  padding: 14px;
}

.ownership-panel > header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.ownership-title {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.ownership-title svg {
  color: #2563eb;
  flex: 0 0 auto;
}

.ownership-title span {
  color: #64748b;
  font-size: 12px;
}

.ownership-title strong {
  color: #0f172a;
  display: block;
  font-size: 15px;
  margin-top: 2px;
}

.ownership-body {
  display: grid;
  gap: 12px;
}

.ownership-metrics {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.ownership-metrics :deep(.el-statistic),
.ownership-metric {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  padding: 9px 10px;
}

.ownership-metrics :deep(.el-statistic__head),
.ownership-metric span,
.ownership-metric small {
  color: #64748b;
  font-size: 12px;
}

.ownership-metrics :deep(.el-statistic__content),
.ownership-metric strong {
  color: #0f172a;
  display: block;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  margin-top: 3px;
}

.ownership-metric {
  display: grid;
  gap: 5px;
}

.owner-cell,
.load-cell {
  align-items: center;
  display: grid;
  gap: 9px;
}

.owner-cell {
  grid-template-columns: auto minmax(0, 1fr);
}

.owner-cell svg {
  color: #64748b;
}

.owner-cell strong {
  color: #0f172a;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.owner-cell small {
  color: #64748b;
  display: block;
  font-size: 12px;
  margin-top: 2px;
}

.load-cell {
  grid-template-columns: minmax(72px, 1fr) auto;
}

.load-cell strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.ownership-panel :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.ownership-panel :deep(.el-table) {
  border-radius: 8px;
}

.ownership-mobile-list {
  display: none;
}

.ownership-mobile-row {
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

.ownership-mobile-row:hover {
  border-color: #93c5fd;
}

.ownership-mobile-head,
.ownership-mobile-load {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
}

.ownership-mobile-head strong {
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ownership-mobile-row small {
  color: #64748b;
  display: -webkit-box;
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.ownership-mobile-load {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}

.ownership-mobile-load b {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .ownership-panel > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .ownership-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ownership-panel :deep(.el-table) {
    display: none;
  }

  .ownership-mobile-list {
    display: grid;
    gap: 10px;
  }
}

@media (max-width: 560px) {
  .ownership-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
