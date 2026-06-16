<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, Bell, Database, Radar, Search, Tags } from "@lucide/vue";
import type { DashboardSummary } from "@amazon-monitor/shared";

interface Props {
  summary: DashboardSummary | null;
}

const props = defineProps<Props>();

const metricItems = computed(() => [
  {
    label: "启用关键词",
    value: props.summary?.activeKeywordCount ?? 0,
    note: "当前启用的搜索监控",
    tone: "metric--signal",
    icon: Search
  },
  {
    label: "启用类目",
    value: props.summary?.activeCategoryCount ?? 0,
    note: "正在运行的畅销榜范围",
    tone: "metric--brand",
    icon: Database
  },
  {
    label: "今日快照",
    value: props.summary?.todaySnapshotCount ?? 0,
    note: "今日采集到的关键词行数",
    tone: "metric--signal",
    icon: Radar
  },
  {
    label: "类目 ASIN",
    value: props.summary?.categorySnapshotCount ?? 0,
    note: "畅销榜范围内的商品数",
    tone: "metric--brand",
    icon: Database
  },
  {
    label: "竞品池",
    value: props.summary?.competitorCount ?? 0,
    note: "持续观察的商品数",
    tone: "metric--review",
    icon: Tags
  },
  {
    label: "类目信号",
    value: props.summary?.categorySignalCount ?? 0,
    note: "当天识别到的新变化",
    tone: "metric--review",
    icon: Bell
  },
  {
    label: "高优先级预警",
    value: props.summary?.criticalAlertCount ?? 0,
    note: "最需要优先跟进的异常",
    tone: "metric--alert",
    icon: AlertTriangle
  }
]);
</script>

<template>
  <div class="metrics">
    <article v-for="item in metricItems" :key="item.label" :class="['metric', item.tone]">
      <div class="metric-head">
        <div>
          <span class="metric-label">{{ item.label }}</span>
          <small class="metric-note">{{ item.note }}</small>
        </div>
        <span class="metric-icon">
          <component :is="item.icon" :size="18" />
        </span>
      </div>
      <strong>{{ item.value }}</strong>
    </article>
  </div>
</template>
