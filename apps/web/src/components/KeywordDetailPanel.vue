<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { KeywordMonitor, SerpSnapshot } from "@amazon-monitor/shared";
import { formatMoney, imgFallback, promoText } from "../utils/formatters";

interface Props {
  selectedKeyword: KeywordMonitor | null;
  topSnapshots: SerpSnapshot[];
}

interface Emits {
  (e: "chart-ready", element: HTMLDivElement | null): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
const chartEl = ref<HTMLDivElement | null>(null);

onMounted(() => {
  emit("chart-ready", chartEl.value);
});

watch(chartEl, (element) => {
  emit("chart-ready", element);
});

onBeforeUnmount(() => {
  emit("chart-ready", null);
});
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>{{ selectedKeyword?.keyword ?? "关键词详情" }}</h2>
      <span>{{ topSnapshots.length }} 个商品</span>
    </div>
    <div ref="chartEl" class="chart"></div>
    <div class="product-grid">
      <article v-for="item in topSnapshots" :key="item.asin" class="product-row">
        <img :src="item.imageUrl" :alt="item.title" loading="lazy" decoding="async" @error="imgFallback" />
        <div>
          <strong>{{ item.asin }}</strong>
          <p>{{ item.title }}</p>
          <span>{{ item.brand || "未知品牌" }}</span>
        </div>
        <div class="rank-box">
          <strong>#{{ item.absoluteRank }}</strong>
          <span>{{ item.isSponsored ? "广告" : "自然" }}</span>
        </div>
        <div class="price-box">
          <strong>{{ formatMoney(item.currentPrice) }}</strong>
          <span>{{ promoText(item) === "-" ? "常规价" : promoText(item) }}</span>
        </div>
      </article>
    </div>
  </section>
</template>
