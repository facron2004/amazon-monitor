<script setup lang="ts">
import { computed, ref } from "vue";
import { Play, RefreshCw, Search, Trash2, X } from "@lucide/vue";
import type { KeywordMonitor } from "@amazon-monitor/shared";
import type { KeywordMonitorForm } from "../types/keyword-monitor";
import { statusText } from "../utils/formatters";

interface Props {
  keywords: KeywordMonitor[];
  selectedKeywordId: number | null;
  keywordForm: KeywordMonitorForm;
  collecting: boolean;
}

interface Emits {
  (e: "update:selected-keyword-id", id: number): void;
  (e: "run-collection", keywordId?: number): void;
  (e: "create-keyword"): void;
  (e: "toggle-keyword", keyword: KeywordMonitor): void;
  (e: "update-keyword-priority", keyword: KeywordMonitor, priority: KeywordMonitor["priority"]): void;
  (e: "delete-keyword", keywordId: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const pendingDeleteId = ref<number | null>(null);
const pendingDeleteLabel = computed(() => props.keywords.find((keyword) => keyword.id === pendingDeleteId.value)?.keyword ?? "");

function openDeleteConfirm(keyword: KeywordMonitor): void {
  pendingDeleteId.value = keyword.id;
}

function closeDeleteConfirm(): void {
  pendingDeleteId.value = null;
}

function confirmDelete(): void {
  if (pendingDeleteId.value !== null) {
    emit("delete-keyword", pendingDeleteId.value);
  }
  closeDeleteConfirm();
}

function updatePriority(keyword: KeywordMonitor, event: Event): void {
  const priority = (event.target as HTMLSelectElement).value as KeywordMonitor["priority"];
  emit("update-keyword-priority", keyword, priority);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>关键词监控</h2>
      <button class="primary compact" type="button" :disabled="!selectedKeywordId || collecting" @click="emit('run-collection', selectedKeywordId ?? undefined)">
        <Play :size="16" />
        <span>采集当前关键词</span>
      </button>
    </div>
    <form class="keyword-form" @submit.prevent="emit('create-keyword')">
      <input v-model="keywordForm.keyword" placeholder="关键词" />
      <input v-model="keywordForm.marketplace" placeholder="amazon.com" />
      <select v-model="keywordForm.priority" aria-label="关键词优先级">
        <option value="S">S 核心成交词</option>
        <option value="A">A 高流量词</option>
        <option value="B">B 长尾转化词</option>
        <option value="C">C 观察词</option>
      </select>
      <input v-model="keywordForm.zipCode" placeholder="邮编" />
      <input v-model="keywordForm.categoryTag" placeholder="类目标记" />
      <input v-model.number="keywordForm.crawlPages" type="number" min="1" max="10" />
      <button type="submit">
        <Search :size="16" />
        <span>新增</span>
      </button>
    </form>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>关键词</th>
            <th>站点</th>
            <th>优先级</th>
            <th>邮编</th>
            <th>分类</th>
            <th>页数</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="keyword in keywords" :key="keyword.id" :class="{ selected: selectedKeywordId === keyword.id }">
            <td class="clickable-cell" @click="emit('update:selected-keyword-id', keyword.id)">{{ keyword.keyword }}</td>
            <td>{{ keyword.marketplace }}</td>
            <td>
              <select
                class="keyword-priority-select"
                :value="keyword.priority"
                :aria-label="`${keyword.keyword} 优先级`"
                @change="updatePriority(keyword, $event)"
              >
                <option value="S">S</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </td>
            <td>{{ keyword.zipCode }}</td>
            <td>{{ keyword.categoryTag || "未分组" }}</td>
            <td>{{ keyword.crawlPages }}</td>
            <td>{{ statusText(keyword.status) }}</td>
            <td class="row-actions">
              <button class="icon-button" :title="keyword.status === 'enabled' ? '停用监控' : '启用监控'" type="button" @click="emit('toggle-keyword', keyword)">
                <RefreshCw :size="16" />
              </button>
              <button
                class="icon-button danger"
                title="删除关键词"
                type="button"
                @click="openDeleteConfirm(keyword)"
              >
                <Trash2 :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pendingDeleteId !== null" class="confirm-backdrop" @click="closeDeleteConfirm">
      <div class="confirm-dialog" @click.stop>
        <h3>删除关键词</h3>
        <p>确定要删除关键词「{{ pendingDeleteLabel }}」吗？此操作不可撤销。</p>
        <div class="confirm-actions">
          <button type="button" @click="closeDeleteConfirm">
            <X :size="16" />
            <span>取消</span>
          </button>
          <button class="danger-solid" type="button" @click="confirmDelete">
            <Trash2 :size="16" />
            <span>确认删除</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.row-actions {
  display: flex;
  gap: 8px;
}

.danger {
  color: #dc2626;
}

.confirm-backdrop {
  align-items: center;
  background: rgba(15, 23, 42, 0.38);
  display: flex;
  inset: 0;
  justify-content: center;
  position: fixed;
  z-index: 30;
}

.confirm-dialog {
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.24);
  max-width: 360px;
  padding: 18px;
  width: calc(100vw - 32px);
}

.confirm-dialog h3 {
  color: #0f172a;
  font-size: 16px;
  margin: 0;
}

.confirm-dialog p {
  color: #475569;
  line-height: 1.6;
  margin: 10px 0 0;
}

.confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 18px;
}

.danger-solid {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}
</style>
