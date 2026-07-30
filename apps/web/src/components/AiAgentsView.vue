<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElOption, ElSelect, ElTabPane, ElTabs } from "element-plus";
import { RefreshCw } from "@lucide/vue";
import { aiAgentTypes, aiRunStatuses, type AiRun } from "@amazon-monitor/shared";
import { useAiRunsStore } from "../stores/aiRuns";
import AgentRunDetail from "./ai-agents/AgentRunDetail.vue";
import AgentRunList from "./ai-agents/AgentRunList.vue";
import AgentQualityPanel from "./ai-agents/AgentQualityPanel.vue";
import AgentConversationWorkspace from "./ai-agents/AgentConversationWorkspace.vue";
import DesktopAgentSettings from "./ai-agents/DesktopAgentSettings.vue";
import { agentLabels } from "./ai-agents/ai-agent-display";
import { useWriteAccess } from "../composables/useWriteAccess";

const store = useAiRunsStore();
const {
  runs,
  selectedRun,
  selectedRunId,
  agentType,
  status,
  limit,
  total,
  currentPage,
  loading,
  feedbackLoadingKey,
  error,
  qualityDays,
  quality,
  qualityLoading,
  qualityError
} = storeToRefs(store);
const { canWrite: canViewQuality } = useWriteAccess("assign_tasks");
const workspaceMode = ref<"conversation" | "history">("conversation");

const successCount = computed(() => runs.value.filter((run) => run.status === "success").length);
const failedCount = computed(() => runs.value.filter((run) => run.status === "failed").length);
const approvalActionCount = computed(() =>
  runs.value.reduce((total, run) => total + (run.output?.recommended_actions.length ?? 0), 0)
);
const latestRunTime = computed(() => runs.value[0]?.createdAt ?? "");

function selectRun(run: AiRun): void {
  store.selectRun(run.id);
}

async function refresh(): Promise<void> {
  await Promise.all([
    store.fetchRuns(),
    canViewQuality.value ? store.fetchQuality() : Promise.resolve(),
  ]);
}

watch(qualityDays, () => {
  if (canViewQuality.value) void store.fetchQuality();
});

onMounted(() => {
  if (canViewQuality.value) void store.fetchQuality();
});
</script>

<template>
  <section class="view ai-agents-view">
    <ElTabs v-model="workspaceMode" class="agent-view-tabs">
      <ElTabPane label="智能工作台" name="conversation" />
      <ElTabPane label="确定性历史" name="history" />
    </ElTabs>

    <template v-if="workspaceMode === 'conversation'">
      <DesktopAgentSettings />
      <AgentConversationWorkspace />
    </template>

    <template v-else>
    <header class="agent-toolbar panel">
      <div>
        <p class="eyebrow">Agent Center</p>
        <h2>AI Agent 运行台</h2>
      </div>
      <div class="agent-toolbar__actions">
        <ElSelect v-model="agentType" clearable placeholder="Agent" style="width: 180px" @change="store.resetAndFetch">
          <ElOption v-for="item in aiAgentTypes" :key="item" :label="agentLabels[item]" :value="item" />
        </ElSelect>
        <ElSelect v-model="status" clearable placeholder="状态" style="width: 132px" @change="store.resetAndFetch">
          <ElOption v-for="item in aiRunStatuses" :key="item" :label="item" :value="item" />
        </ElSelect>
        <ElSelect v-model="limit" placeholder="数量" style="width: 110px" @change="store.resetAndFetch">
          <ElOption label="25" :value="25" />
          <ElOption label="50" :value="50" />
          <ElOption label="100" :value="100" />
        </ElSelect>
        <ElButton :loading="loading || qualityLoading" @click="refresh">
          <template #icon><RefreshCw :size="14" /></template>
          刷新
        </ElButton>
      </div>
    </header>

    <AgentQualityPanel
      v-if="canViewQuality"
      v-model:days="qualityDays"
      :quality="quality"
      :loading="qualityLoading"
      :error="qualityError"
      @retry="store.fetchQuality"
    />

    <div class="metrics agent-metrics">
      <article class="metric review-metric"><span>匹配运行</span><strong>{{ total }}</strong></article>
      <article class="metric"><span>本页成功</span><strong>{{ successCount }}</strong></article>
      <article class="metric hot"><span>本页失败</span><strong>{{ failedCount }}</strong></article>
      <article class="metric"><span>本页待确认动作</span><strong>{{ approvalActionCount }}</strong></article>
    </div>

    <p v-if="error" class="agent-error">{{ error }}</p>

    <div class="agent-layout">
      <AgentRunList
        :runs="runs"
        :selected-run-id="selectedRunId"
        :loading="loading"
        :latest-run-time="latestRunTime"
        :total="total"
        :current-page="currentPage"
        :page-size="limit"
        @select-run="selectRun"
        @change-page="store.goToPage"
      />
      <AgentRunDetail
        :run="selectedRun"
        :feedback-loading-key="feedbackLoadingKey"
        @feedback="store.setActionFeedback"
      />
    </div>
    </template>
  </section>
</template>

<style scoped>
.ai-agents-view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 18px;
}

.agent-toolbar,
.agent-toolbar__actions {
  align-items: center;
  display: flex;
}

.agent-toolbar { justify-content: space-between; }
.agent-toolbar h2 { margin: 2px 0 0; }
.agent-toolbar__actions { flex-wrap: wrap; gap: 8px; justify-content: flex-end; }

.agent-layout {
  display: grid;
  flex: 1 1 auto;
  gap: 14px;
  grid-template-columns: minmax(360px, 0.9fr) minmax(0, 1.4fr);
  min-height: 0;
}

.agent-error { color: #c2410c; margin: 0; }
.agent-view-tabs { flex: 0 0 auto; }
.agent-view-tabs :deep(.el-tabs__header) { margin: 0; }
.agent-view-tabs :deep(.el-tabs__content) { display: none; }

@media (max-width: 1120px) {
  .agent-layout { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  .agent-toolbar,
  .agent-toolbar__actions { align-items: stretch; flex-direction: column; }
  .agent-toolbar__actions :deep(.el-select),
  .agent-toolbar__actions :deep(.el-button) { width: 100%; }
}
</style>
