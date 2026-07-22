<script setup lang="ts">
import { ElButton, ElOption, ElSelect } from "element-plus";
import { RefreshCw } from "@lucide/vue";
import {
  taskPriorities,
  taskStatusLabels,
  type TaskPriority,
  type TaskStatus,
} from "@amazon-monitor/shared";
import type { TaskWorkspaceSummary } from "../../utils/task-workspace.js";
import { taskStatusOrder } from "../../utils/task-workspace.js";
import TaskExecutionExportButton from "./TaskExecutionExportButton.vue";

defineProps<{
  summary: TaskWorkspaceSummary;
  loading: boolean;
  canExport: boolean;
}>();

const status = defineModel<TaskStatus | "all">("status", { required: true });
const priority = defineModel<TaskPriority | "all">("priority", {
  required: true,
});
const emit = defineEmits<{ refresh: [] }>();

const metrics: Array<{ key: keyof TaskWorkspaceSummary; label: string }> = [
  { key: "pending", label: "待认领" },
  { key: "inProgress", label: "执行中" },
  { key: "awaitingReview", label: "待确认" },
  { key: "awaitingRecap", label: "待复盘" },
  { key: "overdue", label: "已逾期" },
];
</script>

<template>
  <header class="task-workspace-header">
    <div class="task-workspace-header__title">
      <div>
        <span class="task-workspace-header__eyebrow">OPERATIONS</span>
        <h1>任务中心</h1>
      </div>
      <strong>{{ summary.total }}</strong>
    </div>

    <dl class="task-workspace-metrics">
      <div
        v-for="metric in metrics"
        :key="metric.key"
        :class="{ 'is-alert': metric.key === 'overdue' && summary.overdue > 0 }"
      >
        <dt>{{ metric.label }}</dt>
        <dd>{{ summary[metric.key] }}</dd>
      </div>
    </dl>

    <div class="task-workspace-toolbar">
      <ElSelect v-model="status" aria-label="筛选任务状态" placeholder="状态">
        <ElOption label="全部状态" value="all" />
        <ElOption
          v-for="item in taskStatusOrder"
          :key="item"
          :label="taskStatusLabels[item]"
          :value="item"
        />
      </ElSelect>
      <ElSelect
        v-model="priority"
        aria-label="筛选任务优先级"
        placeholder="优先级"
      >
        <ElOption label="全部优先级" value="all" />
        <ElOption
          v-for="item in taskPriorities"
          :key="item"
          :label="item"
          :value="item"
        />
      </ElSelect>
      <TaskExecutionExportButton v-if="canExport" :priority="priority" />
      <ElButton
        :loading="loading"
        aria-label="刷新任务"
        @click="emit('refresh')"
      >
        <template #icon><RefreshCw :size="15" /></template>
        刷新
      </ElButton>
    </div>
  </header>
</template>
