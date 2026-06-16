<script setup lang="ts">
import { storeToRefs } from "pinia";
import { CheckCircle2 } from "@lucide/vue";
import { useCategoryStore } from "../stores/category";
import { formatCount, formatSignedCount } from "../utils/formatters";

const store = useCategoryStore();
const { reviewGrowthEvents, reviewGrowthAsinCount, totalReviewGrowth } = storeToRefs(store);
</script>

<template>
  <section class="panel dense-panel review-growth-panel">
    <div class="panel-head">
      <h2>Review Growth</h2>
      <span>{{ reviewGrowthAsinCount }} 个 ASIN · 总计 {{ formatSignedCount(totalReviewGrowth) }}</span>
    </div>
    <div v-if="reviewGrowthEvents.length" class="review-growth-list">
      <article v-for="item in reviewGrowthEvents.slice(0, 6)" :key="item.eventKey" class="review-growth-row">
        <div>
          <strong>{{ item.asin }}</strong>
          <span>{{ item.brand || "未知品牌" }} · {{ item.title || item.eventSummary }}</span>
        </div>
        <div class="review-growth-count">
          <strong>{{ formatSignedCount(item.reviewCountChange) }}</strong>
          <small>{{ formatCount(item.reviewCountBefore) }} → {{ formatCount(item.reviewCountAfter) }}</small>
        </div>
      </article>
    </div>
    <div v-else class="empty-state compact-empty">
      <CheckCircle2 :size="22" />
      <p>暂时还没有可用的 Review 增长数据。需要同一 ASIN 至少有两次可比较快照后，才会形成日增量。</p>
    </div>
  </section>
</template>
