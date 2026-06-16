<script setup lang="ts">
import { Play, RefreshCw, Search } from "@lucide/vue";
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
}

defineProps<Props>();
const emit = defineEmits<Emits>();
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
            <td>{{ keyword.zipCode }}</td>
            <td>{{ keyword.categoryTag || "未分组" }}</td>
            <td>{{ keyword.crawlPages }}</td>
            <td>{{ statusText(keyword.status) }}</td>
            <td>
              <button class="icon-button" :title="keyword.status === 'enabled' ? '停用监控' : '启用监控'" type="button" @click="emit('toggle-keyword', keyword)">
                <RefreshCw :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
