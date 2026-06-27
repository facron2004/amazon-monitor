<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { Calendar, Play, Settings, X } from "@lucide/vue";
import type { CategoryMonitor } from "@amazon-monitor/shared";
import { useCategoryStore } from "../../stores/category";
import { categoryLabel, statusText } from "../../utils/formatters";

interface Props {
  date: string;
  collecting: boolean;
  selectedCategoryId: number | null;
  selectedCategoryName: string;
  categoryDataIsFallback: boolean;
}

interface Emits {
  (e: "update:selected-category-id", id: number): void;
  (e: "run-category-collection", categoryId?: number): void;
  (e: "toggle-category", category: CategoryMonitor): void;
  (e: "create-category"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useCategoryStore();
const { categories, categoryForm } = storeToRefs(store);

const managementOpen = ref(false);

const enabledCount = computed(() => categories.value.filter((item) => item.status === "enabled").length);
const collectedTodayCount = computed(() => categories.value.filter((item) => item.todayStatus === "success").length);
const attentionCount = computed(() =>
  categories.value.filter((item) => item.todayStatus === "failed" || item.todayStatus === "pending").length
);

function handleCategoryChange(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(value) && value > 0) {
    emit("update:selected-category-id", value);
  }
}

function handleCollect(): void {
  emit("run-category-collection", props.selectedCategoryId ?? undefined);
}

function handleCollectAll(): void {
  emit("run-category-collection");
}

function handleToggle(category: CategoryMonitor): void {
  emit("toggle-category", category);
}

function handleCloseManagement(): void {
  managementOpen.value = false;
}
</script>

<template>
  <header class="category-header">
    <div class="category-header-title">
      <h1>类目情报</h1>
      <span class="category-header-subtitle">
        <span :class="['category-data-pill', { 'is-fallback': categoryDataIsFallback }]">
          <Calendar :size="13" />
          {{ props.date }}
        </span>
        <span v-if="categoryDataIsFallback" class="category-header-hint">所选日期暂无快照，展示最近一次成功采集。</span>
      </span>
    </div>

    <div class="category-header-controls">
      <label class="category-header-select">
        <select :value="props.selectedCategoryId ?? ''" @change="handleCategoryChange">
          <option value="" disabled>请选择类目</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">
            {{ categoryLabel(category.name) }} · {{ category.marketplace }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="category-header-collect"
        :disabled="collecting || !props.selectedCategoryId"
        @click="handleCollect"
      >
        <Play :size="14" />
        <span>{{ collecting ? "采集中" : "采集" }}</span>
      </button>
      <button
        type="button"
        class="category-header-collect-all"
        :disabled="collecting || categories.length === 0"
        title="触发全部类目采集"
        @click="handleCollectAll"
      >
        全量采集
      </button>
      <button
        type="button"
        class="category-header-manage"
        :aria-pressed="managementOpen"
        title="管理类目"
        @click="managementOpen = true"
      >
        <Settings :size="14" />
        <span>管理</span>
      </button>
    </div>

    <Teleport to="body">
      <div v-if="managementOpen" class="category-manage-backdrop" @click="handleCloseManagement"></div>
      <section v-if="managementOpen" class="category-manage-modal" role="dialog" aria-label="管理监控类目">
        <header>
          <div>
            <strong>管理监控类目</strong>
            <small>添加新监控、启停现有监控</small>
          </div>
          <button type="button" class="icon-button" title="关闭" @click="handleCloseManagement">
            <X :size="16" />
          </button>
        </header>

        <div class="category-manage-summary">
          <article><span>启用</span><strong>{{ enabledCount }}</strong></article>
          <article><span>当日成功</span><strong>{{ collectedTodayCount }}</strong></article>
          <article><span>需关注</span><strong>{{ attentionCount }}</strong></article>
          <article><span>总数</span><strong>{{ categories.length }}</strong></article>
        </div>

        <form class="category-manage-form" @submit.prevent="emit('create-category'); $event.preventDefault()">
          <input v-model="categoryForm.name" placeholder="类目名称（如 Ice Makers）" required />
          <input v-model="categoryForm.marketplace" placeholder="amazon.com" required />
          <input v-model="categoryForm.categoryUrl" placeholder="Best Sellers 类目链接" required />
          <input v-model="categoryForm.categoryPath" placeholder="类目路径（可选）" />
          <input v-model.number="categoryForm.crawlTopN" type="number" min="1" max="500" placeholder="Top N" />
          <select v-model="categoryForm.status">
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
          <button type="submit" class="primary compact">新增监控</button>
        </form>

        <div class="category-manage-list">
          <table>
            <thead>
              <tr>
                <th>类目</th>
                <th>状态</th>
                <th>当日</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="category in categories" :key="category.id">
                <td>
                  <strong>{{ categoryLabel(category.name) }}</strong>
                  <small>{{ category.marketplace }} · Top {{ category.crawlTopN }}</small>
                </td>
                <td>{{ statusText(category.status) }}</td>
                <td>{{ statusText(category.todayStatus) }}</td>
                <td>
                  <button type="button" class="link" @click="handleToggle(category)">
                    {{ category.status === "enabled" ? "停用" : "启用" }}
                  </button>
                </td>
              </tr>
              <tr v-if="categories.length === 0">
                <td colspan="4" class="empty">暂无监控类目，先在下方表单添加。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </Teleport>
  </header>
</template>

<style scoped>
.category-header {
  align-items: center;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  padding: 14px 18px;
}

.category-header-title {
  align-items: center;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

.category-header-title h1 {
  font-size: 18px;
  margin: 0;
}

.category-header-subtitle {
  align-items: center;
  color: var(--text-muted, #64748b);
  display: inline-flex;
  flex-wrap: wrap;
  font-size: 12.5px;
  gap: 8px;
}

.category-data-pill {
  align-items: center;
  background: #f1f5f9;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  color: var(--text-secondary, #475569);
  display: inline-flex;
  font-weight: 600;
  gap: 4px;
  padding: 3px 10px;
}

.category-data-pill.is-fallback {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #92400e;
}

.category-header-hint {
  color: var(--text-muted, #64748b);
}

.category-header-controls {
  align-items: center;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-header-select select {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  min-width: 220px;
  padding: 7px 10px;
}

.category-header-collect,
.category-header-collect-all,
.category-header-manage {
  align-items: center;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary, #475569);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  gap: 5px;
  padding: 7px 12px;
}

.category-header-collect {
  background: var(--color-primary, #2563eb);
  border-color: var(--color-primary, #2563eb);
  color: #ffffff;
}

.category-header-collect:disabled,
.category-header-collect-all:disabled,
.category-header-manage:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.category-header-collect:hover:not(:disabled) {
  filter: brightness(0.95);
}

.category-header-collect-all:hover:not(:disabled),
.category-header-manage:hover:not(:disabled) {
  background: #f1f5f9;
}

.category-header-manage[aria-pressed="true"] {
  background: #e0f2fe;
  border-color: #38bdf8;
  color: #075985;
}

.category-manage-backdrop {
  background: rgba(15, 23, 42, 0.32);
  inset: 0;
  position: fixed;
  z-index: 50;
}

.category-manage-modal {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: -16px 0 40px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: calc(100vh - 64px);
  max-width: 720px;
  overflow-y: auto;
  padding: 22px;
  position: fixed;
  right: 24px;
  top: 32px;
  width: calc(100vw - 48px);
  z-index: 51;
}

.category-manage-modal header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.category-manage-modal header strong {
  display: block;
  font-size: 15px;
}

.category-manage-modal header small {
  color: var(--text-muted, #64748b);
  font-size: 12px;
}

.category-manage-summary {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.category-manage-summary article {
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 10px;
}

.category-manage-summary span {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11.5px;
}

.category-manage-summary strong {
  color: var(--text-primary, #0f172a);
  display: block;
  font-size: 16px;
  margin-top: 2px;
}

.category-manage-form {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.category-manage-form input,
.category-manage-form select {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font: inherit;
  font-size: 12.5px;
  padding: 6px 8px;
}

.category-manage-form button {
  grid-column: 1 / -1;
}

.category-manage-list {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.category-manage-list table {
  width: 100%;
}

.category-manage-list th,
.category-manage-list td {
  font-size: 12px;
  padding: 8px 10px;
  text-align: left;
}

.category-manage-list th {
  background: #f8fafc;
  color: var(--text-muted, #64748b);
  font-weight: 600;
}

.category-manage-list tbody tr + tr {
  border-top: 1px solid var(--border-color);
}

.category-manage-list td small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11px;
  margin-top: 2px;
}

.category-manage-list .empty {
  color: var(--text-muted, #64748b);
  text-align: center;
}

.category-manage-list .link {
  background: transparent;
  border: none;
  color: var(--color-primary, #2563eb);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 0;
}

.primary.compact {
  background: var(--color-primary, #2563eb);
  border: 1px solid var(--color-primary, #2563eb);
  border-radius: 8px;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
}

.primary.compact:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.icon-button {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  padding: 6px;
}

.icon-button:hover {
  background: #f1f5f9;
}

@media (max-width: 760px) {
  .category-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .category-header-controls {
    width: 100%;
  }
  .category-header-select select {
    min-width: 0;
    width: 100%;
  }
  .category-manage-form {
    grid-template-columns: 1fr;
  }
  .category-manage-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>