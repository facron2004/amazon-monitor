<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Clock3, Eye, ListTodo, ShieldAlert, SignalHigh } from "@lucide/vue";

defineProps<{
  p0Count: number;
  p1Count: number;
  todoCount: number;
  watchingCount: number;
  reviewDueCount: number;
  confirmedCount: number;
  coreRiskCount: number;
}>();

const cards = [
  { key: "p0Count", label: "今日 P0", icon: AlertTriangle },
  { key: "p1Count", label: "今日 P1", icon: SignalHigh },
  { key: "todoCount", label: "待处理", icon: ListTodo },
  { key: "watchingCount", label: "观察中", icon: Eye },
  { key: "reviewDueCount", label: "待复盘", icon: Clock3 },
  { key: "confirmedCount", label: "已验证", icon: CheckCircle2 },
  { key: "coreRiskCount", label: "核心风险", icon: ShieldAlert }
] as const;
</script>

<template>
  <div class="action-kpi-grid">
    <article v-for="card in cards" :key="card.key" class="action-kpi">
      <span>
        <component :is="card.icon" :size="16" />
      </span>
      <small>{{ card.label }}</small>
      <strong>{{ $props[card.key] }}</strong>
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
  min-height: 92px;
  padding: 12px;
}

.action-kpi span {
  align-items: center;
  background: #f1f5f9;
  border-radius: 8px;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  width: 30px;
}

.action-kpi small {
  color: #64748b;
  display: block;
  font-size: 12px;
  margin-top: 8px;
}

.action-kpi strong {
  color: #0f172a;
  display: block;
  font-size: 26px;
  line-height: 1.1;
  margin-top: 3px;
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
