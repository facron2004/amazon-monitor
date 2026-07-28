<script setup lang="ts">
import { ElEmpty, ElPagination, ElScrollbar, ElTag } from "element-plus";
import { RefreshCw, ShieldCheck, TriangleAlert } from "@lucide/vue";
import type { AiRun } from "@amazon-monitor/shared";
import { agentLabels, formatAgentRunTime, runTitle, statusTypes } from "./ai-agent-display";

defineProps<{
  runs: AiRun[];
  selectedRunId: number | null;
  loading: boolean;
  latestRunTime: string;
  total: number;
  currentPage: number;
  pageSize: number;
}>();

const emit = defineEmits<{
  selectRun: [run: AiRun];
  changePage: [page: number];
}>();
</script>

<template>
  <section class="panel agent-list-panel">
    <div class="panel-head">
      <div>
        <h2>Recent runs</h2>
        <span>{{ latestRunTime ? `Latest ${formatAgentRunTime(latestRunTime)}` : "No run history" }}</span>
      </div>
    </div>

    <div v-if="loading && runs.length === 0" class="empty-state compact-empty">
      <RefreshCw :size="22" class="spinning" />
      <p>Loading Agent runs</p>
    </div>
    <ElEmpty v-else-if="runs.length === 0" description="No runs match current filters." :image-size="76" />

    <ElScrollbar v-else class="agent-run-scroll">
      <article
        v-for="run in runs"
        :key="run.id"
        :class="['agent-run-row', { selected: selectedRunId === run.id }]"
        @click="emit('selectRun', run)"
      >
        <div class="agent-run-row__main">
          <div class="agent-run-row__title">
            <ElTag size="small" :type="statusTypes[run.status]">{{ run.status }}</ElTag>
            <strong>{{ agentLabels[run.agentType] }}</strong>
          </div>
          <p>{{ runTitle(run) }}</p>
          <small>{{ run.model }} · {{ formatAgentRunTime(run.createdAt) }}</small>
        </div>
        <div class="agent-run-row__meta">
          <ShieldCheck v-if="run.output?.recommended_actions.length" :size="15" />
          <TriangleAlert v-if="run.status === 'failed'" :size="15" />
        </div>
      </article>
    </ElScrollbar>

    <footer v-if="total > 0" class="agent-run-pagination">
      <span>共 {{ total }} 次运行</span>
      <ElPagination
        size="small"
        background
        layout="prev, pager, next"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        @current-change="emit('changePage', $event)"
      />
    </footer>
  </section>
</template>

<style scoped>
.agent-list-panel {
  min-width: 0;
}

.agent-run-scroll {
  max-height: 760px;
}

.agent-run-pagination {
  align-items: center;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding-top: 12px;
}

.agent-run-pagination span {
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.agent-run-row {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 12px 2px;
}

.agent-run-row:hover,
.agent-run-row.selected {
  background: #f5f9ff;
}

.agent-run-row.selected {
  box-shadow: inset 3px 0 0 #0071e3;
}

.agent-run-row__main {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding-left: 10px;
}

.agent-run-row__title,
.agent-run-row__meta {
  align-items: center;
  display: flex;
}

.agent-run-row__title {
  gap: 8px;
}

.agent-run-row strong,
.agent-run-row p,
.agent-run-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-run-row p {
  color: #475569;
  font-size: 13px;
  margin: 0;
}

.agent-run-row small {
  color: #64748b;
}

.agent-run-row__meta {
  color: #64748b;
  gap: 6px;
  padding-right: 10px;
}

@media (max-width: 480px) {
  .agent-run-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
