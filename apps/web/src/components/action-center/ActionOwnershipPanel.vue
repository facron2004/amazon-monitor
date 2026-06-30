<script setup lang="ts">
import { computed } from "vue";
import { UserRound, UsersRound } from "@lucide/vue";
import { ElButton, ElEmpty, ElProgress, ElTable, ElTableColumn, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import {
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
const maxScore = computed(() => Math.max(1, ...rows.value.map((row) => row.totalScore)));
const openCount = computed(() => rows.value.reduce((sum, row) => sum + row.eventCount, 0));
const unassignedCount = computed(() => rows.value.find((row) => row.assignee === null)?.eventCount ?? 0);
const p0Count = computed(() => rows.value.reduce((sum, row) => sum + row.p0Count, 0));

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
          <span>Ownership load</span>
          <strong>Open action distribution</strong>
        </div>
      </div>
      <div class="ownership-summary">
        <span><strong>{{ openCount }}</strong> open</span>
        <span><strong>{{ unassignedCount }}</strong> unassigned</span>
        <span><strong>{{ p0Count }}</strong> P0</span>
      </div>
    </header>

    <ElEmpty v-if="rows.length === 0" description="No open owner workload in this view." :image-size="64" />
    <ElTable v-else :data="rows" row-key="label" size="small">
      <ElTableColumn label="Owner" min-width="150">
        <template #default="scope">
          <div class="owner-cell">
            <UserRound :size="14" />
            <div>
              <strong>{{ scope.row.label }}</strong>
              <small>{{ scope.row.eventCount }} open events</small>
            </div>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="Load" min-width="170">
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
      <ElTableColumn label="Review" width="88" align="center">
        <template #default="scope">
          <ElTag :type="scope.row.reviewPendingCount > 0 ? 'warning' : 'info'" effect="light" round>
            {{ scope.row.reviewPendingCount }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="Top signal" min-width="220" show-overflow-tooltip>
        <template #default="scope">
          {{ scope.row.topEventTitle }}
        </template>
      </ElTableColumn>
      <ElTableColumn width="92" align="right">
        <template #default="scope">
          <ElButton link type="primary" @click="focusRow(scope.row)">Focus</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
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

.ownership-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.ownership-summary span {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  color: #64748b;
  font-size: 12px;
  padding: 5px 9px;
}

.ownership-summary strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
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

@media (max-width: 760px) {
  .ownership-panel > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .ownership-summary {
    justify-content: flex-start;
  }
}
</style>
