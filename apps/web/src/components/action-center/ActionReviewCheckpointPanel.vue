<script setup lang="ts">
import { computed } from "vue";
import { GitBranch } from "@lucide/vue";
import { ElStep, ElSteps, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import { buildReviewCheckpointSummary } from "../../utils/actionCenterReviewCheckpoint";

const props = defineProps<{
  event: InsightEvent;
  currentDate: string;
}>();

const summary = computed(() => buildReviewCheckpointSummary(props.event, props.currentDate));
</script>

<template>
  <section class="drawer-section review-checkpoint-section">
    <header>
      <div>
        <span>
          <GitBranch :size="15" />
          Review checkpoint
        </span>
        <h3>Action loop status</h3>
      </div>
      <ElTag :type="summary.tone" effect="light" round>{{ summary.label }}</ElTag>
    </header>

    <ElSteps
      :active="summary.activeIndex"
      direction="vertical"
      finish-status="success"
      process-status="process"
    >
      <ElStep
        v-for="step in summary.steps"
        :key="step.key"
        :title="step.title"
        :description="step.description"
        :status="step.status"
      />
    </ElSteps>
  </section>
</template>

<style scoped>
.review-checkpoint-section {
  display: grid;
  gap: 12px;
}

.review-checkpoint-section > header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.review-checkpoint-section > header span {
  align-items: center;
  color: #64748b;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  gap: 6px;
  text-transform: uppercase;
}

.review-checkpoint-section h3 {
  color: #0f172a;
  font-size: 15px;
  margin: 3px 0 0;
}

.review-checkpoint-section :deep(.el-steps) {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 12px 2px;
}

.review-checkpoint-section :deep(.el-step__title) {
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.review-checkpoint-section :deep(.el-step__description) {
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

@media (max-width: 560px) {
  .review-checkpoint-section > header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
