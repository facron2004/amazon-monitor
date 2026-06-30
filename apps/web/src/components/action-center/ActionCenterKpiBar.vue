<script setup lang="ts">
import { CheckCircle2, Clock3, Eye, ListTodo, Send, UserRound } from "@lucide/vue";

type ActionColumnKey = "todo" | "mid" | "closed";

defineProps<{
  todoCount: number;
  midCount: number;
  closedCount: number;
  reviewDueCount: number;
  reviewDueDetail: string;
  unassignedCount: number;
  displayDate: string;
  reviewDueActive: boolean;
  unassignedActive: boolean;
}>();

const emit = defineEmits<{
  (event: "select-column", column: ActionColumnKey): void;
  (event: "focus-review-due"): void;
  (event: "focus-unassigned"): void;
}>();
</script>

<template>
  <header class="action-status-kpis">
    <button type="button" class="status-kpi" @click="emit('select-column', 'todo')">
      <ListTodo :size="15" />
      <small>待处理</small>
      <strong>{{ todoCount }}</strong>
    </button>
    <button type="button" class="status-kpi" @click="emit('select-column', 'mid')">
      <Eye :size="15" />
      <small>观察 / 待复盘</small>
      <strong>{{ midCount }}</strong>
    </button>
    <button type="button" class="status-kpi" @click="emit('select-column', 'closed')">
      <CheckCircle2 :size="15" />
      <small>已跟进 / 已复盘</small>
      <strong>{{ closedCount }}</strong>
    </button>
    <button
      type="button"
      class="status-kpi"
      :class="{ 'status-kpi-active': reviewDueActive }"
      :aria-pressed="reviewDueActive"
      @click="emit('focus-review-due')"
    >
      <Clock3 :size="15" />
      <span class="status-kpi-label">
        <small>到期复盘</small>
        <em>{{ reviewDueDetail }}</em>
      </span>
      <strong>{{ reviewDueCount }}</strong>
    </button>
    <button
      type="button"
      class="status-kpi"
      :class="{ 'status-kpi-active': unassignedActive }"
      :aria-pressed="unassignedActive"
      @click="emit('focus-unassigned')"
    >
      <UserRound :size="15" />
      <small>未分配</small>
      <strong>{{ unassignedCount }}</strong>
    </button>
    <span class="status-kpi status-kpi-static">
      <Send :size="15" />
      <small>日期</small>
      <strong>{{ displayDate }}</strong>
    </span>
  </header>
</template>

<style scoped>
.action-status-kpis {
  align-items: stretch;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.status-kpi {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 6px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 54px;
  padding: 9px 12px;
  text-align: left;
}

.status-kpi svg {
  color: #64748b;
}

.status-kpi small {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-kpi-label {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.status-kpi-label em {
  color: #94a3b8;
  font-size: 10px;
  font-style: normal;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-kpi strong {
  color: #0f172a;
  font-size: 20px;
  line-height: 1;
  text-align: right;
}

.status-kpi-static {
  cursor: default;
}

button.status-kpi:hover,
.status-kpi-active {
  background: #ecfdf5;
  border-color: #99f6e4;
}

.status-kpi-active svg,
.status-kpi-active small {
  color: #0f766e;
}

@media (max-width: 1180px) {
  .action-status-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .action-status-kpis {
    grid-template-columns: 1fr;
  }
}
</style>
