<script setup lang="ts">
import { computed } from "vue";
import type { BrandMatrixSnapshot, CategorySignalLog } from "@amazon-monitor/shared";
import { changeLabel, levelLabel } from "../utils/formatters";
import { levelWeight, normalizeWidth } from "../utils/category-intelligence";

interface Props {
  topBrandMatrix: BrandMatrixSnapshot[];
  categorySignals: CategorySignalLog[];
}

const props = defineProps<Props>();

const brandPressureRows = computed(() => {
  const maxValue = Math.max(...props.topBrandMatrix.map((item) => item.productCountTop100), 1);

  return props.topBrandMatrix.slice(0, 5).map((item) => ({
    brand: item.brand,
    occupancy: item.productCountTop100,
    width: normalizeWidth(item.productCountTop100, maxValue),
    note: `Top 20 ${item.productCountTop20} · Top 50 ${item.productCountTop50} · 新增 ${item.newEntryCount} · Deal/Coupon ${
      item.dealCount + item.couponCount
    }`,
    bestRank: item.bestRank ? `#${item.bestRank}` : "-"
  }));
});

const signalHeatRows = computed(() => {
  const grouped = new Map<string, { count: number; maxLevel: string }>();

  for (const signal of props.categorySignals) {
    const current = grouped.get(signal.signalType);
    if (!current) {
      grouped.set(signal.signalType, { count: 1, maxLevel: signal.alertLevel });
      continue;
    }

    current.count += 1;
    if (levelWeight(signal.alertLevel) > levelWeight(current.maxLevel)) {
      current.maxLevel = signal.alertLevel;
    }
  }

  const rows = [...grouped.entries()].sort((left, right) => right[1].count - left[1].count);
  const maxValue = Math.max(...rows.map((item) => item[1].count), 1);

  return rows.slice(0, 5).map(([signalType, item]) => ({
    label: changeLabel(signalType),
    count: item.count,
    width: normalizeWidth(item.count, maxValue),
    tone: item.maxLevel
  }));
});
</script>

<template>
  <div class="split intensity-grid category-anchor">
    <section class="panel dense-panel">
      <div class="panel-head">
        <div class="panel-head-copy">
          <h2>品牌压强条</h2>
          <p class="panel-caption">看谁在 Top 100 里持续占位，而不是只看散乱的品牌名单。</p>
        </div>
        <span>{{ brandPressureRows.length }} 个高占位品牌</span>
      </div>

      <div class="intensity-list">
        <article v-for="item in brandPressureRows" :key="item.brand" class="intensity-row">
          <div class="intensity-head">
            <strong>{{ item.brand }}</strong>
            <span>{{ item.occupancy }} 席 · 最佳 {{ item.bestRank }}</span>
          </div>
          <div class="intensity-track">
            <span class="tone-brand" :style="{ width: `${item.width}%` }"></span>
          </div>
          <small>{{ item.note }}</small>
        </article>
      </div>
    </section>

    <section class="panel dense-panel">
      <div class="panel-head">
        <div class="panel-head-copy">
          <h2>信号热度谱</h2>
          <p class="panel-caption">把当天反复出现的变化类型聚在一起，看清今天到底是哪类信号在主导讨论。</p>
        </div>
        <span>{{ signalHeatRows.length }} 类高频信号</span>
      </div>

      <div class="intensity-list">
        <article v-for="item in signalHeatRows" :key="item.label" class="intensity-row">
          <div class="intensity-head">
            <strong>{{ item.label }}</strong>
            <span>{{ item.count }} 次出现</span>
          </div>
          <div class="intensity-track">
            <span :class="`tone-${item.tone}`" :style="{ width: `${item.width}%` }"></span>
          </div>
          <small>{{ levelLabel(item.tone) }} 优先级的同类信号最值得先追踪</small>
        </article>
      </div>
    </section>
  </div>
</template>
