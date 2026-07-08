<script setup lang="ts">
import { computed } from "vue";
import { DollarSign, MessageSquareText, TrendingUp } from "@lucide/vue";
import { ElProgress, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import { getActionEvidenceDeltaRows } from "../../utils/actionCenterEvidenceDeltas";

const props = defineProps<{
  event: InsightEvent;
}>();

const rows = computed(() => getActionEvidenceDeltaRows(props.event));
</script>

<template>
  <section class="evidence-delta-panel">
    <header>
      <div>
        <span>证据变化</span>
        <strong>排名、价格与 Review 变化</strong>
      </div>
    </header>

    <div class="evidence-delta-grid">
      <article v-for="row in rows" :key="row.key" class="evidence-delta-card">
        <div class="delta-card-head">
          <TrendingUp v-if="row.key === 'rank'" :size="15" />
          <DollarSign v-else-if="row.key === 'price'" :size="15" />
          <MessageSquareText v-else :size="15" />
          <span>{{ row.label }}</span>
          <ElTag :type="row.tone" effect="light" round>{{ row.deltaLabel }}</ElTag>
        </div>

        <div class="delta-path">
          <strong>{{ row.beforeLabel }}</strong>
          <span>-></span>
          <strong>{{ row.afterLabel }}</strong>
        </div>

        <ElProgress :percentage="row.progress" :show-text="false" />
        <small>{{ row.detail }}</small>
      </article>
    </div>
  </section>
</template>

<style scoped>
.evidence-delta-panel {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
}

.evidence-delta-panel > header span {
  color: #64748b;
  font-size: 12px;
}

.evidence-delta-panel > header strong {
  color: #0f172a;
  display: block;
  font-size: 15px;
  margin-top: 2px;
}

.evidence-delta-grid {
  display: grid;
  gap: 10px;
}

.evidence-delta-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 10px;
}

.delta-card-head {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.delta-card-head svg {
  color: #64748b;
}

.delta-card-head span {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.delta-path {
  align-items: center;
  color: #64748b;
  display: flex;
  gap: 8px;
}

.delta-path strong {
  color: #0f172a;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.evidence-delta-card small {
  color: #64748b;
  line-height: 1.45;
}

.evidence-delta-card :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}
</style>
