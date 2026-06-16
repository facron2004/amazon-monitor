<script setup lang="ts">
import { computed } from "vue";
import { Bell, Database, Search, Send } from "@lucide/vue";

const props = defineProps<{
  loading: boolean;
  actionMessage: string;
  errorMessage: string;
  activeTabLabel: string;
  categoryCount: number;
  keywordCount: number;
  pendingAlertCount: number;
  scheduleCount: number;
}>();

const pulseTitle = computed(() => {
  if (props.loading) {
    return "正在刷新当前视图";
  }
  if (props.pendingAlertCount > 0) {
    return "还有预警待处理";
  }
  if (props.categoryCount === 0 && props.keywordCount === 0) {
    return "监控范围还没有配置完成";
  }
  return "可以开始下一轮复盘";
});

const pulseCopy = computed(() => {
  if (props.loading) {
    return `正在刷新「${props.activeTabLabel}」数据，确保当前判断基于最新采集结果。`;
  }
  if (props.pendingAlertCount > 0) {
    return `还有 ${props.pendingAlertCount} 条待处理预警，建议先清掉高优先级项，再进入更深的分析。`;
  }
  if (props.categoryCount === 0 && props.keywordCount === 0) {
    return "先补齐类目或关键词监控范围，整个看板才会真正变成可工作的运营界面。";
  }
  return "先用日期切换回看历史，再在需要时发起采集，拿到一份新的运营快照。";
});

const statCards = computed(() => [
  { label: "类目范围", value: props.categoryCount, note: "畅销榜监控", icon: Database },
  { label: "关键词", value: props.keywordCount, note: "搜索观察列表", icon: Search },
  { label: "待处理预警", value: props.pendingAlertCount, note: "需要跟进", icon: Bell },
  { label: "通知计划", value: props.scheduleCount, note: "发送规则", icon: Send }
]);
</script>

<template>
  <div class="topbar-side">
    <div class="status-line">
      <span v-if="loading" class="pill neutral">采集中</span>
      <span v-if="actionMessage" class="pill success">{{ actionMessage }}</span>
      <span v-if="errorMessage" class="pill danger">{{ errorMessage }}</span>
    </div>

    <section class="topbar-pulse">
      <span class="topbar-pulse-label">当前焦点</span>
      <strong>{{ pulseTitle }}</strong>
      <p>{{ pulseCopy }}</p>
    </section>

    <div class="topbar-stats">
      <article v-for="card in statCards" :key="card.label" class="topbar-stat">
        <div class="topbar-stat-head">
          <span class="topbar-stat-icon">
            <component :is="card.icon" :size="16" />
          </span>
          <span>{{ card.label }}</span>
        </div>
        <strong>{{ card.value }}</strong>
        <small>{{ card.note }}</small>
      </article>
    </div>
  </div>
</template>
