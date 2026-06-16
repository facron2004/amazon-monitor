<script setup lang="ts">
import { Play, RefreshCw } from "@lucide/vue";
import type { CategoryMonitor } from "@amazon-monitor/shared";
import { categoryLabel, statusText } from "../utils/formatters";

interface Props {
  categories: CategoryMonitor[];
  selectedCategoryId: number | null;
  collecting: boolean;
}

interface Emits {
  (e: "update:selected-category-id", id: number): void;
  (e: "run-category-collection", categoryId?: number): void;
  (e: "toggle-category", category: CategoryMonitor): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="table-wrap compact-scroll category-list-scroll">
    <table>
      <thead>
        <tr>
          <th>类目</th>
          <th>站点</th>
          <th>范围</th>
          <th>监控状态</th>
          <th>当日采集</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="category in categories" :key="category.id" :class="{ selected: selectedCategoryId === category.id }">
          <td class="clickable-cell" @click="emit('update:selected-category-id', category.id)">
            <strong>{{ categoryLabel(category.name) }}</strong>
            <small>{{ category.categoryPath ? categoryLabel(category.categoryPath) : category.categoryUrl }}</small>
          </td>
          <td>{{ category.marketplace }}</td>
          <td>Top {{ category.crawlTopN }}</td>
          <td>{{ statusText(category.status) }}</td>
          <td>
            <span :class="['status-dot', category.todayStatus]">{{ statusText(category.todayStatus) }}</span>
          </td>
          <td class="row-actions">
            <button class="icon-button" :title="category.status === 'enabled' ? '停用监控' : '启用监控'" type="button" @click="emit('toggle-category', category)">
              <RefreshCw :size="16" />
            </button>
            <button class="icon-button" title="采集类目" type="button" :disabled="collecting" @click="emit('run-category-collection', category.id)">
              <Play :size="16" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
