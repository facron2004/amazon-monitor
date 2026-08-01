<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  ElButton,
  ElCheckbox,
  ElInput,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTag,
} from "element-plus";
import { KeyRound, Link2, Plus, RefreshCw, Trash2 } from "@lucide/vue";
import type {
  AgentModelConnectionInput,
  AgentModelConnectionState,
  AgentModelProviderKind,
  AgentOAuthStatus,
} from "@amazon-monitor/shared";

const desktop = typeof window === "undefined"
  ? undefined
  : window.amazonMonitorDesktop;
const state = ref<AgentModelConnectionState>({
  activeConnectionId: null,
  connections: [],
});
const oauthStatus = ref<AgentOAuthStatus>({
  connected: false,
  authMode: null,
  planType: null,
});
const form = ref<AgentModelConnectionInput | null>(null);
const loading = ref(false);
const error = ref("");
const loaded = ref(false);
const statuses = ref<Record<"api" | "agent" | "crawler", string>>({
  api: "unknown",
  agent: "unknown",
  crawler: "unknown",
});
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const activeConnection = computed(() => state.value.connections.find(
  (connection) => connection.id === state.value.activeConnectionId,
) ?? null);
const activeId = computed({
  get: () => state.value.activeConnectionId ?? "",
  set: (value: string) => void activate(value),
});

const providerLabels: Record<AgentModelProviderKind, string> = {
  openai: "OpenAI API Key",
  "openai-compatible": "兼容模型 API Key",
  "chatgpt-oauth": "ChatGPT OAuth",
};

async function refresh(): Promise<void> {
  if (!desktop) return;
  error.value = "";
  try {
    const [connectionState, processStatuses, auth] = await Promise.all([
      desktop.model.list(),
      desktop.processStatus(),
      desktop.oauth.status(),
    ]);
    state.value = connectionState;
    statuses.value = processStatuses;
    oauthStatus.value = auth;
    loaded.value = true;
  } catch (cause) {
    error.value = errorMessage(cause, "无法读取桌面 Agent 状态");
  }
}

async function activate(connectionId: string): Promise<void> {
  if (!desktop || !connectionId) return;
  loading.value = true;
  error.value = "";
  try {
    state.value = await desktop.model.activate(connectionId);
  } catch (cause) {
    error.value = errorMessage(cause, "切换模型连接失败");
  } finally {
    loading.value = false;
  }
}

function create(provider: AgentModelProviderKind): void {
  form.value = {
    name: provider === "chatgpt-oauth"
      ? "ChatGPT"
      : provider === "openai" ? "OpenAI" : "兼容模型",
    provider,
    apiMode: provider === "openai-compatible" ? "chat-completions" : "responses",
    baseUrl: provider === "openai-compatible" ? "https://api.example.com/v1" : null,
    primaryModel: provider === "openai-compatible" ? "" : "gpt-5.6-sol",
    fallbackModel: provider === "openai-compatible" ? "" : "gpt-5.6-terra",
    reasoningEnabled: provider !== "openai-compatible",
    apiKey: null,
  };
}

function editActive(): void {
  if (!activeConnection.value) return;
  form.value = {
    ...activeConnection.value,
    apiKey: null,
  };
}

async function save(): Promise<void> {
  if (!desktop || !form.value) return;
  loading.value = true;
  error.value = "";
  try {
    const existingIds = new Set(state.value.connections.map(({ id }) => id));
    let next = await desktop.model.save({
      id: form.value.id,
      name: form.value.name,
      provider: form.value.provider,
      apiMode: form.value.apiMode,
      baseUrl: form.value.baseUrl,
      primaryModel: form.value.primaryModel,
      fallbackModel: form.value.fallbackModel,
      reasoningEnabled: form.value.reasoningEnabled,
      apiKey: form.value.apiKey,
    });
    const saved = form.value.id
      ? next.connections.find(({ id }) => id === form.value?.id)
      : next.connections.find(({ id }) => !existingIds.has(id));
    if (saved && next.activeConnectionId !== saved.id) {
      next = await desktop.model.activate(saved.id);
    }
    state.value = next;
    form.value = null;
  } catch (cause) {
    error.value = errorMessage(cause, "保存模型连接失败");
  } finally {
    loading.value = false;
  }
}

async function removeActive(): Promise<void> {
  if (!desktop || !activeConnection.value) return;
  await ElMessageBox.confirm(
    `删除连接“${activeConnection.value.name}”？已保存的本地密钥也会被清除。`,
    "删除模型连接",
    { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
  );
  loading.value = true;
  try {
    state.value = await desktop.model.remove(activeConnection.value.id);
    form.value = null;
  } catch (cause) {
    error.value = errorMessage(cause, "删除模型连接失败");
  } finally {
    loading.value = false;
  }
}

async function connectOAuth(): Promise<void> {
  if (!desktop) return;
  loading.value = true;
  error.value = "";
  try {
    await desktop.oauth.start();
    error.value = "已在系统浏览器打开 ChatGPT 授权页；完成授权后点击刷新状态。";
  } catch (cause) {
    error.value = errorMessage(cause, "启动 OAuth 登录失败");
  } finally {
    loading.value = false;
  }
}

async function logoutOAuth(): Promise<void> {
  if (!desktop) return;
  await ElMessageBox.confirm(
    "退出当前 ChatGPT OAuth 连接？这不会影响其他 API Key 连接。",
    "退出 OAuth",
    { type: "warning", confirmButtonText: "退出", cancelButtonText: "取消" },
  );
  loading.value = true;
  try {
    await desktop.oauth.logout();
    await refresh();
  } catch (cause) {
    error.value = errorMessage(cause, "退出 OAuth 失败");
  } finally {
    loading.value = false;
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

onMounted(() => {
  void refresh();
  let attempts = 0;
  refreshTimer = setInterval(() => {
    attempts += 1;
    const allProcessesRunning = Object.values(statuses.value).every(
      (status) => status === "running",
    );
    if (attempts >= 10 || (loaded.value && allProcessesRunning)) {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = undefined;
      return;
    }
    void refresh();
  }, 500);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <section v-if="desktop" class="desktop-agent-settings panel">
    <header class="settings-header">
      <div>
        <p class="eyebrow">Model connections</p>
        <strong>模型接入与切换</strong>
        <small>密钥由 Windows DPAPI 加密；OAuth Token 由官方 Codex 运行时管理。</small>
      </div>
      <div class="processes">
        <ElTag
          v-for="(status, name) in statuses"
          :key="name"
          :type="status === 'running' ? 'success' : 'warning'"
          effect="plain"
        >{{ name }} · {{ status }}</ElTag>
      </div>
    </header>

    <div class="connection-bar">
      <ElSelect
        v-model="activeId"
        :loading="loading"
        placeholder="选择模型连接"
        aria-label="当前模型连接"
      >
        <ElOption
          v-for="connection in state.connections"
          :key="connection.id"
          :value="connection.id"
          :label="`${connection.name} · ${connection.primaryModel}`"
        >
          <span>{{ connection.name }} · {{ connection.primaryModel }}</span>
          <ElTag
            class="connection-status"
            :type="connection.configured ? 'success' : 'warning'"
            size="small"
            effect="plain"
          >{{ connection.configured ? "已连接" : "待认证" }}</ElTag>
        </ElOption>
      </ElSelect>
      <ElButton :icon="Plus" @click="create('openai')">OpenAI Key</ElButton>
      <ElButton :icon="Plus" @click="create('openai-compatible')">其他模型</ElButton>
      <ElButton :icon="Link2" @click="create('chatgpt-oauth')">OAuth</ElButton>
      <ElButton circle :icon="RefreshCw" aria-label="刷新连接状态" @click="refresh" />
    </div>

    <div v-if="activeConnection && !form" class="active-summary">
      <div>
        <ElTag type="primary" effect="plain">当前</ElTag>
        <strong>{{ activeConnection.name }}</strong>
        <span>{{ providerLabels[activeConnection.provider] }}</span>
        <code>{{ activeConnection.primaryModel }}</code>
        <small v-if="activeConnection.baseUrl">{{ activeConnection.baseUrl }}</small>
        <small v-if="activeConnection.provider === 'chatgpt-oauth' && oauthStatus.planType">
          ChatGPT {{ oauthStatus.planType }}
        </small>
      </div>
      <div class="summary-actions">
        <template v-if="activeConnection.provider === 'chatgpt-oauth'">
          <ElButton
            v-if="!oauthStatus.connected"
            type="primary"
            :loading="loading"
            @click="connectOAuth"
          >连接 ChatGPT</ElButton>
          <ElButton v-else :loading="loading" @click="logoutOAuth">退出 OAuth</ElButton>
        </template>
        <ElButton @click="editActive">编辑</ElButton>
        <ElButton :icon="Trash2" text type="danger" @click="removeActive">删除</ElButton>
      </div>
    </div>

    <div v-if="form" class="connection-form">
      <label class="form-field">
        <span>认证类型</span>
        <ElSelect v-model="form.provider" disabled aria-label="认证类型">
          <ElOption
            v-for="(label, provider) in providerLabels"
            :key="provider"
            :label="label"
            :value="provider"
          />
        </ElSelect>
      </label>
      <label class="form-field">
        <span>连接名称</span>
        <ElInput v-model="form.name" placeholder="例如：生产模型" />
      </label>
      <label v-if="form.provider === 'openai-compatible'" class="form-field form-field-wide">
        <span>Base URL</span>
        <ElInput
          v-model="form.baseUrl"
          placeholder="例如 https://api.deepseek.com/v1"
        />
      </label>
      <label v-if="form.provider !== 'chatgpt-oauth'" class="form-field">
        <span>API 协议</span>
        <ElSelect v-model="form.apiMode" aria-label="API 协议">
          <ElOption label="Responses API" value="responses" />
          <ElOption label="Chat Completions" value="chat-completions" />
        </ElSelect>
      </label>
      <label class="form-field">
        <span>主模型</span>
        <ElInput v-model="form.primaryModel" placeholder="主模型 ID" />
      </label>
      <label class="form-field">
        <span>备用模型</span>
        <ElInput v-model="form.fallbackModel" placeholder="备用模型 ID" />
      </label>
      <label v-if="form.provider !== 'chatgpt-oauth'" class="form-field form-field-wide">
        <span>API Key</span>
        <ElInput
          v-model="form.apiKey"
          type="password"
          autocomplete="off"
          :prefix-icon="KeyRound"
          :placeholder="form.id ? '留空则保留现有 API Key' : '输入 API Key'"
        />
      </label>
      <ElCheckbox
        v-if="form.provider !== 'chatgpt-oauth'"
        v-model="form.reasoningEnabled"
        class="reasoning-option"
      >
        发送 reasoning / verbosity 参数
      </ElCheckbox>
      <div class="form-actions">
        <ElButton @click="form = null">取消</ElButton>
        <ElButton type="primary" :loading="loading" @click="save">
          保存并切换
        </ElButton>
      </div>
    </div>

    <p v-if="error" class="settings-message">{{ error }}</p>
  </section>
</template>

<style scoped>
.desktop-agent-settings { display: grid; gap: 12px; padding: 14px 16px; }
.settings-header,
.connection-bar,
.active-summary,
.active-summary > div,
.summary-actions,
.processes,
.form-actions {
  align-items: center;
  display: flex;
}
.settings-header,
.active-summary { justify-content: space-between; }
.settings-header > div:first-child { display: grid; gap: 3px; }
.settings-header small,
.active-summary span,
.active-summary small { color: #767c74; }
.processes,
.connection-bar,
.active-summary > div,
.summary-actions,
.form-actions { flex-wrap: wrap; gap: 8px; }
.connection-bar :deep(.el-select) { min-width: 340px; }
.connection-status { float: right; margin-left: 18px; }
.active-summary { background: #f7f8f6; border-radius: 10px; padding: 10px 12px; }
.active-summary code { color: #315c46; }
.connection-form {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
}
.form-field { display: grid; gap: 5px; }
.form-field > span { color: #61675f; font-size: 12px; font-weight: 600; }
.form-field-wide { grid-column: span 2; }
.reasoning-option { align-self: end; min-height: 32px; }
.form-actions { grid-column: 1 / -1; justify-content: flex-end; }
.settings-message { color: #9a5b13; margin: 0; }
@media (max-width: 1120px) {
  .settings-header,
  .active-summary { align-items: flex-start; flex-direction: column; gap: 10px; }
  .connection-form { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
}
@media (max-width: 760px) {
  .connection-bar { align-items: stretch; flex-direction: column; }
  .connection-bar :deep(.el-select),
  .connection-bar :deep(.el-button) { margin: 0; min-width: 0; width: 100%; }
  .connection-form { grid-template-columns: 1fr; }
  .form-field-wide,
  .form-actions { grid-column: auto; }
}
</style>
