<script setup lang="ts">
import { computed } from "vue";
import { Tags } from "@lucide/vue";
import { ElButton, ElEmpty, ElProgress, ElTable, ElTableColumn, ElTag } from "element-plus";
import type { InsightEvent, StrategyTag } from "@amazon-monitor/shared";
import {
  getStrategyFocusRows,
  type StrategyFocusRow
} from "../../utils/actionCenterStrategyFocus";

const props = defineProps<{
  events: InsightEvent[];
  activeTag: StrategyTag | "";
}>();

const emit = defineEmits<{
  (event: "focus-strategy", tag: StrategyTag): void;
}>();

const rows = computed(() => getStrategyFocusRows(props.events));
const maxScore = computed(() => Math.max(1, ...rows.value.map((row) => row.totalScore)));

function scorePercent(value: number): number {
  return Math.round((value / maxScore.value) * 100);
}

function focusRow(row: unknown): void {
  if (isStrategyFocusRow(row)) {
    emit("focus-strategy", row.tag);
  }
}

function isStrategyFocusRow(row: unknown): row is StrategyFocusRow {
  return typeof row === "object" && row !== null && "tag" in row && "label" in row && "totalScore" in row;
}
</script>

<template>
  <section class="strategy-focus-panel">
    <header>
      <div class="strategy-focus-title">
        <Tags :size="16" />
        <div>
          <span>策略聚焦</span>
          <strong>基于证据的标签</strong>
        </div>
      </div>
      <ElTag v-if="activeTag" type="success" effect="light" round>筛选中</ElTag>
    </header>

    <ElEmpty v-if="rows.length === 0" description="当前视图暂无策略标签" :image-size="64" />
    <ElTable v-else :data="rows" row-key="tag" size="small">
      <ElTableColumn label="策略" min-width="170">
        <template #default="scope">
          <div class="strategy-cell">
            <ElTag :type="scope.row.tag === activeTag ? 'success' : 'info'" effect="light" round>
              {{ scope.row.label }}
            </ElTag>
            <small>{{ scope.row.eventCount }} 条事件</small>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="分数" min-width="170">
        <template #default="scope">
          <div class="score-flow-cell">
            <ElProgress :percentage="scorePercent(scope.row.totalScore)" :show-text="false" />
            <strong>{{ scope.row.totalScore }}</strong>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="P0" width="76" align="center">
        <template #default="scope">
          <ElTag :type="scope.row.p0Count > 0 ? 'danger' : 'info'" effect="light" round>
            {{ scope.row.p0Count }}
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
          <ElButton link type="primary" :disabled="scope.row.tag === activeTag" @click="focusRow(scope.row)">
            聚焦
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped>
.strategy-focus-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  padding: 14px;
}

.strategy-focus-panel > header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.strategy-focus-title {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.strategy-focus-title svg {
  color: #0f766e;
  flex: 0 0 auto;
}

.strategy-focus-title span,
.strategy-cell small {
  color: #64748b;
  font-size: 12px;
}

.strategy-focus-title strong {
  color: #0f172a;
  display: block;
  font-size: 15px;
  margin-top: 2px;
}

.strategy-cell {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.strategy-cell :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-flow-cell {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(72px, 1fr) auto;
}

.score-flow-cell strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.strategy-focus-panel :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.strategy-focus-panel :deep(.el-table) {
  border-radius: 8px;
}

@media (max-width: 760px) {
  .strategy-focus-panel > header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
