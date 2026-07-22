<script setup lang="ts">
import type { DailyReportArchive } from "@amazon-monitor/shared";
import { dailyReportCoverageStatusLabels } from "@amazon-monitor/shared";
import { Clock3, History, ListChecks, ShieldAlert, Signal } from "@lucide/vue";
import { ElCard, ElEmpty, ElScrollbar, ElTag } from "element-plus";

defineProps<{
  history: DailyReportArchive[];
  historyTotal: number;
  activeReport: DailyReportArchive | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  select: [date: string];
}>();

function statusType(status: DailyReportArchive["coverageStatus"]): "success" | "warning" | "info" {
  if (status === "complete") return "success";
  if (status === "partial") return "warning";
  return "info";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
</script>

<template>
  <ElCard shadow="never" class="report-card archive-card" :aria-busy="loading">
    <template #header>
      <div class="archive-title">
        <span><History :size="16" /> 日报归档</span>
        <ElTag size="small" effect="plain">{{ historyTotal }}</ElTag>
      </div>
    </template>

    <div v-if="activeReport" class="archive-metrics">
      <div>
        <Signal :size="15" />
        <span>信号</span>
        <strong>{{ activeReport.signalCount }}</strong>
      </div>
      <div>
        <ShieldAlert :size="15" />
        <span>风险</span>
        <strong>{{ activeReport.riskCount }}</strong>
      </div>
      <div>
        <ListChecks :size="15" />
        <span>任务</span>
        <strong>{{ activeReport.taskCount }}</strong>
      </div>
    </div>

    <ElScrollbar v-if="history.length" max-height="300" class="archive-scroll">
      <div class="archive-list">
        <button
          v-for="item in history"
          :key="item.id"
          type="button"
          class="archive-row"
          :class="{ active: activeReport?.id === item.id }"
          :aria-pressed="activeReport?.id === item.id"
          @click="emit('select', item.reportDate)"
        >
          <span class="archive-row-main">
            <strong>{{ item.reportDate }}</strong>
            <small>v{{ item.version }} · {{ item.generatedByName || "系统" }}</small>
          </span>
          <span class="archive-row-meta">
            <ElTag size="small" :type="statusType(item.coverageStatus)" effect="light">
              {{ dailyReportCoverageStatusLabels[item.coverageStatus] }}
            </ElTag>
            <small><Clock3 :size="12" /> {{ formatUpdatedAt(item.updatedAt) }}</small>
          </span>
        </button>
      </div>
    </ElScrollbar>

    <ElEmpty
      v-else
      description="暂无归档。生成日报后会按日期保留版本。"
      :image-size="64"
    />
  </ElCard>
</template>

<style scoped>
.archive-card {
  min-width: 0;
}

.archive-title,
.archive-title > span {
  align-items: center;
  display: flex;
}

.archive-title {
  color: #172033;
  font-size: 13px;
  font-weight: 700;
  justify-content: space-between;
}

.archive-title > span {
  gap: 8px;
}

.archive-metrics {
  border-bottom: 1px solid #e6e9ee;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: -4px 0 10px;
  padding: 0 0 10px;
}

.archive-metrics > div {
  align-items: center;
  color: #667085;
  display: grid;
  font-size: 11px;
  gap: 3px;
  grid-template-columns: auto 1fr;
  padding: 0 8px;
}

.archive-metrics > div + div {
  border-left: 1px solid #e6e9ee;
}

.archive-metrics strong {
  color: #111827;
  font-size: 18px;
  grid-column: 1 / -1;
}

.archive-list {
  display: grid;
  gap: 4px;
  padding-right: 4px;
}

.archive-row {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 9px 10px;
  text-align: left;
  transition: background-color 140ms ease, border-color 140ms ease;
  width: 100%;
}

.archive-row:hover {
  background: #f6f7f9;
  border-color: #e1e5ea;
}

.archive-row.active {
  background: #f0f5ff;
  border-color: #b9cff7;
}

.archive-row-main,
.archive-row-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.archive-row-main strong {
  color: #172033;
  font-size: 13px;
}

.archive-row small {
  color: #7b8494;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-row-meta {
  justify-items: end;
}

.archive-row-meta small {
  align-items: center;
  display: flex;
  gap: 3px;
}
</style>
