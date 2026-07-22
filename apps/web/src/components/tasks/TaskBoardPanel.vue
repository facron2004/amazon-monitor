<script setup lang="ts">
import { ElButton, ElTag } from "element-plus";
import {
  BookOpen,
  CalendarClock,
  FileText,
  ListTodo,
  UserRound,
} from "@lucide/vue";
import {
  taskStatusLabels,
  taskTypeLabels,
  type Task,
} from "@amazon-monitor/shared";
import {
  isTaskOverdue,
  taskPriorityTagTypes,
  taskStatusOrder,
  type TaskStatusGroups,
} from "../../utils/task-workspace.js";

defineProps<{
  groups: TaskStatusGroups;
  userNames: Map<number, string>;
  canWrite: boolean;
  canAssign: boolean;
}>();

const emit = defineEmits<{
  detail: [task: Task];
  claim: [task: Task];
  execute: [task: Task];
  complete: [task: Task];
  review: [task: Task];
  promote: [task: Task];
  notes: [task: Task];
  assign: [task: Task];
  cancel: [task: Task];
}>();

function canPromote(task: Task): boolean {
  return task.status === "reviewed" && task.promotedToSopId === null;
}
</script>

<template>
  <div class="task-board">
    <section
      v-for="status in taskStatusOrder"
      :key="status"
      :class="[
        'task-board-column',
        { 'is-empty': groups[status].length === 0 },
      ]"
    >
      <header class="task-board-column__header">
        <span>{{ taskStatusLabels[status] }}</span>
        <strong>{{ groups[status].length }}</strong>
      </header>

      <div v-if="groups[status].length" class="task-board-column__list">
        <article
          v-for="task in groups[status]"
          :key="task.id"
          class="task-card"
        >
          <header class="task-card__header">
            <div>
              <ElTag :type="taskPriorityTagTypes[task.priority]" size="small">
                {{ task.priority }}
              </ElTag>
              <ElTag type="info" effect="plain" size="small">
                {{ taskTypeLabels[task.taskType] ?? task.taskType }}
              </ElTag>
            </div>
            <span>#{{ task.id }}</span>
          </header>

          <button
            class="task-card__title"
            type="button"
            @click="emit('detail', task)"
          >
            {{ task.title }}
          </button>
          <p v-if="task.description" class="task-card__description">
            {{ task.description.slice(0, 96)
            }}{{ task.description.length > 96 ? "…" : "" }}
          </p>

          <div class="task-card__metadata">
            <span v-if="task.relatedAsin">ASIN {{ task.relatedAsin }}</span>
            <span v-if="task.relatedBrand">{{ task.relatedBrand }}</span>
            <span v-if="task.assigneeId">
              <UserRound :size="12" />
              {{ userNames.get(task.assigneeId) || `#${task.assigneeId}` }}
            </span>
            <span
              v-if="task.dueDate"
              :class="{ 'is-overdue': isTaskOverdue(task) }"
            >
              <CalendarClock :size="12" />
              {{ task.dueDate }}
            </span>
          </div>

          <div
            v-if="
              task.actionTaken || task.resultBeforeJson || task.resultAfterJson
            "
            class="task-card__evidence"
          >
            <span v-if="task.actionTaken">已登记执行</span>
            <span v-if="task.resultBeforeJson || task.resultAfterJson"
              >含结果指标</span
            >
          </div>

          <footer class="task-card__actions">
            <ElButton size="small" @click="emit('detail', task)">
              <template #icon><FileText :size="13" /></template>
              详情
            </ElButton>
            <ElButton
              v-if="task.status === 'pending'"
              size="small"
              type="primary"
              :disabled="!canWrite"
              @click="emit('claim', task)"
            >
              认领
            </ElButton>
            <ElButton
              v-if="task.status === 'in_progress'"
              size="small"
              type="primary"
              :disabled="!canWrite"
              @click="emit('execute', task)"
            >
              登记执行
            </ElButton>
            <ElButton
              v-if="task.status === 'awaiting_review'"
              size="small"
              type="success"
              :disabled="!canWrite"
              @click="emit('complete', task)"
            >
              确认完成
            </ElButton>
            <ElButton
              v-if="task.status === 'done'"
              size="small"
              type="primary"
              :disabled="!canWrite"
              @click="emit('review', task)"
            >
              复盘
            </ElButton>
            <ElButton
              v-if="canPromote(task)"
              size="small"
              type="success"
              plain
              :disabled="!canWrite"
              @click="emit('promote', task)"
            >
              <template #icon><BookOpen :size="13" /></template>
              沉淀 SOP
            </ElButton>
            <ElTag v-if="task.promotedToSopId" size="small" type="success">
              SOP #{{ task.promotedToSopId }}
            </ElTag>
            <ElButton size="small" text @click="emit('notes', task)"
              >备注</ElButton
            >
            <ElButton
              v-if="canAssign"
              size="small"
              text
              @click="emit('assign', task)"
            >
              分配
            </ElButton>
            <ElButton
              v-if="task.status === 'pending' || task.status === 'in_progress'"
              size="small"
              text
              type="danger"
              :disabled="!canWrite"
              @click="emit('cancel', task)"
            >
              取消
            </ElButton>
          </footer>
        </article>
      </div>

      <div v-else class="task-board-column__empty">
        <ListTodo :size="16" />
        <span>暂无任务</span>
      </div>
    </section>
  </div>
</template>
