<script setup lang="ts">
import { computed } from "vue";
import { FilterX, SlidersHorizontal } from "@lucide/vue";
import { ElButton, ElTag } from "element-plus";
import type { InsightEventFilters } from "../../stores/insightEvents";
import {
  clearActionFilter,
  clearActionFilters,
  getActionFilterBadges,
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
    <div class="filter-summary-main">
      <SlidersHorizontal :size="15" />
      <div>
        <strong>{{ visibleCount }} events / {{ asinCaseCount }} ASIN cases</strong>
        <small>{{ badges.length ? `${badges.length} active filters` : "Global action view" }}</small>
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
  align-items: center;
  background: #f8fafc;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 10px 12px;
}

.filter-summary-main {
  align-items: center;
  display: flex;
  gap: 9px;
  min-width: 0;
}

.filter-summary-main svg {
  color: #2563eb;
  flex: 0 0 auto;
}

.filter-summary-main strong {
  color: #0f172a;
  display: block;
  font-size: 13px;
}

.filter-summary-main small {
  color: #64748b;
  display: block;
  font-size: 12px;
  margin-top: 2px;
}

.filter-chip-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.filter-chip-row :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 5px;
}

@media (max-width: 900px) {
  .filter-summary {
    grid-template-columns: 1fr;
  }

  .filter-chip-row {
    justify-content: flex-start;
  }
}
</style>
