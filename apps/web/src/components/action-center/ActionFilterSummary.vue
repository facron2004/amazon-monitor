<script setup lang="ts">
import { computed } from "vue";
import { FilterX, SlidersHorizontal } from "@lucide/vue";
import { ElButton, ElProgress, ElStatistic, ElTag } from "element-plus";
import type { InsightEventFilters } from "../../stores/insightEvents";
import {
  clearActionFilter,
  clearActionFilters,
  getActionFilterBadges,
  getActionFilterSummaryStats,
  type ActionFilterKey
} from "../../utils/actionCenterFilterSummary";

const props = defineProps<{
  filters: InsightEventFilters;
  visibleCount: number;
  asinCaseCount: number;
}>();

const emit = defineEmits<{
  (event: "update:filters", value: InsightEventFilters): void;
  (event: "apply", value: InsightEventFilters): void;
}>();

const badges = computed(() => getActionFilterBadges(props.filters));
const summary = computed(() => getActionFilterSummaryStats(
  props.filters,
  props.visibleCount,
  props.asinCaseCount
));

function clearBadge(key: ActionFilterKey): void {
  const nextFilters = clearActionFilter(props.filters, key);
  emit("update:filters", nextFilters);
  emit("apply", nextFilters);
}

function clearAll(): void {
  const nextFilters = clearActionFilters(props.filters);
  emit("update:filters", nextFilters);
  emit("apply", nextFilters);
}
</script>

<template>
  <section class="filter-summary">
    <div class="filter-summary-title">
      <SlidersHorizontal :size="16" />
      <div>
        <strong>Action scope</strong>
        <ElTag :type="summary.scopeTone" effect="light" round>{{ summary.scopeLabel }}</ElTag>
      </div>
    </div>

    <div class="filter-summary-metrics">
      <ElStatistic title="Visible events" :value="summary.visibleCount" />
      <ElStatistic title="ASIN cases" :value="summary.asinCaseCount" />
      <div class="filter-depth">
        <span>Active filters</span>
        <strong>{{ summary.activeFilterCount }}</strong>
        <ElProgress :percentage="summary.filterDepthPercent" :show-text="false" />
      </div>
      <div class="filter-depth">
        <span>Events / case</span>
        <strong>{{ summary.eventsPerCase }}</strong>
        <small>{{ summary.asinCaseCount ? "Grouped pressure" : "No matching cases" }}</small>
      </div>
    </div>

    <div v-if="badges.length" class="filter-chip-row">
      <ElTag
        v-for="badge in badges"
        :key="badge.key"
        closable
        effect="light"
        round
        @close="clearBadge(badge.key)"
      >
        {{ badge.label }}: {{ badge.value }}
      </ElTag>
      <ElButton link type="primary" @click="clearAll">
        <FilterX :size="14" />
        <span>Clear all</span>
      </ElButton>
    </div>
  </section>
</template>

<style scoped>
.filter-summary {
  background: #f8fafc;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  padding: 12px;
}

.filter-summary-title {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.filter-summary-title svg {
  color: #2563eb;
  flex: 0 0 auto;
}

.filter-summary-title strong {
  color: #0f172a;
  display: block;
  font-size: 13px;
}

.filter-summary-title > div {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-summary-metrics {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.filter-summary-metrics :deep(.el-statistic) {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  padding: 9px 10px;
}

.filter-summary-metrics :deep(.el-statistic__head) {
  color: #64748b;
  font-size: 12px;
  margin-bottom: 2px;
}

.filter-summary-metrics :deep(.el-statistic__content) {
  color: #0f172a;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
}

.filter-depth {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 9px 10px;
}

.filter-depth span,
.filter-depth small {
  color: #64748b;
  font-size: 12px;
}

.filter-depth strong {
  color: #0f172a;
  font-size: 20px;
  line-height: 1.2;
}

.filter-depth :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
}

.filter-chip-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.filter-chip-row :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 5px;
}

@media (max-width: 900px) {
  .filter-summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .filter-summary-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
