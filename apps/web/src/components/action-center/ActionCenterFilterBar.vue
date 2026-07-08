<script setup lang="ts">
import { Filter, SlidersHorizontal } from "@lucide/vue";
import { ElButton, ElCheckbox, ElInput, ElOption, ElSelect } from "element-plus";
import {
  insightEventLevels,
  insightEventStatuses,
  insightEventStatusLabels,
  insightEventTypes,
  insightEventTypeLabels,
  insightReviewResultLabels,
  insightReviewResults,
  attributionTagLabels,
  attributionTags,
  strategyTagLabels,
  strategyTags
} from "@amazon-monitor/shared";
import type { InsightEventFilters } from "../../stores/insightEvents";
import { actionEvidenceMovementFilterOptions } from "../../utils/actionCenterEvidenceDeltas";
import { reviewCadenceBucketOptions } from "../../utils/actionCenterReviewCadence";
import { actionScoreDriverOptions } from "../../utils/actionCenterScoreBreakdown";
import { actionSignalFlowStageOptions } from "../../utils/actionCenterSignalFlow";

const props = defineProps<{
  filters: InsightEventFilters;
  loading: boolean;
}>();

const sortOptions: Array<{ value: InsightEventFilters["sortBy"]; label: string }> = [
  { value: "score", label: "机会分" },
  { value: "level", label: "事件等级" },
  { value: "rankChange", label: "排名变化" },
  { value: "reviewChange", label: "Review 增量" },
  { value: "createdAt", label: "创建时间" }
];

const emit = defineEmits<{
  (event: "update:filters", value: InsightEventFilters): void;
  (event: "apply"): void;
}>();

function updateFilter<K extends keyof InsightEventFilters>(key: K, value: InsightEventFilters[K]): void {
  emit("update:filters", { ...props.filters, [key]: value });
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function checkedValue(value: unknown): boolean {
  return value === true;
}
</script>

<template>
  <div class="action-filter-bar">
    <div class="filter-bar-icon">
      <SlidersHorizontal :size="16" />
    </div>

    <div class="filter-control-grid">
      <ElSelect
        :model-value="filters.level"
        placeholder="全部等级"
        clearable
        @update:model-value="updateFilter('level', stringValue($event) as InsightEventFilters['level'])"
      >
        <ElOption v-for="level in insightEventLevels" :key="level" :label="level" :value="level" />
      </ElSelect>
      <ElSelect
        :model-value="filters.status"
        placeholder="全部状态"
        clearable
        @update:model-value="updateFilter('status', stringValue($event) as InsightEventFilters['status'])"
      >
        <ElOption v-for="status in insightEventStatuses" :key="status" :label="insightEventStatusLabels[status]" :value="status" />
      </ElSelect>
      <ElSelect
        :model-value="filters.eventType"
        placeholder="全部类型"
        clearable
        @update:model-value="updateFilter('eventType', stringValue($event) as InsightEventFilters['eventType'])"
      >
        <ElOption v-for="type in insightEventTypes" :key="type" :label="insightEventTypeLabels[type]" :value="type" />
      </ElSelect>
      <ElSelect
        :model-value="filters.reviewResult"
        placeholder="复盘结果"
        clearable
        @update:model-value="updateFilter('reviewResult', stringValue($event) as InsightEventFilters['reviewResult'])"
      >
        <ElOption v-for="result in insightReviewResults" :key="result" :label="insightReviewResultLabels[result]" :value="result" />
      </ElSelect>
      <ElSelect
        :model-value="filters.strategyTag"
        placeholder="策略标签"
        clearable
        @update:model-value="updateFilter('strategyTag', stringValue($event) as InsightEventFilters['strategyTag'])"
      >
        <ElOption v-for="tag in strategyTags" :key="tag" :label="strategyTagLabels[tag]" :value="tag" />
      </ElSelect>
      <ElSelect
        :model-value="filters.attributionTag"
        placeholder="归因驱动"
        clearable
        @update:model-value="updateFilter('attributionTag', stringValue($event) as InsightEventFilters['attributionTag'])"
      >
        <ElOption v-for="tag in attributionTags" :key="tag" :label="attributionTagLabels[tag]" :value="tag" />
      </ElSelect>
      <ElSelect
        :model-value="filters.evidenceMovement"
        placeholder="证据变化"
        clearable
        @update:model-value="updateFilter('evidenceMovement', stringValue($event) as InsightEventFilters['evidenceMovement'])"
      >
        <ElOption v-for="option in actionEvidenceMovementFilterOptions" :key="option.value" :label="option.label" :value="option.value" />
      </ElSelect>
      <ElSelect
        :model-value="filters.reviewCadence"
        placeholder="复盘窗口"
        clearable
        @update:model-value="updateFilter('reviewCadence', stringValue($event) as InsightEventFilters['reviewCadence'])"
      >
        <ElOption v-for="option in reviewCadenceBucketOptions" :key="option.value" :label="option.label" :value="option.value" />
      </ElSelect>
      <ElSelect
        :model-value="filters.actionStage"
        placeholder="行动阶段"
        clearable
        @update:model-value="updateFilter('actionStage', stringValue($event) as InsightEventFilters['actionStage'])"
      >
        <ElOption v-for="option in actionSignalFlowStageOptions" :key="option.value" :label="option.label" :value="option.value" />
      </ElSelect>
      <ElSelect
        :model-value="filters.scoreDriver"
        placeholder="评分驱动"
        clearable
        @update:model-value="updateFilter('scoreDriver', stringValue($event) as InsightEventFilters['scoreDriver'])"
      >
        <ElOption v-for="option in actionScoreDriverOptions" :key="option.value" :label="option.label" :value="option.value" />
      </ElSelect>
      <ElSelect
        :model-value="filters.sortBy"
        placeholder="排序"
        @update:model-value="updateFilter('sortBy', stringValue($event) as InsightEventFilters['sortBy'])"
      >
        <ElOption v-for="option in sortOptions" :key="option.value" :label="option.label" :value="option.value" />
      </ElSelect>

      <ElInput
        :model-value="filters.brand"
        placeholder="品牌"
        clearable
        @update:model-value="updateFilter('brand', stringValue($event))"
        @keyup.enter="emit('apply')"
      />
      <ElInput
        :model-value="filters.asin"
        placeholder="ASIN"
        clearable
        @update:model-value="updateFilter('asin', stringValue($event))"
        @keyup.enter="emit('apply')"
      />
      <ElInput
        :model-value="filters.assignee"
        placeholder="负责人"
        clearable
        :disabled="filters.unassignedOnly"
        @update:model-value="updateFilter('assignee', stringValue($event))"
        @keyup.enter="emit('apply')"
      />

      <div class="filter-toggle-row">
        <ElCheckbox :model-value="filters.unassignedOnly" @update:model-value="updateFilter('unassignedOnly', checkedValue($event))">
          未分配
        </ElCheckbox>
        <ElCheckbox :model-value="filters.coreOnly" @update:model-value="updateFilter('coreOnly', checkedValue($event))">
          核心竞品
        </ElCheckbox>
        <ElCheckbox :model-value="filters.newBreakoutOnly" @update:model-value="updateFilter('newBreakoutOnly', checkedValue($event))">
          新品黑马
        </ElCheckbox>
        <ElCheckbox :model-value="filters.reviewDueOnly" @update:model-value="updateFilter('reviewDueOnly', checkedValue($event))">
          待复盘
        </ElCheckbox>
      </div>
    </div>

    <ElButton class="filter-apply" type="primary" :loading="loading" @click="emit('apply')">
      <Filter :size="15" />
      <span>筛选</span>
    </ElButton>
  </div>
</template>

<style scoped>
.action-filter-bar {
  align-items: flex-start;
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 12px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 12px;
}

.filter-bar-icon {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #64748b;
  display: inline-flex;
  height: 40px;
  justify-content: center;
  width: 40px;
}

.filter-control-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(128px, 1fr));
  min-width: 0;
}

.filter-control-grid :deep(.el-input__wrapper),
.filter-control-grid :deep(.el-select__wrapper) {
  border-radius: 8px;
  min-height: 40px;
  box-shadow: 0 0 0 1px #cbd5e1 inset;
}

.filter-toggle-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  grid-column: 1 / -1;
  min-height: 40px;
}

.filter-toggle-row :deep(.el-checkbox) {
  height: 24px;
  margin-right: 0;
  white-space: nowrap;
}

.filter-apply {
  border-radius: 8px;
  min-height: 40px;
  padding: 0 14px;
}

.filter-apply span {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

@media (max-width: 1180px) {
  .action-filter-bar {
    grid-template-columns: 1fr;
  }

  .filter-bar-icon {
    display: none;
  }

  .filter-control-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-toggle-row {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .filter-control-grid {
    grid-template-columns: 1fr;
  }

  .filter-apply {
    width: 100%;
  }
}
</style>
