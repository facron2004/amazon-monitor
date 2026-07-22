<script setup lang="ts">
import { ref, watch } from "vue";
import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElSkeleton,
} from "element-plus";
import { CheckCircle2 } from "@lucide/vue";
import type { Task, TaskNote } from "@amazon-monitor/shared";
import { useTaskStore } from "../../stores/tasks.js";
import { toErrorMessage } from "../../utils/error-message.js";

const props = defineProps<{ task: Task | null; canWrite: boolean }>();
const emit = defineEmits<{ close: [] }>();
const store = useTaskStore();
const notes = ref<TaskNote[]>([]);
const body = ref("");
const loading = ref(false);
const saving = ref(false);

watch(
  () => props.task,
  (task) => {
    notes.value = [];
    body.value = "";
    if (task) void loadNotes(task.id);
  },
);

async function loadNotes(taskId: number): Promise<void> {
  loading.value = true;
  try {
    const result = await store.fetchNotes(taskId);
    if (props.task?.id === taskId) notes.value = result;
  } catch (errorValue) {
    ElMessage.error(toErrorMessage(errorValue));
  } finally {
    if (props.task?.id === taskId) loading.value = false;
  }
}

async function submit(): Promise<void> {
  const task = props.task;
  const note = body.value.trim();
  if (!task || !note || !props.canWrite) return;
  saving.value = true;
  try {
    notes.value = [...notes.value, await store.addNote(task.id, note)];
    body.value = "";
    ElMessage.success("已添加备注");
  } catch (errorValue) {
    ElMessage.error(toErrorMessage(errorValue));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ElDialog
    :model-value="task !== null"
    :title="task ? `任务备注｜${task.title}` : '任务备注'"
    width="min(520px, calc(100vw - 24px))"
    @close="emit('close')"
  >
    <ElSkeleton v-if="loading" :rows="3" animated />
    <div v-else-if="notes.length" class="task-notes-list">
      <div v-for="note in notes" :key="note.id" class="task-note">
        <CheckCircle2 :size="13" />
        <span>{{ note.body }}</span>
        <time>{{ note.createdAt.slice(0, 16).replace("T", " ") }}</time>
      </div>
    </div>
    <p v-else class="task-dialog-empty">暂无备注</p>
    <ElInput
      v-model="body"
      type="textarea"
      :rows="3"
      placeholder="补充进展、阻塞或协作信息"
      :disabled="!canWrite"
    />
    <template #footer>
      <ElButton @click="emit('close')">关闭</ElButton>
      <ElButton
        type="primary"
        :loading="saving"
        :disabled="!canWrite || !body.trim()"
        @click="submit"
      >
        添加备注
      </ElButton>
    </template>
  </ElDialog>
</template>
