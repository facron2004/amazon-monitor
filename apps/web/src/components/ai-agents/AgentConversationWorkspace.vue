<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  ElButton,
  ElEmpty,
  ElInput,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTag,
} from "element-plus";
import { ArrowUp, Download, Plus, RefreshCw, ShieldCheck, Sparkles } from "@lucide/vue";
import type { ActionProposal, AgentTaskType } from "@amazon-monitor/shared";
import { agentApi } from "../../api-agent";
import { useAgentWorkspaceStore } from "../../stores/agentWorkspace";

const store = useAgentWorkspaceStore();
const {
  sessions,
  selectedSession,
  selectedSessionId,
  activeRun,
  actions,
  loading,
  submitting,
  actionLoadingId,
  error,
} = storeToRefs(store);
const prompt = ref("");
const taskType = ref<AgentTaskType>("query");
const categoryId = ref<number | undefined>();
const asin = ref("");
const marketplace = ref("amazon.com");
const exportingAudit = ref(false);

const runActions = computed(() => {
  const runId = activeRun.value?.id;
  return actions.value.filter((action) => !runId || action.runId === runId);
});
const trace = computed(() => activeRun.value?.events ?? []);

const quickTasks = [
  { label: "Top50 新品", type: "investigation" as const, prompt: "最近 7 天哪些新品进入 Top50？请给出证据和风险边界。" },
  { label: "ASIN 深度调查", type: "investigation" as const, prompt: "调查这个 ASIN 的 BSR、关键词、价格、Coupon、评论与 Listing 变化。" },
  { label: "每日巡检", type: "patrol" as const, prompt: "执行今天的类目巡检，识别排名、价格、评论和品牌份额异常。" },
];

function applyQuickTask(item: typeof quickTasks[number]): void {
  prompt.value = item.prompt;
  taskType.value = item.type;
}

async function submit(): Promise<void> {
  const text = prompt.value.trim();
  if (!text) return;
  const normalizedAsin = asin.value.trim().toUpperCase();
  const datasets = normalizedAsin
    ? ["keyword", "price", "promotion", "review", "listing"] as const
    : ["category"] as const;
  await store.startRun({
    input: text,
    taskType: taskType.value,
    freshness: {
      datasets: [...datasets],
      ...(categoryId.value ? { categoryId: categoryId.value } : {}),
      ...(normalizedAsin ? { asin: normalizedAsin } : {}),
      marketplace: marketplace.value,
      maxAgeHours: normalizedAsin ? 6 : 24,
    },
  });
  if (!error.value) prompt.value = "";
}

async function modify(proposal: ActionProposal): Promise<void> {
  const { value } = await ElMessageBox.prompt(
    "修改后会生成新版本，旧版本立即失效并需要重新批准。",
    "修改行动提案",
    { inputValue: proposal.title, inputPattern: /\S+/, inputErrorMessage: "标题不能为空" },
  );
  await store.modify(proposal, value);
}

async function executeL3(proposal: ActionProposal): Promise<void> {
  await ElMessageBox.confirm(
    "这是 L3 高风险行动。确认执行后可能产生外部通知或批量操作，且不会自动重试不确定结果。",
    "二次确认",
    { confirmButtonText: "确认执行", cancelButtonText: "取消", type: "warning" },
  );
  await store.execute(proposal, true);
}

async function exportAudit(): Promise<void> {
  if (!activeRun.value) return;
  exportingAudit.value = true;
  try {
    const content = JSON.stringify(
      await agentApi.getAudit(activeRun.value.id),
      null,
      2,
    );
    const suggestedName = `agent-audit-run-${activeRun.value.id}.json`;
    if (window.amazonMonitorDesktop) {
      await window.amazonMonitorDesktop.exportFile({ content, suggestedName });
      return;
    }
    const url = URL.createObjectURL(new Blob([content], {
      type: "application/json;charset=utf-8",
    }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "导出审计失败";
  } finally {
    exportingAudit.value = false;
  }
}

onMounted(() => {
  if (sessions.value.length === 0) void store.fetchWorkspace();
});
</script>

<template>
  <section class="agent-cockpit">
    <aside class="agent-cockpit__rail panel">
      <div class="agent-cockpit__rail-head">
        <div>
          <p class="eyebrow">Sessions</p>
          <h3>运营对话</h3>
        </div>
        <ElButton circle :icon="Plus" aria-label="新建会话" @click="store.createSession()" />
      </div>
      <div v-if="sessions.length" class="agent-session-list">
        <button
          v-for="session in sessions"
          :key="session.id"
          class="agent-session"
          :class="{ 'is-active': session.id === selectedSessionId }"
          type="button"
          @click="store.selectSession(session.id)"
        >
          <span>{{ session.title }}</span>
          <time>{{ new Date(session.updatedAt).toLocaleDateString() }}</time>
        </button>
      </div>
      <ElEmpty v-else :image-size="48" description="还没有 Agent 会话">
        <ElButton type="primary" @click="store.createSession()">创建第一条会话</ElButton>
      </ElEmpty>
    </aside>

    <main class="agent-cockpit__conversation panel">
      <header class="agent-conversation__head">
        <div>
          <p class="eyebrow">Single Agent · Evidence First</p>
          <h2>{{ selectedSession?.title ?? "Amazon 运营 Agent" }}</h2>
        </div>
        <ElTag :type="activeRun?.output?.freshness.status === 'fresh' ? 'success' : 'warning'" effect="plain">
          {{ activeRun?.status ?? "待命" }}
        </ElTag>
      </header>

      <div class="agent-quick-tasks">
        <button v-for="item in quickTasks" :key="item.label" type="button" @click="applyQuickTask(item)">
          <Sparkles :size="14" /> {{ item.label }}
        </button>
      </div>

      <div class="agent-thread">
        <article
          v-for="message in selectedSession?.messages ?? []"
          :key="message.id"
          class="agent-message"
          :class="`is-${message.role}`"
        >
          <span>{{ message.role === "user" ? "你" : "Agent" }}</span>
          <p>{{ message.content }}</p>
        </article>

        <template v-if="activeRun?.output">
          <article class="agent-answer">
            <div class="agent-answer__title">
              <ShieldCheck :size="18" />
              <strong>{{ activeRun.output.summary }}</strong>
            </div>
            <div class="agent-freshness-strip" :data-status="activeRun.output.freshness.status">
              <span>新鲜度 {{ activeRun.output.freshness.status }}</span>
              <span>门槛 {{ activeRun.output.freshness.maxAgeHours }}h</span>
              <span v-if="activeRun.output.freshness.dataGaps.length">
                缺口 {{ activeRun.output.freshness.dataGaps.length }}
              </span>
            </div>
            <div class="agent-conclusions">
              <article v-for="(item, index) in activeRun.output.conclusions" :key="index">
                <span class="agent-confidence">{{ Math.round(item.confidence * 100) }}%</span>
                <p>{{ item.text }}</p>
                <small>{{ item.evidenceRefs.length }} 条证据 · {{ item.snapshotRefs.length }} 个快照</small>
              </article>
            </div>
          </article>
        </template>
        <div v-else-if="activeRun" class="agent-running">
          <span class="agent-running__pulse" />
          Agent 正在执行 {{ activeRun.status }}，工具过程会显示在右侧。
        </div>
      </div>

      <footer class="agent-composer">
        <ElInput
          v-model="prompt"
          type="textarea"
          :rows="3"
          resize="none"
          placeholder="描述你要调查的问题。Agent 会先检查数据新鲜度，再调用受限工具。"
          @keydown.ctrl.enter.prevent="submit"
        />
        <div class="agent-composer__scope">
          <ElSelect v-model="taskType" aria-label="任务类型">
            <ElOption label="查询" value="query" />
            <ElOption label="调查" value="investigation" />
            <ElOption label="巡检" value="patrol" />
            <ElOption label="报告" value="report" />
          </ElSelect>
          <ElInput v-model.number="categoryId" type="number" placeholder="类目 ID（可选）" />
          <ElInput v-model="asin" maxlength="10" placeholder="ASIN（可选）" />
          <ElInput v-model="marketplace" placeholder="Marketplace" />
          <ElButton type="primary" :loading="submitting" :disabled="!prompt.trim()" @click="submit">
            <template #icon><ArrowUp :size="15" /></template>
            运行
          </ElButton>
        </div>
        <p v-if="error" class="agent-workspace-error">{{ error }}</p>
      </footer>
    </main>

    <aside class="agent-cockpit__evidence panel">
      <header>
        <div>
          <p class="eyebrow">Run Ledger</p>
          <h3>步骤与审批</h3>
        </div>
        <div class="agent-ledger-actions">
          <ElButton
            :icon="Download"
            text
            :disabled="!activeRun"
            :loading="exportingAudit"
            @click="exportAudit"
          >
            导出审计
          </ElButton>
          <ElButton :icon="RefreshCw" text :loading="loading" @click="store.fetchWorkspace()">刷新</ElButton>
        </div>
      </header>
      <ol class="agent-trace">
        <li v-for="event in trace" :key="event.id">
          <span>{{ event.sequence }}</span>
          <div><strong>{{ event.type }}</strong><small>{{ JSON.stringify(event.payload) }}</small></div>
        </li>
      </ol>
      <div class="agent-proposals">
        <article v-for="proposal in runActions" :key="proposal.id" class="agent-proposal">
          <div>
            <ElTag size="small" :type="proposal.riskLevel === 'L3' ? 'danger' : 'warning'">
              {{ proposal.riskLevel }}
            </ElTag>
            <small>v{{ proposal.version }} · {{ proposal.status }}</small>
          </div>
          <h4>{{ proposal.title }}</h4>
          <div v-if="proposal.status === 'pending'" class="agent-proposal__actions">
            <ElButton size="small" :loading="actionLoadingId === proposal.id" @click="store.approve(proposal)">批准</ElButton>
            <ElButton size="small" @click="modify(proposal)">修改</ElButton>
            <ElButton size="small" type="danger" text @click="store.reject(proposal)">拒绝</ElButton>
          </div>
          <ElButton
            v-else-if="proposal.status === 'approved' && proposal.riskLevel === 'L3'"
            size="small"
            type="danger"
            @click="executeL3(proposal)"
          >
            二次确认并执行
          </ElButton>
        </article>
      </div>
    </aside>
  </section>
</template>

<style scoped src="../../styles/agent-workspace.css"></style>
