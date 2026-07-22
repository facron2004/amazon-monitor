<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { RotateCcw, SlidersHorizontal } from "@lucide/vue";
import { useInsightEventsStore, type TopSummaryFilterKey } from "../stores/insightEvents";

const store = useInsightEventsStore();
const { topSummaryFilters, topSummaryFilterOptions, topSummaryLoading } = storeToRefs(store);

const activeFilterCount = computed(
  () => Object.values(topSummaryFilters.value).filter(Boolean).length
);

function updateFilter(key: TopSummaryFilterKey, event: Event): void {
  if (event.target instanceof HTMLSelectElement) {
    void store.setTopSummaryFilter(key, event.target.value);
  }
}

function includeSelected(values: string[], selected: string): string[] {
  return selected && !values.includes(selected) ? [selected, ...values] : values;
}
</script>

<template>
  <div class="top-actions-filters" aria-label="今日重点筛选">
    <div class="top-actions-filter-title">
      <SlidersHorizontal :size="15" />
      <span>聚焦范围</span>
      <strong v-if="activeFilterCount">{{ activeFilterCount }}</strong>
    </div>

    <label>
      <span>站点</span>
      <select
        :value="topSummaryFilters.marketplace"
        :disabled="topSummaryLoading"
        @change="updateFilter('marketplace', $event)"
      >
        <option value="">全部站点</option>
        <option
          v-for="value in includeSelected(topSummaryFilterOptions.marketplaces, topSummaryFilters.marketplace)"
          :key="value"
          :value="value"
        >{{ value }}</option>
      </select>
    </label>

    <label>
      <span>类目</span>
      <select
        :value="topSummaryFilters.categoryName"
        :disabled="topSummaryLoading"
        @change="updateFilter('categoryName', $event)"
      >
        <option value="">全部类目</option>
        <option
          v-for="value in includeSelected(topSummaryFilterOptions.categoryNames, topSummaryFilters.categoryName)"
          :key="value"
          :value="value"
        >{{ value }}</option>
      </select>
    </label>

    <label>
      <span>品牌</span>
      <select
        :value="topSummaryFilters.brand"
        :disabled="topSummaryLoading"
        @change="updateFilter('brand', $event)"
      >
        <option value="">全部品牌</option>
        <option
          v-for="value in includeSelected(topSummaryFilterOptions.brands, topSummaryFilters.brand)"
          :key="value"
          :value="value"
        >{{ value }}</option>
      </select>
    </label>

    <label>
      <span>负责人</span>
      <select
        :value="topSummaryFilters.assignee"
        :disabled="topSummaryLoading"
        @change="updateFilter('assignee', $event)"
      >
        <option value="">全部负责人</option>
        <option
          v-for="value in includeSelected(topSummaryFilterOptions.assignees, topSummaryFilters.assignee)"
          :key="value"
          :value="value"
        >{{ value }}</option>
      </select>
    </label>

    <button
      class="top-actions-filter-reset"
      type="button"
      title="清除筛选"
      aria-label="清除筛选"
      :disabled="topSummaryLoading || activeFilterCount === 0"
      @click="store.clearTopSummaryFilters()"
    >
      <RotateCcw :size="15" />
    </button>
  </div>
</template>

<style scoped>
.top-actions-filters {
  align-items: end;
  background: #f5f5f7;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: grid;
  gap: 8px;
  grid-template-columns: auto repeat(4, minmax(112px, 1fr)) 32px;
  margin-inline: -16px;
  padding: 10px 16px;
}

.top-actions-filter-title {
  align-items: center;
  align-self: center;
  color: #515154;
  display: flex;
  font-size: 12px;
  font-weight: 650;
  gap: 6px;
  padding-right: 4px;
  white-space: nowrap;
}

.top-actions-filter-title strong {
  align-items: center;
  background: #0071e3;
  border-radius: 999px;
  color: #ffffff;
  display: inline-flex;
  font-size: 10px;
  height: 18px;
  justify-content: center;
  min-width: 18px;
  padding-inline: 5px;
}

label {
  display: grid;
  gap: 4px;
  min-width: 0;
}

label > span {
  color: #86868b;
  font-size: 10px;
  font-weight: 650;
}

select {
  appearance: none;
  background-color: #ffffff;
  background-image:
    linear-gradient(45deg, transparent 50%, #6e6e73 50%),
    linear-gradient(135deg, #6e6e73 50%, transparent 50%);
  background-position:
    calc(100% - 13px) 50%,
    calc(100% - 9px) 50%;
  background-repeat: no-repeat;
  background-size: 4px 4px, 4px 4px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 7px;
  color: #1d1d1f;
  font: inherit;
  font-size: 12px;
  height: 32px;
  min-width: 0;
  padding: 0 26px 0 9px;
  text-overflow: ellipsis;
}

select:focus {
  border-color: rgba(0, 113, 227, 0.6);
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
  outline: 0;
}

select:disabled {
  cursor: wait;
  opacity: 0.58;
}

.top-actions-filter-reset {
  align-items: center;
  align-self: end;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 7px;
  color: #515154;
  display: inline-flex;
  height: 32px;
  justify-content: center;
  padding: 0;
  width: 32px;
}

.top-actions-filter-reset:hover:not(:disabled) {
  border-color: rgba(0, 113, 227, 0.4);
  color: #0071e3;
}

.top-actions-filter-reset:disabled {
  opacity: 0.4;
}

@media (max-width: 760px) {
  .top-actions-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .top-actions-filter-title {
    grid-column: 1;
  }

  .top-actions-filter-reset {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }
}
</style>
