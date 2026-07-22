<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElMessage, ElOption, ElSelect } from "element-plus";
import { AlertTriangle, Play, RefreshCw } from "@lucide/vue";
import type { CollectorRunTaskType } from "../api-collect";
import { useCollectorsStore } from "../stores/collectors";
import CollectorHealthPanel from "./collectors/CollectorHealthPanel.vue";
import CollectorJobsTable from "./collectors/CollectorJobsTable.vue";
import CollectorTaskLogs from "./collectors/CollectorTaskLogs.vue";
import { useWriteAccess } from "../composables/useWriteAccess";
import ReadOnlyNotice from "./ReadOnlyNotice.vue";

const props = defineProps<{ date: string }>();

const store = useCollectorsStore();
const { canWrite } = useWriteAccess("manage_collection");
const { loading, running, error, failedJobs } = storeToRefs(store);
const runTaskType = ref<CollectorRunTaskType>("all");

async function refresh(): Promise<void> {
  try {
    await store.fetchCenter();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : String(cause));
  }
}

async function runCollection(): Promise<void> {
  if (!canWrite.value) return;
  try {
    const jobs = await store.runCollection({ taskType: runTaskType.value, date: props.date });
    if (jobs.length === 0) {
      ElMessage.warning("当前范围没有已启用的采集目标。");
      return;
    }
    ElMessage.success(`${jobs.length} 个采集任务已入队。`);
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : String(cause));
  }
}

function showFailures(): void {
  store.statusFilter = "failed";
  store.sort = "failures";
}
</script>

<template>
  <section class="view collectors-view">
    <header class="panel collectors-toolbar">
      <div class="collectors-heading">
        <p class="eyebrow">Collection Control</p>
        <h2>采集中心</h2>
        <span>统一查看 Worker、队列、新鲜度和失败证据，并按运营范围发起数据更新。</span>
      </div>
      <div class="collectors-actions">
        <ElSelect v-model="runTaskType" aria-label="运行范围" class="collector-run-select">
          <ElOption label="全部采集" value="all" />
          <ElOption label="仅关键词" value="keyword" />
          <ElOption label="仅类目榜单" value="category" />
        </ElSelect>
        <ElButton :loading="loading" title="刷新采集中心" @click="refresh">
          <template #icon><RefreshCw :size="15" /></template>
          刷新
        </ElButton>
        <ElButton type="primary" :loading="running" :disabled="!canWrite" @click="runCollection">
          <template #icon><Play :size="15" /></template>
          运行采集
        </ElButton>
      </div>
    </header>

    <ReadOnlyNotice v-if="!canWrite" />

    <div v-if="error" class="collector-error-banner" role="alert">
      <AlertTriangle :size="18" />
      <div><strong>采集状态读取失败</strong><span>{{ error }}</span></div>
      <ElButton size="small" @click="refresh">重试</ElButton>
    </div>

    <CollectorHealthPanel />

    <div v-if="failedJobs.length" class="collector-attention-banner">
      <AlertTriangle :size="18" />
      <div>
        <strong>{{ failedJobs.length }} 个失败任务需要处理</strong>
        <span>最近失败 #{{ failedJobs[0].id }}：{{ failedJobs[0].errorMessage || "未记录错误原因，请检查 Worker 日志。" }}</span>
      </div>
      <ElButton size="small" @click="showFailures">只看失败</ElButton>
    </div>

    <CollectorJobsTable />
    <CollectorTaskLogs />
  </section>
</template>

<style src="../styles/collectors.css"></style>
