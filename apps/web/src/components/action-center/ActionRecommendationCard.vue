<script setup lang="ts">
import { computed } from "vue";
import { CalendarClock, UserRound } from "@lucide/vue";
import { ElAlert, ElDescriptions, ElDescriptionsItem, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import { buildActionRecommendationSummary } from "../../utils/actionCenterRecommendation";

const props = defineProps<{
  event: InsightEvent;
  currentDate: string;
}>();

const summary = computed(() => buildActionRecommendationSummary(props.event, props.currentDate));
</script>

<template>
  <section class="drawer-section recommendation-section">
    <ElAlert
      :type="summary.alertType"
      :closable="false"
      show-icon
      title="Recommended action"
      :description="summary.suggestedAction"
    />

    <ElDescriptions :column="1" size="small" border>
      <ElDescriptionsItem label="Status">
        <ElTag effect="light" round>{{ summary.statusLabel }}</ElTag>
      </ElDescriptionsItem>
      <ElDescriptionsItem label="Owner">
        <span class="recommendation-meta">
          <UserRound :size="13" />
          {{ summary.ownerLabel }}
        </span>
      </ElDescriptionsItem>
      <ElDescriptionsItem label="Review">
        <span class="recommendation-meta">
          <CalendarClock :size="13" />
          {{ summary.reviewDueLabel }}
        </span>
      </ElDescriptionsItem>
    </ElDescriptions>
  </section>
</template>

<style scoped>
.recommendation-section {
  display: grid;
  gap: 10px;
}

.recommendation-section :deep(.el-alert) {
  border-radius: 8px;
}

.recommendation-section :deep(.el-alert__description) {
  line-height: 1.55;
}

.recommendation-section :deep(.el-descriptions__body) {
  border-radius: 8px;
}

.recommendation-meta {
  align-items: center;
  color: #475569;
  display: inline-flex;
  gap: 6px;
}
</style>
