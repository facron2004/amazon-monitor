<script setup lang="ts">
import { attributionTagLabels, type AttributionTag } from "@amazon-monitor/shared";

defineProps<{
  tags: AttributionTag[];
}>();
</script>

<template>
  <span class="attribution-tags">
    <span v-for="tag in tags" :key="tag">{{ attributionTagLabels[tag] }}</span>
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
