<script setup lang="ts">
import { ref } from "vue";
import { ListChecks, LayoutGrid } from "@lucide/vue";
import type { InsightEvent } from "@amazon-monitor/shared";
import type { AsinGroupedView } from "../../stores/insightEvents";
import AsinGroupCard from "./AsinGroupCard.vue";

const props = defineProps<{
  groups: AsinGroupedView[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
}>();

const expandedAsins = ref<Set<string>>(new Set());

function toggleExpand(asin: string): void {
  const next = new Set(expandedAsins.value);
  if (next.has(asin)) {
    next.delete(asin);
  } else {
    next.add(asin);
  }
  expandedAsins.value = next;
}
</script>

<template>
  <section class="asin-list-panel">
    <div class="panel-title">
      <div>
        <span>ASIN 案件流</span>
        <h3>{{ groups.length }} 个待判断 ASIN</h3>
      </div>
      <small v-if="loading">加载中...</small>
    </div>

    <div v-if="groups.length" class="asin-list">
      <AsinGroupCard
        v-for="group in groups"
        :key="group.asin"
        :group="group"
        :expanded="expandedAsins.has(group.asin)"
        @select="emit('select', $event)"
        @toggle-expand="toggleExpand"
      />
    </div>

    <div v-else class="empty-copy">
      <LayoutGrid :size="36" />
      <p>没有可聚合的事件。尝试取消勾选筛选器，或去生成洞察。</p>
      <small>列表视图仍可访问，点击顶部「事件列表」切换。</small>
    </div>
  </section>
</template>

<style scoped>
.asin-list-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.panel-title {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.panel-title span {
  color: #64748b;
  display: block;
  font-size: 12px;
}

.panel-title h3 {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.2;
  margin: 3px 0 0;
}

.asin-list {
  display: grid;
  gap: 12px;
}

.empty-copy {
  align-items: center;
  background: #f8fafc;
  border-radius: 8px;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 32px;
  text-align: center;
}

.empty-copy p {
  margin: 0;
}

.empty-copy small {
  color: #94a3b8;
  display: inline-flex;
  gap: 4px;
}
</style>
