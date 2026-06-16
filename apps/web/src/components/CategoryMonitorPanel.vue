<script setup lang="ts">
import { storeToRefs } from "pinia";
import type { CategoryMonitor } from "@amazon-monitor/shared";
import { useCategoryStore } from "../stores/category";
import CategoryMonitorOverview from "./CategoryMonitorOverview.vue";
import CategoryMonitorTable from "./CategoryMonitorTable.vue";

interface Props {
  collecting: boolean;
  categoryDataIsFallback: boolean;
}

interface Emits {
  (e: "run-category-collection", categoryId?: number): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useCategoryStore();
const { categories, selectedCategoryId, categoryDataDate, categoryForm } = storeToRefs(store);
</script>

<template>
  <section class="panel dense-panel category-monitor-panel">
    <CategoryMonitorOverview
      :categories="categories"
      :selected-category-id="selectedCategoryId"
      :category-data-date="categoryDataDate"
      :category-data-is-fallback="categoryDataIsFallback"
      :category-form="categoryForm"
      :collecting="collecting"
      @run-category-collection="emit('run-category-collection', $event)"
      @create-category="store.createCategory(categoryDataDate)"
    />

    <CategoryMonitorTable
      :categories="categories"
      :selected-category-id="selectedCategoryId"
      :collecting="collecting"
      @update:selected-category-id="selectedCategoryId = $event"
      @run-category-collection="emit('run-category-collection', $event)"
      @toggle-category="store.toggleCategory($event, categoryDataDate)"
    />
  </section>
</template>
