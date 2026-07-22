<script setup lang="ts">
import { BrainCircuit, RefreshCw, Sparkles } from "@lucide/vue";
import { ElAlert, ElButton, ElCard, ElScrollbar, ElSegmented } from "element-plus";

defineProps<{
  modelValue: string;
  options: Array<{ value: string; label: string }>;
  markdown: string;
  showAiStatus: boolean;
  aiStatus: {
    type: "success" | "error" | "info";
    title: string;
  };
  reportWriterLoading: boolean;
  reportWriterDisabled: boolean;
  aiDisabled: boolean;
  hasAiSummary: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  requestReportWriter: [];
  requestAiSummary: [];
}>();
</script>

<template>
  <ElCard shadow="never" class="report-card report-reader-card">
    <template #header>
      <div class="report-toolbar">
        <ElSegmented
          :model-value="modelValue"
          :options="options"
          @update:model-value="emit('update:modelValue', String($event))"
        />
        <ElButton
          :loading="reportWriterLoading"
          :disabled="reportWriterDisabled"
          @click="emit('requestReportWriter')"
        >
          <Sparkles :size="15" />
          <span>Report Writer</span>
        </ElButton>
        <ElButton type="primary" :disabled="aiDisabled" @click="emit('requestAiSummary')">
          <RefreshCw :size="15" />
          <span>{{ hasAiSummary ? "刷新 AI" : "生成 AI" }}</span>
        </ElButton>
      </div>
    </template>

    <ElAlert
      v-if="showAiStatus"
      :title="aiStatus.title"
      :type="aiStatus.type"
      :closable="false"
      show-icon
      class="ai-status"
    >
      <template #icon><BrainCircuit :size="16" /></template>
    </ElAlert>

    <ElScrollbar class="report-scroll">
      <pre class="report">{{ markdown }}</pre>
    </ElScrollbar>
  </ElCard>
</template>

<style scoped>
.report-reader-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.report-reader-card :deep(.el-card__body) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.report-toolbar {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.report-toolbar :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.ai-status {
  margin-bottom: 10px;
}

.report-scroll {
  flex: 1 1 auto;
  min-height: 420px;
}

pre.report {
  background: #f8fafc;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  color: #253043;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.7;
  margin: 0;
  min-height: 420px;
  overflow-wrap: anywhere;
  padding: 20px;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .report-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .report-toolbar :deep(.el-segmented) {
    overflow-x: auto;
    width: 100%;
  }
}
</style>
