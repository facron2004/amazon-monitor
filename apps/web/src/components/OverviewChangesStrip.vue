<script setup lang="ts">
import type { DailyChange } from "@amazon-monitor/shared";
import { changeLabel, formatPercent } from "../utils/formatters";

interface Props {
  changes: DailyChange[];
}

defineProps<Props>();
</script>

<template>
  <section v-if="changes.length" class="view panel">
    <div class="panel-head">
      <h2>最近变化</h2>
      <span>{{ changes.length }} 条</span>
    </div>
    <div class="change-strip">
      <span v-for="change in changes.slice(0, 24)" :key="`${change.asin}-${change.changeType}`">
        {{ changeLabel(change.changeType) }} | {{ change.asin }} | {{ formatPercent(change.priceChangeRate) }}
      </span>
    </div>
  </section>
</template>
