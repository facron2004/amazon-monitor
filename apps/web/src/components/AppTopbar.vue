<script setup lang="ts">
import { computed } from "vue";
import { Activity, CalendarDays, LayoutPanelTop, Menu, Radar } from "@lucide/vue";
import type { CollectionFreshness, QueueStats, WorkerStatus } from "@amazon-monitor/shared";
import FreshnessBadge from "./FreshnessBadge.vue";

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
}>();

const heroContent = computed(() => {
  const contentByTab: Record<string, { title: string; copy: string }> = {
    "总览": {
      title: "运营总览",
      copy: "把采集健康度、监控范围和预警队列放在同一个视野里，快速进入当日复盘。"
    },
    "类目情报": {
      title: "类目榜单情报",
      copy: "把榜单波动、品牌压力、评价增长和促销信号串成清晰的信息流。"
    },
    "关键词": {
      title: "关键词监控看板",
      copy: "逐词查看搜索位次快照、采集状态和价格变化，快速定位异常词与强势词。"
    },
    "竞品池": {
      title: "竞品观察池",
      copy: "筛选、排序并回溯竞品证据，让每一次判断都能找到对应来源。"
    },
    "运营行动中心": {
      title: "运营行动中心",
      copy: "把高价值信号收拢成待处理队列，直接进入任务、复盘和 SOP 沉淀。"
    },
    "任务": {
      title: "任务工作台",
      copy: "跟踪从预警到处理结果的动作链路，减少人工交接遗漏。"
    },
    "SOP 知识库": {
      title: "SOP 知识库",
      copy: "沉淀有效处理方式，让竞品响应和复盘动作可以重复执行。"
    },
    "预警": {
      title: "预警处理台",
      copy: "优先处理关键变化，让监控结果尽快转化为可执行动作。"
    },
    "通知": {
      title: "发送与排期中心",
      copy: "管理报告投递规则、手动发送和定时通知，让输出链路更稳定。"
    },
    "报告": {
      title: "日报与分析输出",
      copy: "在监控上下文里查看日报和类目分析，不再切换到别的工作流。"
    },
    "日志": {
      title: "采集运行日志",
      copy: "先确认抓取是否健康，再决定重跑、排查或直接处理异常数据。"
    }
  };

  return contentByTab[props.activeTabLabel] ?? {
    title: "亚马逊监控驾驶舱",
    copy: "把采集、波动和后续动作收拢到一张运营界面里。"
  };
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
    <div class="topbar-main">
      <div class="topbar-utility">
        <button class="icon-button topbar-toggle" type="button" aria-label="切换导航" @click="emit('toggle-sidebar')">
          <Menu :size="18" />
        </button>
        <span class="hero-chip hero-chip-quiet">
          <LayoutPanelTop :size="14" />
          <span>{{ activeTabLabel }}</span>
        </span>
      </div>

      <p class="eyebrow">亚马逊监控驾驶舱</p>
      <h1>{{ heroContent.title }}</h1>
      <p class="topbar-copy">{{ heroContent.copy }}</p>

      <div class="topbar-meta">
        <span class="hero-chip">
          <CalendarDays :size="14" />
          <span>数据日期 {{ selectedDate }}</span>
        </span>
        <span :class="['hero-chip', topbarStatus.isLive ? 'is-live' : 'hero-chip-quiet']">
          <Radar :size="14" />
          <span>{{ topbarStatus.label }}</span>
        </span>
      </div>
    </div>

    <div class="topbar-side">
      <section class="topbar-pulse">
        <span class="topbar-pulse-label">当前状态</span>
        <strong>{{ queueSummary ?? (collecting ? "采集启动中" : "等待操作") }}</strong>
        <p>队列、Worker 和快照新鲜度会在这里汇合，先确认系统状态，再进入具体视图处理。</p>
      </section>

      <div class="topbar-health-row">
        <FreshnessBadge :freshness="freshness" />
        <span v-if="queueSummary" :class="queueBadgeClass" :title="queueSummary">
          <Activity :size="14" />
          <span>{{ queueSummary }}</span>
        </span>
        <span v-if="workerIndicator" :class="workerIndicator.className" :title="workerIndicator.tooltip">
          <span class="worker-dot-pulse" aria-hidden="true"></span>
          <span>{{ workerIndicator.label }}</span>
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar-health-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.queue-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(226, 232, 240, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
}

.queue-badge.is-active {
  background: rgba(20, 184, 166, 0.16);
  color: #99f6e4;
  border-color: rgba(45, 212, 191, 0.24);
}

.queue-badge.is-busy {
  background: rgba(225, 29, 72, 0.18);
  color: #fecdd3;
  border-color: rgba(251, 113, 133, 0.24);
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
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(226, 232, 240, 0.86);
  border-color: rgba(255, 255, 255, 0.08);
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
  background: rgba(34, 197, 94, 0.28);
  border-color: rgba(134, 239, 172, 0.48);
  color: #ecfdf5;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.16), 0 8px 18px rgba(34, 197, 94, 0.18);
}

.worker-dot.is-alive .worker-dot-pulse {
  background: #22c55e;
}

.worker-dot.is-stale {
  background: rgba(202, 138, 4, 0.16);
  color: #fef08a;
}

.worker-dot.is-offline {
  background: rgba(216, 60, 60, 0.18);
  color: #fecaca;
}

@keyframes worker-pulse {
  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.68); }
  70% { box-shadow: 0 0 0 7px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
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
