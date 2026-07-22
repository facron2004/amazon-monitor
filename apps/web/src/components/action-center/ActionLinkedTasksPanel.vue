<script setup lang="ts">
import { ClipboardList } from "@lucide/vue";
import { ElEmpty, ElSkeleton, ElTag } from "element-plus";
import {
  taskPriorityLabels,
  taskStatusLabels,
  taskTypeLabels,
  type Task
} from "@amazon-monitor/shared";

defineProps<{
  tasks: Task[];
  loading: boolean;
  error: string;
}>();

function formatDate(value: string | null): string {
  return value ? value.slice(5) : "未设置";
}
</script>

<template>
  <section class="linked-tasks">
    <div class="linked-tasks__head">
      <div>
        <span>Tasks</span>
        <h3>关联任务</h3>
      </div>
      <ElTag effect="plain" round>{{ tasks.length }} 个</ElTag>
    </div>

    <ElSkeleton v-if="loading" animated :rows="2" />
    <p v-else-if="error" class="linked-tasks__error">{{ error }}</p>
    <div v-else-if="tasks.length" class="linked-task-list">
      <article v-for="task in tasks" :key="task.id" class="linked-task">
        <ClipboardList :size="16" />
        <div>
          <div class="linked-task__title">
            <strong>#{{ task.id }} {{ task.title }}</strong>
            <ElTag size="small" effect="light" round>{{ taskStatusLabels[task.status] }}</ElTag>
          </div>
          <p>{{ taskTypeLabels[task.taskType] }} · {{ taskPriorityLabels[task.priority] }} · 截止 {{ formatDate(task.dueDate) }}</p>
        </div>
      </article>
    </div>
    <ElEmpty v-else description="暂无关联任务" :image-size="72" />
  </section>
</template>

<style scoped>
.linked-tasks {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
}

.linked-tasks__head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.linked-tasks__head span {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.linked-tasks__head h3 {
  color: #0f172a;
  font-size: 15px;
  margin: 3px 0 0;
}

.linked-tasks__error {
  color: #b42318;
  font-size: 13px;
  margin: 0;
}

.linked-task-list {
  display: grid;
  gap: 8px;
}

.linked-task {
  align-items: start;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 10px;
}

.linked-task svg {
  color: #2563eb;
  margin-top: 2px;
}

.linked-task__title {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.linked-task strong {
  color: #0f172a;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.linked-task p {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  margin: 5px 0 0;
}
</style>
