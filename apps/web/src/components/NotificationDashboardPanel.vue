<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Activity, CheckCircle2, Clock, Send, XCircle } from "@lucide/vue";
import { ElEmpty } from "element-plus";
import type { NotificationSchedule, NotificationSendLog } from "@amazon-monitor/shared";
import { useEchartsCharts } from "../composables/useEchartsCharts";
import { computeNotificationStats } from "../composables/useNotificationStats";
import {
  buildNotificationChannelOption,
  buildNotificationErrorTypeOption,
  buildNotificationScheduleStatusOption,
  buildNotificationTrendOption
} from "../utils/notificationChartOptions";

const props = defineProps<{
  notificationSchedules: NotificationSchedule[];
  notificationLogs: NotificationSendLog[];
}>();

const stats = computed(() =>
  computeNotificationStats(props.notificationLogs, props.notificationSchedules)
);

watch(
  () => [props.notificationLogs, props.notificationSchedules] as const,
  () => {
    stats.value;
    renderCharts();
  },
  { immediate: true }
);

const trendEl = ref<HTMLDivElement | null>(null);
const channelEl = ref<HTMLDivElement | null>(null);
const errorEl = ref<HTMLDivElement | null>(null);
const scheduleEl = ref<HTMLDivElement | null>(null);

const { renderChartSpecs } = useEchartsCharts();

async function renderCharts(): Promise<void> {
  const s = stats.value;
  await renderChartSpecs(
    () => [
      { key: "trend", element: trendEl.value, option: buildNotificationTrendOption(s.trend) },
      { key: "channel", element: channelEl.value, option: buildNotificationChannelOption(s.channelMix) },
      { key: "error", element: errorEl.value, option: buildNotificationErrorTypeOption(s.errorTypes) },
      { key: "schedule", element: scheduleEl.value, option: buildNotificationScheduleStatusOption(s.scheduleStatus) }
    ],
    () => props.notificationLogs.length > 0 || props.notificationSchedules.length > 0
  );
}

function rateTone(rate: number): string {
  if (rate >= 95) return "good";
  if (rate >= 80) return "warn";
  return "bad";
}
</script>

<template>
  <section class="panel notif-dashboard">
    <div class="panel-head panel-head-split">
      <div>
        <h2>发送概览</h2>
        <span>基于最近 {{ notificationLogs.length }} 条发送日志聚合</span>
      </div>
      <p class="panel-caption">把排期与日志聚合成立体视图，成功率与失败原因一眼可见。</p>
    </div>

    <div class="kpi-row">
      <article class="kpi-card kpi-total">
        <div class="kpi-top">
          <Send :size="16" />
          <span>累计发送</span>
        </div>
        <strong>{{ stats.kpi.total }}</strong>
        <small>近 7 天 {{ stats.trend.reduce((a, p) => a + p.success + p.failed, 0) }} 封</small>
      </article>
      <article class="kpi-card kpi-success">
        <div class="kpi-top">
          <CheckCircle2 :size="16" />
          <span>成功</span>
        </div>
        <strong>{{ stats.kpi.success }}</strong>
        <small>占累计 {{ stats.kpi.total > 0 ? ((stats.kpi.success / stats.kpi.total) * 100).toFixed(1) : 0 }}%</small>
      </article>
      <article class="kpi-card kpi-failed">
        <div class="kpi-top">
          <XCircle :size="16" />
          <span>失败</span>
        </div>
        <strong>{{ stats.kpi.failed }}</strong>
        <small v-if="stats.errorTypes.length">{{ stats.errorTypes[0].type }} 最多</small>
        <small v-else>暂无失败</small>
      </article>
      <article class="kpi-card" :class="`kpi-rate-${rateTone(stats.kpi.successRate)}`">
        <div class="kpi-top">
          <Activity :size="16" />
          <span>成功率</span>
        </div>
        <strong>{{ stats.kpi.successRate }}<i>%</i></strong>
        <small>{{ stats.kpi.successRate >= 95 ? "投递健康" : stats.kpi.successRate >= 80 ? "需关注" : "需排查" }}</small>
      </article>
      <article class="kpi-card kpi-active">
        <div class="kpi-top">
          <Clock :size="16" />
          <span>活跃排期</span>
        </div>
        <strong>{{ stats.kpi.activeSchedules }}</strong>
        <small>邮箱 {{ stats.scheduleStatus.emailActive }} · 飞书 {{ stats.scheduleStatus.feishuActive }}</small>
      </article>
    </div>

    <ElEmpty
      v-if="notificationLogs.length === 0 && notificationSchedules.length === 0"
      description="暂无发送数据，配置 SMTP 并创建排期后这里会出现可视化。"
      :image-size="72"
    />
    <div v-else class="chart-grid">
      <section class="chart-card chart-card-wide">
        <div class="chart-title">
          <Activity :size="15" />
          <span>发送趋势 · 近 7 天</span>
        </div>
        <div ref="trendEl" class="report-chart"></div>
      </section>
      <section class="chart-card">
        <div class="chart-title">
          <Send :size="15" />
          <span>通道占比</span>
        </div>
        <div ref="channelEl" class="report-chart"></div>
      </section>
      <section class="chart-card">
        <div class="chart-title">
          <XCircle :size="15" />
          <span>失败原因分类</span>
        </div>
        <div ref="errorEl" class="report-chart error-chart"></div>
      </section>
      <section class="chart-card">
        <div class="chart-title">
          <Clock :size="15" />
          <span>排期状态</span>
        </div>
        <div ref="scheduleEl" class="report-chart"></div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.kpi-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #cbd5e1;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.kpi-total { border-left-color: #3b82f6; }
.kpi-success { border-left-color: #10b981; }
.kpi-failed { border-left-color: #ef4444; }
.kpi-rate-good { border-left-color: #10b981; }
.kpi-rate-warn { border-left-color: #f59e0b; }
.kpi-rate-bad { border-left-color: #ef4444; }
.kpi-active { border-left-color: #8b5cf6; }

.kpi-top {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
}

.kpi-card strong {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.5px;
  line-height: 1.15;
}

.kpi-card strong i {
  font-style: normal;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  margin-left: 2px;
}

.kpi-card small {
  color: #94a3b8;
  font-size: 11px;
}

.chart-grid {
  display: grid;
  grid-template-columns: 14fr 10fr;
  grid-template-areas:
    "trend channel"
    "trend error"
    "schedule schedule";
  gap: 10px;
}

.chart-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
}

.chart-card-wide {
  grid-area: trend;
}

.chart-grid > .chart-card:nth-of-type(2) { grid-area: channel; }
.chart-grid > .chart-card:nth-of-type(3) { grid-area: error; }
.chart-grid > .chart-card:nth-of-type(4) { grid-area: schedule; }

.chart-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
}

.report-chart {
  height: 220px;
  min-width: 0;
  width: 100%;
}

.chart-card-wide .report-chart {
  height: 260px;
}

.error-chart {
  height: 180px;
}

@media (max-width: 1080px) {
  .kpi-row { grid-template-columns: repeat(3, 1fr); }
  .chart-grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      "trend"
      "channel"
      "error"
      "schedule";
  }
}

@media (max-width: 640px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
}
</style>
