<script setup lang="ts">
// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
import type { Component } from "vue";

export interface PrototypeKpiItem {
  key: string;
  label: string;
  value: number;
  icon?: Component;
  emphasis?: "primary" | "secondary";
}

defineProps<{
  items: PrototypeKpiItem[];
}>();
</script>

<template>
  <div class="prototype-kpi-row" :data-row-count="items.length">
    <article
      v-for="item in items"
      :key="item.key"
      class="prototype-kpi"
      :class="[`prototype-kpi--${item.emphasis ?? 'primary'}`]"
    >
      <span v-if="item.icon" class="prototype-kpi-icon">
        <component :is="item.icon" :size="14" />
      </span>
      <small>{{ item.label }}</small>
      <strong>{{ item.value }}</strong>
    </article>
  </div>
</template>

<style scoped>
.prototype-kpi-row {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.prototype-kpi {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  display: grid;
  gap: 4px;
  padding: 10px 12px;
}

.prototype-kpi--secondary {
  background: #f8fafc;
}

.prototype-kpi-icon {
  align-items: center;
  background: #f1f5f9;
  border-radius: 6px;
  color: #475569;
  display: inline-flex;
  height: 22px;
  justify-content: center;
  width: 22px;
}

.prototype-kpi--secondary .prototype-kpi-icon {
  background: #ffffff;
}

.prototype-kpi small {
  color: var(--text-muted, #64748b);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.prototype-kpi strong {
  color: var(--text-primary, #0f172a);
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}
</style>
