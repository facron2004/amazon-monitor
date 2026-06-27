<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, Menu, Radar } from "@lucide/vue";
import type { CollectionFreshness, QueueStats, WorkerStatus } from "@amazon-monitor/shared";
import FreshnessBadge from "./FreshnessBadge.vue";

const props = defineProps<{
  loading: boolean;
  activeTabLabel: string;
  selectedDate: string;
  freshness: CollectionFreshness[];
  queueStats: QueueStats | null;
  workerStatus: WorkerStatus | null;
}>();

const emit = defineEmits<{
  (event: "toggle-sidebar"): void;
}>();

/**
 * Human-readable summary of queue health. Returns null when no stats are
 * loaded yet so the badge hides itself instead of showing zeros.
 */
const queueSummary = computed(() => {
  const stats = props.queueStats;
  if (!stats) return null;

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

  return parts.length > 0 ? parts.join(" · ") : "队列空闲";
});

const queueBadgeClass = computed(() => {
  const stats = props.queueStats;
  if (!stats) return "queue-badge";
  if (stats.processingCount > 0) return "queue-badge is-active";
  if (stats.pendingCount > 5 || stats.oldestPendingAgeMs > 5 * 60_000) return "queue-badge is-busy";
  return "queue-badge";
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
    <button class="icon-button topbar-toggle" type="button" aria-label="切换导航" @click="emit('toggle-sidebar')">
      <Menu :size="18" />
    </button>
    <span class="topbar-tab-label">{{ activeTabLabel }}</span>
    <span class="topbar-date">
      <CalendarDays :size="14" />
      <span>{{ selectedDate }}</span>
    </span>
    <FreshnessBadge :freshness="freshness" />
    <span v-if="queueSummary" :class="queueBadgeClass" :title="queueSummary">
      <Radar :size="14" />
      <span>{{ queueSummary }}</span>
    </span>
    <span v-if="workerIndicator" :class="workerIndicator.className" :title="workerIndicator.tooltip">
      <span class="worker-dot-pulse" aria-hidden="true"></span>
      <span>{{ workerIndicator.label }}</span>
    </span>
    <span :class="['topbar-status', loading ? 'is-live' : '']">
      <Radar :size="14" />
      <span>{{ loading ? "采集中" : "就绪" }}</span>
    </span>
  </header>
</template>

<style scoped>
.queue-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(120, 120, 120, 0.12);
  color: #555;
  white-space: nowrap;
}

.queue-badge.is-active {
  background: rgba(56, 132, 255, 0.18);
  color: #1f5fd1;
}

.queue-badge.is-busy {
  background: rgba(220, 130, 30, 0.18);
  color: #a8621c;
}

/**
 * Worker online indicator — three discrete states with a small breathing
 * dot so it reads at a glance even from the far edge of the topbar.
 */
.worker-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
  background: rgba(120, 120, 120, 0.12);
  color: #555;
}

.worker-dot-pulse {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 0 currentColor;
  animation: worker-pulse 1.8s ease-out infinite;
}

.worker-dot.is-alive {
  background: rgba(48, 168, 96, 0.18);
  color: #1f7a3f;
}

.worker-dot.is-stale {
  background: rgba(220, 130, 30, 0.18);
  color: #a8621c;
}

.worker-dot.is-offline {
  background: rgba(216, 60, 60, 0.18);
  color: #b33636;
}

@keyframes worker-pulse {
  0% { box-shadow: 0 0 0 0 rgba(48, 168, 96, 0.45); }
  70% { box-shadow: 0 0 0 6px rgba(48, 168, 96, 0); }
  100% { box-shadow: 0 0 0 0 rgba(48, 168, 96, 0); }
}

.worker-dot.is-stale .worker-dot-pulse {
  animation-name: worker-pulse-stale;
}

.worker-dot.is-offline .worker-dot-pulse {
  animation: none;
  background: currentColor;
}

@keyframes worker-pulse-stale {
  0% { box-shadow: 0 0 0 0 rgba(220, 130, 30, 0.5); }
  70% { box-shadow: 0 0 0 6px rgba(220, 130, 30, 0); }
  100% { box-shadow: 0 0 0 0 rgba(220, 130, 30, 0); }
}
</style>
