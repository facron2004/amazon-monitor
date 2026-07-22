<script setup lang="ts">
import { ref } from "vue";
import { ElButton, ElMessage } from "element-plus";
import { ClipboardPlus } from "@lucide/vue";
import type { AiAgentOutput, AiAgentType, AiRecommendedAction } from "@amazon-monitor/shared";
import { useTaskStore } from "../stores/tasks";
import { useWriteAccess } from "../composables/useWriteAccess";
import { buildAgentActionTask } from "../utils/agent-action-task";

const props = defineProps<{
  runId: number;
  agentType: AiAgentType;
  output: AiAgentOutput;
  action: AiRecommendedAction;
  relatedAsin?: string | null;
  relatedKeyword?: string | null;
  relatedBrand?: string | null;
}>();

const emit = defineEmits<{ created: [taskId: number] }>();
const tasks = useTaskStore();
const { canWrite } = useWriteAccess("manage_workflow");
const creating = ref(false);

async function createTask(): Promise<void> {
  creating.value = true;
  try {
    const task = await tasks.createTask(buildAgentActionTask(props));
    emit("created", task.id);
    ElMessage.success(`任务 #${task.id} 已创建`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <ElButton v-if="canWrite" size="small" :loading="creating" @click="createTask">
    <template #icon><ClipboardPlus :size="13" /></template>
    转任务
  </ElButton>
</template>
