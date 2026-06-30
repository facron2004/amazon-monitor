<script setup lang="ts">
import type { Component } from "vue";
import { CheckCircle2, Eye, ListTodo } from "@lucide/vue";
import type { InsightEvent } from "@amazon-monitor/shared";
import ActionCenterRow from "./ActionCenterRow.vue";

type ActionColumnKey = "todo" | "mid" | "closed";

const props = defineProps<{
  column: ActionColumnKey;
  currentDate: string;
  events: InsightEvent[];
  selectedEventId?: string | null;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
}>();

const columnConfig: Record<ActionColumnKey, { icon: Component; label: string; emptyText: string }> = {
  todo: { icon: ListTodo, label: "待处理", emptyText: "没有待处理事件" },
  mid: { icon: Eye, label: "观察 / 待复盘", emptyText: "没有观察 / 待复盘事件" },
  closed: { icon: CheckCircle2, label: "已跟进 / 已复盘", emptyText: "没有已结束事件" }
};
</script>

<template>
  <section class="action-column">
    <header>
      <component :is="columnConfig[props.column].icon" :size="14" />
      <span>{{ columnConfig[props.column].label }} · {{ events.length }}</span>
    </header>

    <div v-if="events.length" class="action-column-rows">
      <ActionCenterRow
        v-for="event in events"
        :key="event.id"
        :current-date="currentDate"
        :event="event"
        :selected="selectedEventId === event.id"
        @select="emit('select', $event)"
      />
    </div>

    <p v-else class="empty-copy">{{ columnConfig[props.column].emptyText }}</p>
  </section>
</template>

<style scoped>
.action-column {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 12px;
}

.action-column > header {
  align-items: center;
  color: #64748b;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  gap: 6px;
  letter-spacing: 0.02em;
  padding-bottom: 4px;
  text-transform: uppercase;
}

.action-column-rows {
  display: grid;
  flex: 1 1 auto;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.empty-copy {
  color: #64748b;
  font-size: 13px;
  margin: 12px 0;
  text-align: center;
}

@media (max-width: 1180px) {
  .action-column {
    min-height: auto;
  }

  .action-column-rows {
    flex: 0 1 auto;
    max-height: 420px;
    overflow-y: auto;
  }
}

@media (max-width: 760px) {
  .action-column-rows {
    max-height: 360px;
  }
}
</style>
