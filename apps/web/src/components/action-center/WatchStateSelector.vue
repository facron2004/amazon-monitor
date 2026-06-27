<script setup lang="ts">
import { asinWatchLevelLabels, type AsinWatchLevel, type AsinWatchState } from "@amazon-monitor/shared";

const props = defineProps<{
  state: AsinWatchState | null;
}>();

const emit = defineEmits<{
  (event: "change", value: AsinWatchLevel): void;
}>();

function changeLevel(event: Event): void {
  emit("change", (event.target as HTMLSelectElement).value as AsinWatchLevel);
}
</script>

<template>
  <label class="watch-state-selector">
    <span>竞品等级</span>
    <select :value="props.state?.watchLevel ?? 'NORMAL'" @change="changeLevel">
      <option v-for="(label, level) in asinWatchLevelLabels" :key="level" :value="level">{{ label }}</option>
    </select>
    <small v-if="props.state?.watchReason">{{ props.state.watchReason }}</small>
  </label>
</template>

<style scoped>
.watch-state-selector {
  display: grid;
  gap: 7px;
}

.watch-state-selector > span,
.watch-state-selector small {
  color: #64748b;
  font-size: 12px;
}

.watch-state-selector select {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
  padding: 9px 10px;
  width: 100%;
}
</style>