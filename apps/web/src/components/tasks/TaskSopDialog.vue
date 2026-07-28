<script setup lang="ts">
import { ref, watch } from "vue";
import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
} from "element-plus";
import {
  sopCategories,
  sopCategoryLabels,
  taskTypeSopCategory,
  type Sop,
  type Task,
} from "@amazon-monitor/shared";
import { useSopStore } from "../../stores/sops.js";
import { useTaskStore } from "../../stores/tasks.js";
import { toErrorMessage } from "../../utils/error-message.js";
import { buildTaskSopDraft } from "../../utils/task-sop-draft.js";

const props = defineProps<{ task: Task | null; canWrite: boolean }>();
const emit = defineEmits<{ close: [] }>();
const sopStore = useSopStore();
const taskStore = useTaskStore();
const title = ref("");
const category = ref<Sop["category"]>("general");
const body = ref("");
const tags = ref("");
const saving = ref(false);

watch(
  () => props.task,
  (task) => {
    if (!task) return;
    title.value = `SOP｜${task.title}`;
    category.value = taskTypeSopCategory[task.taskType];
    tags.value = [
      task.taskType,
      task.relatedAsin,
      task.relatedBrand,
      task.relatedKeyword,
    ]
      .filter((tag): tag is string => Boolean(tag))
      .join(", ");
    body.value = buildTaskSopDraft(task);
  },
);

async function submit(): Promise<void> {
  const task = props.task;
  if (!task || !props.canWrite || !title.value.trim() || !body.value.trim()) {
    ElMessage.warning("请填写 SOP 标题和正文");
    return;
  }
  saving.value = true;
  try {
    const sop = await sopStore.createSop({
      title: title.value.trim(),
      category: category.value,
      bodyMd: body.value.trim(),
      sourceTaskId: task.id,
      tags: tags.value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    await taskStore.fetchTasks();
    emit("close");
    ElMessage.success(`已沉淀为 SOP #${sop.id}`);
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
    title="沉淀为 SOP"
    width="min(680px, calc(100vw - 24px))"
    @close="emit('close')"
  >
    <div class="task-sop-form">
      <ElInput v-model="title" placeholder="SOP 标题" />
      <ElSelect v-model="category" placeholder="分类">
        <ElOption
          v-for="item in sopCategories"
          :key="item"
          :label="sopCategoryLabels[item]"
          :value="item"
        />
      </ElSelect>
      <ElInput v-model="tags" placeholder="标签（逗号分隔）" />
      <ElInput
        v-model="body"
        type="textarea"
        :rows="14"
        placeholder="SOP 正文（Markdown）"
      />
    </div>
    <template #footer>
      <ElButton @click="emit('close')">取消</ElButton>
      <ElButton
        type="primary"
        :loading="saving"
        :disabled="!canWrite"
        @click="submit"
      >
        创建草稿
      </ElButton>
    </template>
  </ElDialog>
</template>
