<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { AlertTriangle } from "@lucide/vue";
import { useCategoryStore } from "../stores/category";
import { changeLabel, levelLabel, localizeGeneratedText } from "../utils/formatters";

const store = useCategoryStore();
const { categorySignals } = storeToRefs(store);

const levelSummary = computed(() => [
  { key: "critical", label: "紧急", count: categorySignals.value.filter((item) => item.alertLevel === "critical").length },
  { key: "high", label: "高优", count: categorySignals.value.filter((item) => item.alertLevel === "high").length },
  { key: "medium", label: "中优", count: categorySignals.value.filter((item) => item.alertLevel === "medium").length }
].filter((item) => item.count > 0));
</script>

<template>
  <section class="panel dense-panel signal-feed-panel">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>类目信号</h2>
        <p class="panel-caption">把同一天最值得关注的信号做成事件流卡片，而不是只保留一行提示。</p>
      </div>
      <span>{{ categorySignals.length }} 条</span>
    </div>

    <div v-if="levelSummary.length" class="signal-level-strip">
      <article v-for="item in levelSummary" :key="item.key" :class="['signal-level-pill', `signal-level-pill--${item.key}`]">
        <span>{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
      </article>
    </div>

    <div class="signal-feed compact-scroll signal-scroll">
      <article v-for="signal in categorySignals" :key="signal.id || `${signal.asin}-${signal.signalType}`" :class="['signal-feed-card', `signal-feed-card--${signal.alertLevel}`]">
        <div class="signal-feed-head">
          <span class="signal-feed-tag">
            <AlertTriangle :size="14" />
            {{ changeLabel(signal.signalType) }}
          </span>
          <span :class="['level', signal.alertLevel]">{{ levelLabel(signal.alertLevel) }}</span>
        </div>
        <strong>{{ signal.asin || "-" }}</strong>
        <p>{{ localizeGeneratedText(signal.content) }}</p>
      </article>
    </div>
  </section>
</template>
