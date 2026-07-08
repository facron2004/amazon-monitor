<script setup lang="ts">
import { computed } from "vue";
import { BadgePercent, DollarSign, MessageSquareText, TrendingUp } from "@lucide/vue";
import { ElProgress, ElTag } from "element-plus";
import type { InsightEvent } from "@amazon-monitor/shared";
import {
  buildActionImpactSnapshotRows,
  type ActionImpactSnapshotTone
} from "../../utils/actionCenterImpactSnapshot";

const props = defineProps<{
  event: InsightEvent;
}>();

const rows = computed(() => buildActionImpactSnapshotRows(props.event));
const headline = computed(() => (
  rows.value.some((row) => row.key === "promo")
    ? "BSR, price, review, and promo impact"
    : "BSR, price, and review impact"
));

function tagType(tone: ActionImpactSnapshotTone): ActionImpactSnapshotTone {
  return tone;
}
</script>

<template>
  <section class="drawer-section impact-snapshot-section">
    <header>
      <div>
        <span>Impact snapshot</span>
        <h3>{{ headline }}</h3>
      </div>
    </header>

    <div class="impact-grid">
      <article v-for="row in rows" :key="row.key" class="impact-card" :class="`tone-${row.tone}`">
        <div class="impact-card-head">
          <TrendingUp v-if="row.key === 'rank'" :size="15" />
          <DollarSign v-else-if="row.key === 'price'" :size="15" />
          <MessageSquareText v-else-if="row.key === 'review'" :size="15" />
          <BadgePercent v-else :size="15" />
          <ElTag :type="tagType(row.tone)" effect="light" round>{{ row.deltaLabel }}</ElTag>
        </div>

        <div class="impact-stat">
          <span>{{ row.label }}</span>
          <strong>{{ row.valueLabel }}</strong>
        </div>

        <div class="impact-path">
          <span>{{ row.beforeLabel }}</span>
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
.impact-snapshot-section {
  display: grid;
  gap: 12px;
}

.impact-snapshot-section > header span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.impact-snapshot-section h3 {
  color: #0f172a;
  font-size: 15px;
  margin: 3px 0 0;
}

.impact-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.impact-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
}

.impact-card-head {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
}

.impact-card-head svg {
  color: #64748b;
  flex: 0 0 auto;
}

.impact-stat span {
  color: #64748b;
  display: block;
  font-size: 12px;
  margin-bottom: 2px;
}

.impact-stat strong {
  color: #0f172a;
  display: block;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.impact-path {
  align-items: center;
  color: #64748b;
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 6px;
}

.impact-path strong {
  color: #0f172a;
}

.impact-card small {
  color: #64748b;
  line-height: 1.45;
}

.impact-card :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.impact-card.tone-danger :deep(.el-progress-bar__inner) {
  background-color: #dc2626;
}

.impact-card.tone-warning :deep(.el-progress-bar__inner) {
  background-color: #f97316;
}

.impact-card.tone-success :deep(.el-progress-bar__inner) {
  background-color: #16a34a;
}

.impact-card.tone-info :deep(.el-progress-bar__inner) {
  background-color: #64748b;
}

@media (max-width: 560px) {
  .impact-grid {
    grid-template-columns: 1fr;
  }
}
</style>
