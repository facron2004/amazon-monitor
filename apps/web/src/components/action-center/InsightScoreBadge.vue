<script setup lang="ts">
import type { InsightScoreLevel } from "@amazon-monitor/shared";

defineProps<{
  score: number;
  level: InsightScoreLevel;
  compact?: boolean;
}>();
</script>

<template>
  <span :class="['insight-score-badge', `insight-score-badge--${level.toLowerCase()}`, { 'insight-score-badge--compact': compact }]">
    <strong>{{ score }}</strong>
    <small>{{ level }}</small>
  </span>
</template>

<style scoped>
.insight-score-badge {
  align-items: center;
  aspect-ratio: 1;
  border-radius: 8px;
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  min-width: 54px;
  padding: 6px;
  border: 1px solid #d7dee8;
  background: #f7fafc;
  color: #263241;
}

.insight-score-badge strong {
  font-size: 18px;
  line-height: 1;
}

.insight-score-badge small {
  font-size: 11px;
  margin-top: 3px;
}

.insight-score-badge--compact {
  width: auto;
  min-width: 0;
  height: 23px;
  aspect-ratio: auto;
  flex-direction: row;
  gap: 3px;
  padding: 0 6px;
  border-radius: 5px;
}

.insight-score-badge--compact strong {
  font-size: 11px;
}

.insight-score-badge--compact small {
  margin: 0;
  font-size: 9px;
}

.insight-score-badge--s {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.insight-score-badge--a {
  background: #ffedd5;
  border-color: #fdba74;
  color: #9a3412;
}

.insight-score-badge--b {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
}
</style>
