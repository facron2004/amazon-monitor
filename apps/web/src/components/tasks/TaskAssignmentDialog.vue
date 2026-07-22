<script setup lang="ts">
import { ref, watch } from "vue";
import { ElButton, ElDialog, ElOption, ElSelect } from "element-plus";
import type { Task, User } from "@amazon-monitor/shared";

const props = defineProps<{
  task: Task | null;
  users: User[];
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [assigneeId: number | null];
}>();

const assigneeId = ref<number | null>(null);

watch(() => props.task, (task) => {
  assigneeId.value = task?.assigneeId ?? null;
}, { immediate: true });
</script>

<template>
  <ElDialog
    :model-value="task !== null"
    title="分配任务"
    width="420px"
    @close="emit('close')"
  >
    <ElSelect v-model="assigneeId" clearable placeholder="选择负责人" style="width: 100%">
      <ElOption
        v-for="user in users"
        :key="user.id"
        :label="user.displayName || user.username"
        :value="user.id"
      />
    </ElSelect>
    <template #footer>
      <ElButton @click="emit('close')">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="emit('submit', assigneeId)">保存</ElButton>
    </template>
  </ElDialog>
</template>
