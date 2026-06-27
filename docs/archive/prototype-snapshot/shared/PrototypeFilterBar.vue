<script setup lang="ts">
// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
import { ref, watch } from "vue";
import { insightEventLevels, insightEventStatuses, insightEventStatusLabels, insightEventTypes, insightEventTypeLabels } from "@amazon-monitor/shared";
import type { InsightEventLevel, InsightEventStatus, InsightEventType } from "@amazon-monitor/shared";

type SortBy = "score" | "level" | "rankChange" | "reviewChange" | "createdAt";

interface Filters {
  level: InsightEventLevel | "";
  status: InsightEventStatus | "";
  eventType: InsightEventType | "";
  brand: string;
  asin: string;
  sortBy: SortBy;
  coreOnly: boolean;
  newBreakoutOnly: boolean;
  reviewDueOnly: boolean;
}

const props = defineProps<{
  initial: Filters;
}>();

const emit = defineEmits<{
  (event: "apply", filters: Filters): void;
  (event: "draft-change", filters: Filters): void;
}>();

const draft = ref<Filters>({ ...props.initial });

watch(() => props.initial, (next) => {
  draft.value = { ...next };
}, { deep: true });

function apply(): void {
  emit("apply", { ...draft.value });
}

watch(draft, (next) => {
  emit("draft-change", { ...next });
}, { deep: true });

const sortOptions: Array<{ value: SortBy; label: string }> = [
  { value: "score", label: "机会分" },
  { value: "level", label: "事件等级" },
  { value: "rankChange", label: "排名变化" },
  { value: "reviewChange", label: "Review 增量" },
  { value: "createdAt", label: "创建时间" }
];
</script>

<template>
  <div class="prototype-filter">
    <div class="prototype-filter-main">
      <select v-model="draft.level" aria-label="等级">
        <option value="">全部等级</option>
        <option v-for="level in insightEventLevels" :key="level" :value="level">{{ level }}</option>
      </select>
      <select v-model="draft.status" aria-label="状态">
        <option value="">全部状态</option>
        <option v-for="status in insightEventStatuses" :key="status" :value="status">{{ insightEventStatusLabels[status] }}</option>
      </select>
      <input v-model="draft.brand" type="search" placeholder="品牌" @keydown.enter="apply" />
      <input v-model="draft.asin" type="search" placeholder="ASIN" @keydown.enter="apply" />
      <button type="button" class="apply" @click="apply">筛选</button>
    </div>
    <details class="prototype-filter-advanced">
      <summary>高级</summary>
      <div class="prototype-filter-advanced-row">
        <select v-model="draft.eventType" aria-label="事件类型">
          <option value="">全部类型</option>
          <option v-for="type in insightEventTypes" :key="type" :value="type">{{ insightEventTypeLabels[type] }}</option>
        </select>
        <select v-model="draft.sortBy" aria-label="排序">
          <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <label class="toggle"><input v-model="draft.coreOnly" type="checkbox" />核心竞品</label>
        <label class="toggle"><input v-model="draft.newBreakoutOnly" type="checkbox" />新品黑马</label>
        <label class="toggle"><input v-model="draft.reviewDueOnly" type="checkbox" />待复盘</label>
        <button type="button" class="apply" @click="apply">应用</button>
      </div>
    </details>
  </div>
</template>

<style scoped>
.prototype-filter {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  display: grid;
  gap: 8px;
  padding: 10px 12px;
}

.prototype-filter-main,
.prototype-filter-advanced-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.prototype-filter-main select,
.prototype-filter-main input[type="search"],
.prototype-filter-advanced-row select {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font: inherit;
  padding: 6px 8px;
}

.prototype-filter-main select,
.prototype-filter-main input[type="search"] {
  flex: 1 1 120px;
  min-width: 100px;
}

.prototype-filter-advanced {
  border-top: 1px dashed var(--border-color);
  padding-top: 8px;
}

.prototype-filter-advanced > summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #475569);
  list-style: none;
  user-select: none;
}

.prototype-filter-advanced > summary::-webkit-details-marker {
  display: none;
}

.prototype-filter-advanced > summary::before {
  content: "▸ ";
  display: inline-block;
  margin-right: 4px;
  transition: transform 0.15s ease;
}

.prototype-filter-advanced[open] > summary::before {
  transform: rotate(90deg);
}

.toggle {
  align-items: center;
  color: var(--text-secondary, #475569);
  display: inline-flex;
  font-size: 12.5px;
  gap: 6px;
  white-space: nowrap;
}

.toggle input {
  accent-color: var(--color-primary, #2563eb);
  height: 14px;
  width: 14px;
}

button.apply {
  background: #0f172a;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  padding: 6px 12px;
}

button.apply:hover {
  background: #1e293b;
}
</style>
