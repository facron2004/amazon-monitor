<script setup lang="ts">
import { X } from "@lucide/vue";
import { strategyTagLabels, type StrategyTag } from "@amazon-monitor/shared";

defineProps<{
  tags: StrategyTag[];
  removable?: boolean;
}>();

const emit = defineEmits<{
  (event: "remove", tag: StrategyTag): void;
}>();
</script>

<template>
  <span v-if="tags.length" class="strategy-tags">
    <span v-for="tag in tags" :key="tag" class="strategy-tag">
      <span>{{ strategyTagLabels[tag] }}</span>
      <button
        v-if="removable"
        class="remove-button"
        type="button"
        :aria-label="`删除 ${strategyTagLabels[tag]}`"
        @click="emit('remove', tag)"
      >
        <X :size="12" />
      </button>
    </span>
  </span>
</template>

<style scoped>
.strategy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.strategy-tag {
  align-items: center;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 999px;
  color: #065f46;
  display: inline-flex;
  font-size: 12px;
  gap: 4px;
  line-height: 1;
  padding: 5px 6px 5px 8px;
}

.remove-button {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  display: inline-flex;
  padding: 0;
}
</style>