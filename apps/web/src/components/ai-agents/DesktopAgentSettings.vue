<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElButton, ElInput, ElTag } from "element-plus";
import { KeyRound, RefreshCw, Trash2 } from "@lucide/vue";

const desktop = typeof window === "undefined"
  ? undefined
  : window.amazonMonitorDesktop;
const apiKey = ref("");
const configured = ref(false);
const loading = ref(false);
const error = ref("");
const statuses = ref<Record<"api" | "agent" | "crawler", string>>({
  api: "unknown",
  agent: "unknown",
  crawler: "unknown",
});

async function refresh(): Promise<void> {
  if (!desktop) return;
  error.value = "";
  try {
    const [hasKey, processStatuses] = await Promise.all([
      desktop.key.has(),
      desktop.processStatus(),
    ]);
    configured.value = hasKey;
    statuses.value = processStatuses;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法读取桌面 Agent 状态";
  }
}

async function save(): Promise<void> {
  const value = apiKey.value.trim();
  if (!desktop || !value) return;
  loading.value = true;
  error.value = "";
  try {
    await desktop.key.set(value);
    apiKey.value = "";
    configured.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存密钥失败";
  } finally {
    loading.value = false;
  }
}

async function clear(): Promise<void> {
  if (!desktop) return;
  loading.value = true;
  error.value = "";
  try {
    await desktop.key.clear();
    apiKey.value = "";
    configured.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "清除密钥失败";
  } finally {
    loading.value = false;
  }
}

onMounted(() => void refresh());
</script>

<template>
  <section v-if="desktop" class="desktop-agent-settings panel">
    <div class="desktop-agent-settings__copy">
      <p class="eyebrow">Desktop runtime</p>
      <strong>本机 Agent 安全设置</strong>
      <small>
        密钥由 Windows 安全存储加密，仅传入 Agent 进程；页面不读取或回显明文。
      </small>
    </div>
    <div class="desktop-agent-settings__processes">
      <ElTag
        v-for="(status, name) in statuses"
        :key="name"
        :type="status === 'running' ? 'success' : 'warning'"
        effect="plain"
      >
        {{ name }} · {{ status }}
      </ElTag>
      <ElButton circle :icon="RefreshCw" aria-label="刷新桌面进程状态" @click="refresh" />
    </div>
    <div class="desktop-agent-settings__key">
      <ElInput
        v-model="apiKey"
        type="password"
        autocomplete="off"
        :prefix-icon="KeyRound"
        placeholder="输入 OpenAI API Key"
        @keyup.enter="save"
      />
      <ElButton type="primary" :disabled="!apiKey.trim()" :loading="loading" @click="save">
        {{ configured ? "替换密钥" : "安全保存" }}
      </ElButton>
      <ElButton
        v-if="configured"
        :icon="Trash2"
        :loading="loading"
        @click="clear"
      >
        清除
      </ElButton>
    </div>
    <p v-if="error" class="desktop-agent-settings__error">{{ error }}</p>
  </section>
</template>

<style scoped>
.desktop-agent-settings {
  align-items: center;
  display: grid;
  gap: 12px 18px;
  grid-template-columns: minmax(220px, 1fr) auto minmax(320px, 1.25fr);
  padding: 14px 16px;
}
.desktop-agent-settings__copy { display: grid; gap: 3px; }
.desktop-agent-settings__copy small { color: #767c74; line-height: 1.45; }
.desktop-agent-settings__processes,
.desktop-agent-settings__key { align-items: center; display: flex; gap: 8px; }
.desktop-agent-settings__key :deep(.el-input) { min-width: 220px; }
.desktop-agent-settings__error {
  color: #b45309;
  grid-column: 1 / -1;
  margin: 0;
}
@media (max-width: 1120px) {
  .desktop-agent-settings { grid-template-columns: 1fr; }
  .desktop-agent-settings__error { grid-column: auto; }
}
@media (max-width: 760px) {
  .desktop-agent-settings__key { align-items: stretch; flex-direction: column; }
  .desktop-agent-settings__key :deep(.el-input),
  .desktop-agent-settings__key :deep(.el-button) { margin: 0; width: 100%; }
}
</style>
