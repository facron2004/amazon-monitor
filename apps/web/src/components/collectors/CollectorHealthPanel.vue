<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { Activity, AlertTriangle, Clock3, RefreshCw, Server } from "@lucide/vue";
import { formatLocalDateTime } from "../../utils/formatters";
import { useCollectorsStore } from "../../stores/collectors";
import {
  collectionFreshnessState,
  collectorTaskTypeLabels,
  formatElapsedMs,
  workerDisplay
} from "./collector-display";

const store = useCollectorsStore();
const { freshness, queueStats, workerStatus, failedJobs, loadedAt, error } = storeToRefs(store);

const worker = computed(() => workerDisplay(workerStatus.value));
const activeQueueCount = computed(() =>
  (queueStats.value?.pendingCount ?? 0) + (queueStats.value?.processingCount ?? 0)
);
const completedCount = computed(() => queueStats.value?.completedRecentCount ?? 0);
const oldestWait = computed(() =>
  queueStats.value?.pendingCount
    ? `最久等待 ${formatElapsedMs(queueStats.value.oldestPendingAgeMs)}`
    : "无等待任务"
);
</script>

<template>
  <div v-if="error" class="collector-error-banner">
    <div>
      <strong>采集状态读取失败</strong>
      <span>{{ error }}</span>
    </div>
    <button class="primary" type="button" @click="store.restartWorker()">
      <RefreshCw :size="14" />
      <span>重试</span>
    </button>
  </div>

  <div class="collector-health-grid">
    <article class="collector-health-card">
      <div :class="['collector-health-icon', `is-${worker.tone}`]"><Server :size="18" /></div>
      <div><span>采集 Worker</span><strong>{{ worker.label }}</strong><small>{{ worker.detail }}</small></div>
    </article>
    <article class="collector-health-card">
      <div class="collector-health-icon is-info"><Activity :size="18" /></div>
      <div><span>活动队列</span><strong>{{ activeQueueCount }}</strong><small>{{ oldestWait }}</small></div>
    </article>
    <article class="collector-health-card">
      <div class="collector-health-icon is-healthy"><Clock3 :size="18" /></div>
      <div><span>已完成任务</span><strong>{{ completedCount }}</strong><small>当前队列历史累计</small></div>
    </article>
    <article class="collector-health-card">
      <div :class="['collector-health-icon', failedJobs.length ? 'is-danger' : 'is-neutral']"><AlertTriangle :size="18" /></div>
      <div><span>失败任务</span><strong>{{ failedJobs.length }}</strong><small>{{ loadedAt ? `${formatLocalDateTime(loadedAt)} 更新` : "等待刷新" }}</small></div>
    </article>
  </div>

  <section class="panel collector-freshness-panel">
    <header class="collector-section-head">
      <div>
        <p class="eyebrow">Freshness</p>
        <h3>数据新鲜度</h3>
      </div>
      <span>按采集域检查最后成功时间与失败占比</span>
    </header>
    <div class="collector-freshness-list">
      <article v-for="item in freshness" :key="item.taskType" class="collector-freshness-row">
        <div>
          <strong>{{ collectorTaskTypeLabels[item.taskType] }}</strong>
          <span>最近完成 {{ item.lastCompletedAt ? formatLocalDateTime(item.lastCompletedAt) : "-" }}</span>
        </div>
        <div class="collector-freshness-counts">
          <span>{{ item.totalJobs }} 个任务</span>
          <span>{{ item.failedJobs }} 个失败</span>
        </div>
        <div :class="['collector-freshness-state', `is-${collectionFreshnessState(item).tone}`]">
          <strong>{{ collectionFreshnessState(item).label }}</strong>
          <span>{{ collectionFreshnessState(item).detail }}</span>
        </div>
      </article>
      <div v-if="freshness.length === 0" class="collector-inline-empty">暂无新鲜度记录，发起首次采集后这里会显示证据时间。</div>
    </div>
  </section>
</template>

<style scoped>
.collector-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(248, 113, 113, 0.28);
  border-radius: 12px;
  background: rgba(254, 242, 242, 0.92);
  color: #991b1b;
}

.collector-error-banner strong,
.collector-error-banner span {
  display: block;
}

.collector-error-banner span {
  color: #7f1d1d;
  font-size: 12px;
}
</style>
