<script setup lang="ts">
import { computed } from "vue";
import { Database, Play } from "@lucide/vue";
import type { CategoryMonitor } from "@amazon-monitor/shared";
import type { CategoryMonitorForm } from "../types/category-monitor";
import { categoryLabel } from "../utils/formatters";

interface Props {
  categories: CategoryMonitor[];
  selectedCategoryId: number | null;
  categoryDataDate: string;
  categoryDataIsFallback: boolean;
  categoryForm: CategoryMonitorForm;
  collecting: boolean;
}

interface Emits {
  (e: "run-category-collection", categoryId?: number): void;
  (e: "create-category"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedCategory = computed(() => props.categories.find((category) => category.id === props.selectedCategoryId) ?? null);
const enabledCount = computed(() => props.categories.filter((category) => category.status === "enabled").length);
const collectedTodayCount = computed(() => props.categories.filter((category) => category.todayStatus === "success").length);
const attentionCount = computed(() => props.categories.filter((category) => category.todayStatus === "failed" || category.todayStatus === "pending").length);
</script>

<template>
  <div>
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>类目 BSR 监控</h2>
        <p class="panel-caption">先选类目、确认数据日期，再在当前视图里完成定向采集与结果复盘。</p>
      </div>
      <button class="primary compact" type="button" :disabled="!selectedCategoryId || collecting" @click="emit('run-category-collection')">
        <Play :size="16" />
        <span>采集当前类目</span>
      </button>
    </div>

    <div :class="['data-date-bar', { 'data-date-bar--fallback': categoryDataIsFallback }]">
      <span>BSR 快照日期：{{ categoryDataDate }}</span>
      <strong v-if="categoryDataIsFallback">所选日期暂时无榜单行，当前展示最近一次成功采集到的快照。</strong>
    </div>

    <div class="monitor-summary">
      <article>
        <span>启用范围</span>
        <strong>{{ enabledCount }}</strong>
        <small>共 {{ categories.length }} 个监控</small>
      </article>
      <article>
        <span>采集成功</span>
        <strong>{{ collectedTodayCount }}</strong>
        <small>已有最新榜单数据</small>
      </article>
      <article>
        <span>需要关注</span>
        <strong>{{ attentionCount }}</strong>
        <small>待处理或失败</small>
      </article>
      <article>
        <span>当前类目</span>
        <strong>{{ categoryLabel(selectedCategory?.name) }}</strong>
        <small>{{ selectedCategory?.marketplace ?? "先选择一个类目开始查看" }}</small>
      </article>
    </div>

    <form class="category-form" @submit.prevent="emit('create-category')">
      <input v-model="categoryForm.name" placeholder="类目名称，例如 Ice Makers" />
      <input v-model="categoryForm.marketplace" placeholder="amazon.com" />
      <input v-model="categoryForm.categoryUrl" placeholder="Amazon Best Sellers 类目链接" />
      <input v-model="categoryForm.categoryPath" placeholder="类目路径（可选）" />
      <input v-model.number="categoryForm.crawlTopN" type="number" min="1" max="100" />
      <button type="submit">
        <Database :size="16" />
        <span>新增</span>
      </button>
    </form>
  </div>
</template>
