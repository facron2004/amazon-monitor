<script setup lang="ts">
import {
  dailyReportCoverageStatusLabels,
  workflowReportPeriodLabels,
  type PeriodReportArchive,
  type WorkflowReportPeriod
} from "@amazon-monitor/shared";
import { CalendarRange, Clock3, History, ListChecks, Signal } from "@lucide/vue";
import { ElCard, ElEmpty, ElScrollbar, ElTag } from "element-plus";

defineProps<{
  period: WorkflowReportPeriod;
  history: PeriodReportArchive[];
  historyTotal: number;
  activeReport: PeriodReportArchive | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  select: [endDate: string];
}>();

function statusType(status: PeriodReportArchive["coverageStatus"]): "success" | "warning" | "info" {
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
  <ElCard shadow="never" class="report-card period-archive-card" :aria-busy="loading">
    <template #header>
      <div class="period-archive-title">
        <span><History :size="16" /> {{ workflowReportPeriodLabels[period] }}归档</span>
        <ElTag size="small" effect="plain">{{ historyTotal }}</ElTag>
      </div>
    </template>

    <div v-if="activeReport" class="period-archive-metrics">
      <div><CalendarRange :size="15" /><span>站点</span><strong>{{ activeReport.salesMarketplaceCount }}</strong></div>
      <div><Signal :size="15" /><span>洞察</span><strong>{{ activeReport.insightCount }}</strong></div>
      <div><ListChecks :size="15" /><span>完成</span><strong>{{ activeReport.completedTaskCount }}</strong></div>
    </div>

    <ElScrollbar v-if="history.length" max-height="250">
      <div class="period-archive-list">
        <button
          v-for="item in history"
          :key="item.id"
          type="button"
          class="period-archive-row"
          :class="{ active: activeReport?.id === item.id }"
          :aria-pressed="activeReport?.id === item.id"
          @click="emit('select', item.endDate)"
        >
          <span>
            <strong>{{ item.startDate }} - {{ item.endDate }}</strong>
            <small>v{{ item.version }} · {{ item.generatedByName || "系统" }}</small>
          </span>
          <span>
            <ElTag size="small" :type="statusType(item.coverageStatus)" effect="light">
              {{ dailyReportCoverageStatusLabels[item.coverageStatus] }}
            </ElTag>
            <small><Clock3 :size="12" /> {{ formatUpdatedAt(item.updatedAt) }}</small>
          </span>
        </button>
      </div>
    </ElScrollbar>

    <ElEmpty v-else :description="`暂无${workflowReportPeriodLabels[period]}归档。`" :image-size="56" />
  </ElCard>
</template>

<style scoped>
.period-archive-card,
.period-archive-row span {
  min-width: 0;
}

.period-archive-title,
.period-archive-title > span,
.period-archive-row,
.period-archive-row > span,
.period-archive-row small {
  align-items: center;
  display: flex;
}

.period-archive-title {
  color: #172033;
  font-size: 13px;
  font-weight: 700;
  justify-content: space-between;
}

.period-archive-title > span {
  gap: 8px;
}

.period-archive-metrics {
  border-bottom: 1px solid #e6e9ee;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: -4px 0 10px;
  padding-bottom: 10px;
}

.period-archive-metrics div {
  color: #667085;
  display: grid;
  font-size: 11px;
  gap: 3px;
  grid-template-columns: auto 1fr;
  padding: 0 8px;
}

.period-archive-metrics div + div {
  border-left: 1px solid #e6e9ee;
}

.period-archive-metrics strong {
  color: #111827;
  font-size: 18px;
  grid-column: 1 / -1;
}

.period-archive-list {
  display: grid;
  gap: 4px;
  padding-right: 4px;
}

.period-archive-row {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
  gap: 8px;
  justify-content: space-between;
  padding: 9px 10px;
  text-align: left;
  width: 100%;
}

.period-archive-row:hover,
.period-archive-row.active {
  background: #f0f5ff;
  border-color: #b9cff7;
}

.period-archive-row > span {
  align-items: flex-start;
  flex-direction: column;
  gap: 4px;
}

.period-archive-row > span:last-child {
  align-items: flex-end;
  flex: 0 0 auto;
}

.period-archive-row strong {
  color: #172033;
  font-size: 12px;
}

.period-archive-row small {
  color: #7b8494;
  font-size: 10px;
  gap: 3px;
}
</style>
