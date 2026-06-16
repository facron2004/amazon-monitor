<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { AlertTriangle, BarChart3, Bell, Database, Radar, Tags } from "@lucide/vue";
import { useCategoryStore } from "../stores/category";
import { formatSignedCount } from "../utils/formatters";

const store = useCategoryStore();
const { categoryDetail, categorySignals, reviewGrowthAsinCount, maxReviewGrowth } = storeToRefs(store);

const metricItems = computed(() => [
  {
    label: "跟踪 ASIN",
    value: categoryDetail.value?.snapshots.length ?? 0,
    note: "当前榜单视图中的商品数",
    tone: "metric--brand",
    icon: Database
  },
  {
    label: "覆盖品牌",
    value: categoryDetail.value?.brandMatrix.filter((item) => item.productCountTop100 > 0).length ?? 0,
    note: "在 Top 100 中有可见占位的品牌",
    tone: "metric--brand",
    icon: Tags
  },
  {
    label: "当日信号",
    value: categorySignals.value.length,
    note: "识别出的类目变化",
    tone: "metric--signal",
    icon: Radar
  },
  {
    label: "爆发商品",
    value: categorySignals.value.filter((item) => item.signalType === "new_product_breakout").length,
    note: "快速冲榜的新品",
    tone: "metric--alert",
    icon: AlertTriangle
  },
  {
    label: "Review Growth ASIN",
    value: reviewGrowthAsinCount.value,
    note: "当天 Review 数上涨的商品",
    tone: "metric--review",
    icon: Bell
  },
  {
    label: "最大单日增量",
    value: formatSignedCount(maxReviewGrowth.value?.reviewCountChange),
    note: "当前视图里 Review 增量最大的商品",
    tone: "metric--review",
    icon: BarChart3
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
