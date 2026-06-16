<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category";
import { categoryLabel } from "../utils/formatters";

const store = useCategoryStore();
const { selectedCategory, topBrandMatrix } = storeToRefs(store);

const maxOccupancy = computed(() => Math.max(...topBrandMatrix.value.map((item) => item.productCountTop100), 1));
</script>

<template>
  <section class="panel dense-panel brand-pressure-panel">
    <div class="panel-head">
      <div class="panel-head-copy">
        <h2>{{ selectedCategory ? categoryLabel(selectedCategory.name) : "品牌矩阵" }}</h2>
        <p class="panel-caption">用占位强度来判断品牌压力，避免被一长列品牌名字稀释判断。</p>
      </div>
      <span>{{ topBrandMatrix.length }} 个品牌</span>
    </div>

    <div class="brand-pressure-list compact-scroll">
      <article v-for="brand in topBrandMatrix.slice(0, 8)" :key="brand.brand" class="brand-pressure-card">
        <div class="brand-pressure-head">
          <div>
            <strong>{{ brand.brand }}</strong>
            <small>Top ASIN：{{ brand.topAsins.slice(0, 4).join(" · ") || "-" }}</small>
          </div>
          <span>{{ brand.bestRank ? `最佳 #${brand.bestRank}` : "最佳 -" }}</span>
        </div>

        <div class="brand-pressure-track">
          <span :style="{ width: `${Math.max(12, Math.round((brand.productCountTop100 / maxOccupancy) * 100))}%` }"></span>
        </div>

        <div class="brand-pressure-meta">
          <span>Top 100 {{ brand.productCountTop100 }}</span>
          <span>Top 50 {{ brand.productCountTop50 }}</span>
          <span>Top 20 {{ brand.productCountTop20 }}</span>
          <span>新增 {{ brand.newEntryCount }}</span>
          <span>掉榜 {{ brand.droppedCount }}</span>
          <span>{{ brand.couponCount }} Coupon / {{ brand.dealCount }} Deal</span>
        </div>
      </article>
    </div>
  </section>
</template>
