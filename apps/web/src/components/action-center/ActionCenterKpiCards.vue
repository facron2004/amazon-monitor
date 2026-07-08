<script setup lang="ts">
import type { Component } from "vue";
import { AlertTriangle, CheckCircle2, Clock3, Eye, ListTodo, ShieldAlert, SignalHigh } from "@lucide/vue";
import { ElStatistic, ElTag, ElTooltip } from "element-plus";

interface ActionKpiCardsProps {
  p0Count: number;
  p1Count: number;
  todoCount: number;
  watchingCount: number;
  reviewDueCount: number;
  confirmedCount: number;
  coreRiskCount: number;
}

type KpiKey = keyof ActionKpiCardsProps;
type KpiTone = "danger" | "warning" | "primary" | "success" | "info";

const props = defineProps<ActionKpiCardsProps>();

const cards: Array<{
  key: KpiKey;
  label: string;
  description: string;
  tag: string;
  icon: Component;
  tone: KpiTone;
}> = [
  { key: "p0Count", label: "今日 P0", description: "今日 P0 事件数", tag: "优先", icon: AlertTriangle, tone: "danger" },
  { key: "p1Count", label: "今日 P1", description: "今日 P1 事件数", tag: "跟进", icon: SignalHigh, tone: "warning" },
  { key: "todoCount", label: "待处理", description: "待处理事件数", tag: "动作", icon: ListTodo, tone: "primary" },
  { key: "watchingCount", label: "观察中 ASIN", description: "观察中 ASIN 数", tag: "观察", icon: Eye, tone: "info" },
  { key: "reviewDueCount", label: "待复盘 ASIN", description: "待复盘 ASIN 数", tag: "复盘", icon: Clock3, tone: "warning" },
  { key: "confirmedCount", label: "已验证机会", description: "已验证有效机会数", tag: "有效", icon: CheckCircle2, tone: "success" },
  { key: "coreRiskCount", label: "高风险核心", description: "高风险核心竞品数", tag: "风险", icon: ShieldAlert, tone: "danger" }
];

function valueOf(key: KpiKey): number {
  return props[key];
}
</script>

<template>
  <div class="action-kpi-grid">
    <article v-for="card in cards" :key="card.key" class="action-kpi" :class="`action-kpi-${card.tone}`">
      <header>
        <span class="action-kpi-icon">
          <component :is="card.icon" :size="16" />
        </span>
        <ElTag size="small" effect="light" round>{{ card.tag }}</ElTag>
      </header>
      <ElTooltip :content="card.description" placement="top" :show-after="250">
        <ElStatistic :title="card.label" :value="valueOf(card.key)" />
      </ElTooltip>
    </article>
  </div>
</template>

<style scoped>
.action-kpi-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.action-kpi {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 10px;
  min-height: 92px;
  padding: 12px;
}

.action-kpi header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.action-kpi-icon {
  align-items: center;
  background: #f1f5f9;
  border-radius: 8px;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  width: 30px;
}

.action-kpi :deep(.el-statistic__head) {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-kpi :deep(.el-statistic__content) {
  color: #0f172a;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
}

.action-kpi-danger .action-kpi-icon {
  background: #fee2e2;
  color: #b91c1c;
}

.action-kpi-warning .action-kpi-icon {
  background: #fef3c7;
  color: #b45309;
}

.action-kpi-primary .action-kpi-icon {
  background: #dbeafe;
  color: #1d4ed8;
}

.action-kpi-success .action-kpi-icon {
  background: #dcfce7;
  color: #15803d;
}

.action-kpi-info .action-kpi-icon {
  background: #e0f2fe;
  color: #0369a1;
}

@media (max-width: 1100px) {
  .action-kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .action-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
