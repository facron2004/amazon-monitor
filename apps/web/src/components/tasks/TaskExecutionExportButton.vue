<script setup lang="ts">
import { ref } from "vue";
import { Download } from "@lucide/vue";
import { ElButton, ElMessage } from "element-plus";
import type { TaskPriority } from "@amazon-monitor/shared";
import { downloadTaskExecutionCsv } from "../../api-tasks.js";
import { toErrorMessage } from "../../utils/error-message.js";

const props = defineProps<{
  priority: TaskPriority | "all";
}>();

const downloading = ref(false);

async function download(): Promise<void> {
  downloading.value = true;
  try {
    await downloadTaskExecutionCsv(props.priority === "all" ? undefined : props.priority);
    ElMessage.success("执行清单已导出");
  } catch (error) {
    ElMessage.error(toErrorMessage(error));
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <ElButton
    :loading="downloading"
    title="导出已确认且进行中的任务"
    aria-label="导出执行清单"
    @click="download"
  >
    <template #icon><Download :size="14" /></template>
    导出执行清单
  </ElButton>
</template>
