<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, LayoutPanelTop, Menu, Radar } from "@lucide/vue";

const props = defineProps<{
  loading: boolean;
  activeTabLabel: string;
  selectedDate: string;
}>();

const emit = defineEmits<{
  (event: "toggle-sidebar"): void;
}>();

const heroContent = computed(() => {
  const contentByTab: Record<string, { title: string; copy: string }> = {
    "总览": {
      title: "运营总览",
      copy: "把采集健康度、监控范围和预警队列放在同一个视野里，方便快速进入当日复盘。"
    },
    "类目情报": {
      title: "类目榜单情报",
      copy: "把榜单波动、品牌压力、评价增长和促销信号串成一条更清晰的信息流。"
    },
    "关键词": {
      title: "关键词监控看板",
      copy: "逐词查看搜索位次快照、采集状态和价格变化，快速发现异常词与强势词。"
    },
    "竞品池": {
      title: "竞品观察池",
      copy: "让竞品池保持可筛选、可排序，并且始终能回溯到对应的类目和关键词证据。"
    },
    "预警": {
      title: "预警处理台",
      copy: "优先处理最关键的变化，让监控结果尽快转化为可执行动作。"
    },
    "通知": {
      title: "发送与排期中心",
      copy: "统一管理报告投递规则、手动发送和定时通知，让输出链路更稳定。"
    },
    "报告": {
      title: "日报与分析输出",
      copy: "在监控上下文里直接查看日报和类目分析，不用切换到别的工作流。"
    },
    "日志": {
      title: "采集运行日志",
      copy: "先确认抓取是否健康，再决定后续是重跑、排查还是直接处理异常数据。"
    }
  };

  return (
    contentByTab[props.activeTabLabel] ?? {
      title: "亚马逊监控驾驶舱",
      copy: "把采集、波动和后续动作收拢到一张运营界面里，减少来回切页。"
    }
  );
});
</script>

<template>
  <div class="topbar-main">
    <div class="topbar-utility">
      <button class="icon-button topbar-toggle" type="button" aria-label="切换导航" @click="emit('toggle-sidebar')">
        <Menu :size="18" />
      </button>
      <span class="hero-chip hero-chip-quiet">
        <LayoutPanelTop :size="14" />
        <span>{{ activeTabLabel }}</span>
      </span>
    </div>

    <p class="eyebrow">亚马逊监控驾驶舱</p>
    <h1>{{ heroContent.title }}</h1>
    <p class="topbar-copy">{{ heroContent.copy }}</p>

    <div class="topbar-meta">
      <span class="hero-chip">
        <CalendarDays :size="14" />
        <span>数据日期 · {{ selectedDate }}</span>
      </span>
      <span :class="['hero-chip', loading ? 'is-live' : 'hero-chip-quiet']">
        <Radar :size="14" />
        <span>{{ loading ? "采集中" : "就绪" }}</span>
      </span>
    </div>
  </div>
</template>
