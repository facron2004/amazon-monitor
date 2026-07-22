<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElButton, ElDialog, ElInput, ElOption, ElSelect } from "element-plus";
import type { Task } from "@amazon-monitor/shared";

const props = defineProps<{
  task: Task | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [result: NonNullable<Task["reviewResult"]>, note: string | undefined];
}>();

const reviewResult = ref<NonNullable<Task["reviewResult"]>>("CONFIRMED");
const reviewNote = ref("");

const visible = computed({
  get: () => props.task !== null,
  set: (value: boolean) => {
    if (!value) emit("close");
  }
});

watch(() => props.task, () => {
  reviewResult.value = "CONFIRMED";
  reviewNote.value = "";
});

function submit(): void {
  emit("submit", reviewResult.value, reviewNote.value.trim() || undefined);
}
</script>

<template>
  <ElDialog v-model="visible" :title="task ? `复盘任务｜${task.title}` : '复盘任务'" width="480px" destroy-on-close>
    <div v-if="task" class="review-evidence">
      <strong>执行记录</strong>
      <p>{{ task.actionTaken }}</p>
      <small v-if="task.resultBeforeJson || task.resultAfterJson">已附执行前后指标，可在沉淀 SOP 时一并保留。</small>
    </div>
    <ElSelect v-model="reviewResult" placeholder="复盘结果" style="width: 100%">
      <ElOption label="判断成立" value="CONFIRMED" />
      <ElOption label="短期冲榜后回落" value="REVERTED" />
      <ElOption label="仍在持续" value="CONTINUING" />
      <ElOption label="机会消失" value="FAILED" />
      <ElOption label="数据不足" value="UNCLEAR" />
    </ElSelect>
    <ElInput v-model="reviewNote" type="textarea" :rows="3" placeholder="复盘备注（可选）" style="margin-top: 12px" />
    <template #footer>
      <ElButton :disabled="saving" @click="emit('close')">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">提交复盘</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.review-evidence { border: 1px solid #e4e7ed; border-radius: 6px; color: #606266; margin-bottom: 12px; padding: 10px 12px; }
.review-evidence strong { color: #303133; font-size: 12px; }
.review-evidence p { line-height: 1.55; margin: 6px 0; white-space: pre-wrap; }
.review-evidence small { color: #909399; }
</style>
