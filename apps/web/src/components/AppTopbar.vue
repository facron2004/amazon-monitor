<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Activity, CalendarDays, LayoutPanelTop, Menu, Play, RefreshCw } from "@lucide/vue";
import type { CollectionFreshness, QueueStats, WorkerStatus } from "@amazon-monitor/shared";
import { useWriteAccess } from "../composables/useWriteAccess";
import FreshnessBadge from "./FreshnessBadge.vue";

const { canWrite } = useWriteAccess("manage_collection");

const props = defineProps<{
  loading: boolean;
  collecting: boolean;
  activeTabLabel: string;
  selectedDate: string;
  freshness: CollectionFreshness[];
  queueStats: QueueStats | null;
  workerStatus: WorkerStatus | null;
}>();

const emit = defineEmits<{
  (event: "toggle-sidebar"): void;
  (event: "update:selected-date", value: string): void;
  (event: "collect"): void;
  (event: "refresh"): void;
  (event: "restart-worker"): void;
  (event: "poll-worker-status"): void;
}>();

const pollingTimer = ref<number | null>(null);

onMounted(() => {
  emit("poll-worker-status");
  pollingTimer.value = window.setInterval(() => emit("poll-worker-status"), 5000);
});

onUnmounted(() => {
  if (pollingTimer.value !== null) window.clearInterval(pollingTimer.value);
});

/**
 * Human-readable summary of queue health. Returns null when no stats are
 * loaded yet so the badge hides itself instead of showing zeros.
 */
const queueSummary = computed(() => {
  const stats = props.queueStats;
  if (!stats) return props.collecting ? "采集启动中" : null;

  const pending = stats.pendingCount;
  const processing = stats.processingCount;
  const oldestMs = stats.oldestPendingAgeMs;

  let oldestLabel = "";
  if (oldestMs > 0) {
    if (oldestMs < 60_000) {
      oldestLabel = `${Math.max(1, Math.round(oldestMs / 1000))}s`;
    } else if (oldestMs < 3_600_000) {
      oldestLabel = `${Math.round(oldestMs / 60_000)}m`;
    } else {
      oldestLabel = `${(oldestMs / 3_600_000).toFixed(1)}h`;
    }
  }

  const parts: string[] = [];
  if (processing > 0) parts.push(`采集中 ${processing}`);
  if (pending > 0) parts.push(`待处理 ${pending}`);
  if (oldestLabel) parts.push(`最老 ${oldestLabel}`);

  if (parts.length > 0) return parts.join("，");
  return props.collecting ? "采集启动中" : "队列空闲";
});

const queueBadgeClass = computed(() => {
  const stats = props.queueStats;
  if (!stats) return props.collecting ? "queue-badge is-active" : "queue-badge";
  if (stats.processingCount > 0) return "queue-badge is-active";
  if (stats.pendingCount > 5 || stats.oldestPendingAgeMs > 5 * 60_000) return "queue-badge is-busy";
  if (props.collecting) return "queue-badge is-active";
  return "queue-badge";
});

const topbarStatus = computed(() => {
  if (props.collecting) {
    return { isLive: true, label: "采集中" };
  }
  if (props.loading) {
    return { isLive: true, label: "刷新中" };
  }
  return { isLive: false, label: "就绪" };
});

/**
 * Worker online dot — green when alive, yellow when stale, red when offline.
 * Returns null while the first fetch is in flight so the dot doesn't flash
 * red on every page load.
 *
 * The `tooltip` describes why the dot is the colour it is — useful when
 * "Worker 离线" appears, since the cause is rarely obvious (process died,
 * DB lock contention, etc).
 */
const workerIndicator = computed(() => {
  const status = props.workerStatus;
  if (!status) return null;

  if (status.alive) {
    return {
      className: "worker-dot is-alive",
      label: "Worker 在线",
      tooltip: status.lastJobId
        ? `Worker 在线 · 上次任务 #${status.lastJobId} ${status.lastStatus === "completed" ? "已完成" : status.lastStatus === "failed" ? "失败" : status.lastStatus}`
        : "Worker 在线 · 等待任务"
    };
  }
  if (status.stale) {
    return {
      className: "worker-dot is-stale",
      label: "Worker 延迟",
      tooltip: `Worker ${status.ageMs ? Math.round(status.ageMs / 1000) : "?"}s 未上报心跳`
    };
  }
  return {
    className: "worker-dot is-offline",
    label: "Worker 离线",
    tooltip: "Worker 进程离线，pending 任务不会自动执行，请检查 worker 日志"
  };
});
</script>

<template>
  <header class="topbar">
    <div class="topbar-context">
      <button class="icon-button topbar-toggle" type="button" aria-label="切换导航" @click="emit('toggle-sidebar')">
        <Menu :size="18" />
      </button>
      <span class="topbar-section">
        <LayoutPanelTop :size="15" />
        <span>{{ activeTabLabel }}</span>
      </span>
      <span class="topbar-divider" aria-hidden="true"></span>
      <h1>{{ activeTabLabel }}</h1>
    </div>

    <div class="topbar-command-bar">
      <label class="topbar-date-control">
        <CalendarDays :size="15" />
        <span class="sr-only">数据日期</span>
        <input
          :value="selectedDate"
          type="date"
          @input="emit('update:selected-date', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <button class="icon-button topbar-refresh" type="button" :disabled="loading" title="刷新当前数据" aria-label="刷新当前数据" @click="emit('refresh')">
        <RefreshCw :size="16" :class="{ spinning: loading }" />
      </button>
      <button class="primary topbar-collect" type="button" :disabled="loading || !canWrite" :title="canWrite ? '运行全量采集' : '当前账号为只读角色'" @click="emit('collect')">
        <Play v-if="!collecting" :size="15" />
        <RefreshCw v-else :size="15" class="spinning" />
        <span>{{ collecting ? "采集中" : "开始采集" }}</span>
      </button>
      <span :class="['topbar-ready', { 'is-live': topbarStatus.isLive }]">{{ topbarStatus.label }}</span>
    </div>

    <div class="topbar-health-row">
      <FreshnessBadge :freshness="freshness" />
      <span v-if="queueSummary" :class="queueBadgeClass" :title="queueSummary">
        <Activity :size="14" />
        <span>{{ queueSummary }}</span>
      </span>
      <button
        v-if="workerIndicator"
        :class="workerIndicator.className"
        type="button"
        :title="workerIndicator.tooltip"
        @click="workerIndicator.label === 'Worker 离线' ? emit('restart-worker') : undefined"
      >
        <span class="worker-dot-pulse" aria-hidden="true"></span>
        <span>{{ workerIndicator.label }}</span>
      </button>
    </div>
  </header>
</template>
