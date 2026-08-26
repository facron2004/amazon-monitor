<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElTag } from "element-plus";
import { BrainCircuit, CircleAlert, Database, FlaskConical, GitBranch, Lightbulb, RefreshCw, Target, Waypoints } from "@lucide/vue";
import type { AgentOsActionProposal } from "../api-agent-os";
import { useWriteAccess } from "../composables/useWriteAccess";
import { useAgentOsStore } from "../stores/agentOs";
import GoalSummaryCard from "./agent-os/GoalSummaryCard.vue";
import AgentOsActionPanel from "./agent-os/AgentOsActionPanel.vue";
import AgentOsIntelligencePanel from "./agent-os/AgentOsIntelligencePanel.vue";
import WorkflowRunTimeline from "./agent-os/WorkflowRunTimeline.vue";
import AgentOsSignalFeed from "./agent-os/AgentOsSignalFeed.vue";

const store = useAgentOsStore();
const {
  selectedGoal,
  signals,
  selectedRun,
  goals,
  memory,
  runs,
  actions,
  opportunities,
  decisions,
  experiments,
  dataQuality,
  activeGoalCount,
  pendingActionCount,
  loading,
  error,
  intelligenceError,
  signalError,
  dataQualityError,
  actionError,
  actionBusyId,
  signalBusyId,
  executions,
} = storeToRefs(store);
const { canWrite } = useWriteAccess("manage_workflow");

const latestMemory = computed(() => memory.value.slice(0, 4));

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

async function approveAction(action: AgentOsActionProposal): Promise<void> {
  try { await store.approveAction(action); } catch { /* store exposes the real API error */ }
}

async function executeAction(action: AgentOsActionProposal): Promise<void> {
  try { await store.executeAction(action); } catch { /* store exposes the real API error */ }
}

async function verifyAction(action: AgentOsActionProposal): Promise<void> {
  try { await store.verifyAction(action); } catch { /* store exposes the real API error */ }
}

async function investigateSignal(signal: import("../api-agent-os").AgentOsSignal): Promise<void> {
  try { await store.investigateSignal(signal); } catch { /* store exposes the real API error */ }
}

async function ignoreSignal(signal: import("../api-agent-os").AgentOsSignal): Promise<void> {
  try { await store.ignoreSignal(signal); } catch { /* store exposes the real API error */ }
}
</script>

<template>
  <section class="view agent-os-view">
    <header class="agent-os-toolbar panel">
      <div>
        <p class="eyebrow"><BrainCircuit :size="14" /> Agent OS</p>
        <h2>目标驱动运营中枢</h2>
        <p class="agent-os-toolbar__hint">Goal → Memory → Supervisor → Workflow → Action / Outcome</p>
      </div>
      <ElButton :loading="loading" @click="store.fetchWorkspace()">
        <template #icon><RefreshCw :size="14" /></template>
        刷新数据
      </ElButton>
    </header>

    <p v-if="error" class="agent-os-error" role="alert">
      <CircleAlert :size="15" /> {{ error }}
    </p>

    <div class="metrics agent-os-metrics">
      <article class="metric"><span><Target :size="14" /> 活跃目标</span><strong>{{ activeGoalCount }}</strong></article>
      <article class="metric"><span><Waypoints :size="14" /> Workflow 运行</span><strong>{{ runs.length }}</strong></article>
      <article class="metric"><span><Lightbulb :size="14" /> 机会</span><strong>{{ opportunities.length }}</strong></article>
      <article class="metric"><span><GitBranch :size="14" /> 决策</span><strong>{{ decisions.length }}</strong></article>
      <article class="metric"><span><FlaskConical :size="14" /> 实验</span><strong>{{ experiments.length }}</strong></article>
      <article class="metric hot"><span><Database :size="14" /> 待处理动作</span><strong>{{ pendingActionCount }}</strong></article>
    </div>

    <AgentOsSignalFeed
      :signals="signals"
      :can-write="canWrite"
      :loading="loading"
      :busy-id="signalBusyId"
      :error="signalError"
      @investigate="investigateSignal"
      @ignore="ignoreSignal"
    />

    <div class="agent-os-grid">
      <GoalSummaryCard :goal="selectedGoal" :loading="loading" :error="error" @retry="store.fetchWorkspace" />
      <WorkflowRunTimeline :run="selectedRun" :loading="loading" :error="error" @retry="store.fetchWorkspace" />
    </div>

    <AgentOsIntelligencePanel
      :opportunities="opportunities"
      :decisions="decisions"
      :experiments="experiments"
      :data-quality="dataQuality"
      :loading="loading"
      :error="intelligenceError"
      :data-quality-error="dataQualityError"
    />

    <div class="agent-os-detail-grid">
      <section class="panel agent-os-list-card">
        <header>
          <div><p class="eyebrow">Memory</p><h3>最近记忆</h3></div>
          <ElTag size="small" effect="plain">{{ memory.length }} 条</ElTag>
        </header>
        <ul v-if="latestMemory.length" class="agent-os-list">
          <li v-for="entry in latestMemory" :key="entry.id">
            <strong>{{ entry.title || entry.memoryType }}</strong>
            <span>{{ displayValue(entry.content) }}</span>
            <small>置信度 {{ entry.confidence === null ? "未评估" : `${Math.round(entry.confidence * 100)}%` }}</small>
          </li>
        </ul>
        <p v-else class="agent-os-muted">暂无记忆条目。</p>
      </section>

      <AgentOsActionPanel
        :actions="actions"
        :executions="executions"
        :can-write="canWrite"
        :loading="loading"
        :busy-id="actionBusyId"
        :error="actionError"
        @approve="approveAction"
        @execute="executeAction"
        @verify="verifyAction"
      />
    </div>

    <p v-if="!signals.length && !goals.length && !runs.length && !memory.length && !actions.length && !opportunities.length && !decisions.length && !experiments.length && !dataQuality && !loading" class="agent-os-empty-note">
      当前组织还没有 Agent OS 数据。可先通过 API 创建 Goal 或 Workflow Run，再回到此处查看证据链。
    </p>
  </section>
</template>

<style scoped>
.agent-os-view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 18px;
}
.agent-os-toolbar,
.agent-os-toolbar > div,
.agent-os-toolbar .eyebrow,
.agent-os-metrics span,
.agent-os-error { align-items: center; display: flex; }
.agent-os-toolbar { gap: 18px; justify-content: space-between; }
.agent-os-toolbar h2 { margin: 2px 0 0; }
.agent-os-toolbar .eyebrow { gap: 6px; margin-bottom: 2px; }
.agent-os-toolbar__hint { color: #64748b; font-size: 12px; margin: 7px 0 0; }
.agent-os-metrics { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.agent-os-metrics span { gap: 5px; }
.agent-os-grid,
.agent-os-detail-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.agent-os-detail-grid { align-items: start; }
.agent-os-error { color: #b45309; gap: 7px; margin: 0; }
.agent-os-list-card { min-width: 0; padding: 16px; }
.agent-os-list-card > header { align-items: center; display: flex; justify-content: space-between; }
.agent-os-list-card h3 { margin: 2px 0 0; }
.agent-os-list { display: grid; gap: 10px; list-style: none; margin: 16px 0 0; padding: 0; }
.agent-os-list li { border-top: 1px solid #e2e8f0; display: grid; gap: 4px; min-width: 0; padding-top: 10px; }
.agent-os-list strong { color: #0f172a; font-size: 13px; }
.agent-os-list span { color: #475569; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-os-list small,
.agent-os-muted,
.agent-os-empty-note { color: #64748b; font-size: 12px; }
.agent-os-muted { margin: 16px 0 0; }
.agent-os-empty-note { margin: 0; text-align: center; }
@media (max-width: 980px) {
  .agent-os-grid,
  .agent-os-detail-grid { grid-template-columns: 1fr; }
  .agent-os-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .agent-os-toolbar { align-items: stretch; flex-direction: column; }
  .agent-os-toolbar .el-button { width: 100%; }
  .agent-os-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
