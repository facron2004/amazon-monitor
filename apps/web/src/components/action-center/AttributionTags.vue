<script setup lang="ts">
import type { AttributionTag } from "@amazon-monitor/shared";

defineProps<{
  tags: AttributionTag[];
}>();

const tagLabels: Record<AttributionTag, string> = {
  PRICE_DRIVEN: "价格驱动",
  COUPON_DRIVEN: "Coupon",
  DEAL_DRIVEN: "Deal",
  REVIEW_DRIVEN: "Review",
  NEW_PRODUCT_PUSH: "新品",
  BRAND_MATRIX_PUSH: "品牌矩阵",
  PROMO_END_DROP: "活动回落",
  ORGANIC_STRENGTH: "自然增强",
  NO_CLEAR_DRIVER: "暂无驱动"
};
</script>

<template>
  <span class="attribution-tags">
    <span v-for="tag in tags" :key="tag">{{ tagLabels[tag] }}</span>
  </span>
</template>

<style scoped>
.attribution-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.attribution-tags span {
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  color: #3730a3;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
}
</style>
