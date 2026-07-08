<script setup lang="ts">
import { computed, type Component } from "vue";
import { ArrowDownRight, ArrowUpRight, Flame, KeyRound, Layers, Sparkles, TrendingDown } from "@lucide/vue";
import type { CompetitorKpi } from "../utils/competitor-pool";

interface Props {
  kpis: CompetitorKpi[];
}

const props = defineProps<Props>();

function deltaText(delta: number | null): string {
  if (delta === null) return "较昨日 -";
  if (delta > 0) return `较昨日 ▲ ${delta}`;
  if (delta < 0) return `较昨日 ▼ ${Math.abs(delta)}`;
  return "较昨日 持平";
}

function deltaTone(delta: number | null): "up" | "down" | "flat" | "none" {
  if (delta === null) return "none";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

const ICON_MAP: Record<CompetitorKpi["tone"], Component> = {
  total: Layers,
  core: Flame,
  new: Sparkles,
  price: TrendingDown,
  key: KeyRound
};

const TREND_HINT: Record<CompetitorKpi["tone"], { upIsGood: boolean; label: string }> = {
  total: { upIsGood: true, label: "总竞品数 / 全部入池 ASIN" },
  core: { upIsGood: false, label: "核心分层 / 手动核心标记" },
  new: { upIsGood: false, label: "近 7 天新进" },
  price: { upIsGood: true, label: "Coupon/Deal 活动中" },
  key: { upIsGood: false, label: "高优跟进" }
};

function trendPath(tone: CompetitorKpi["tone"]): string {
  // 简单 SVG 折线,3 个数据点示意;真实"较昨日"由 store.yesterdayKpiDelta 决定。
  const seed = props.kpis.findIndex((k) => k.tone === tone);
  const base = ((seed * 37) % 24) + 6;
  const a = base;
  const b = base + ((seed * 13) % 12) - 6;
  const c = a + b > 0 ? Math.max(2, b - 3) : Math.min(34, b + 3);
  return `M0 ${40 - a} L40 ${40 - b} L80 ${40 - c}`;
}

const items = computed(() => props.kpis);
</script>

<template>
  <section class="competitor-kpi-cards">
    <article v-for="item in items" :key="item.key" :class="['kpi-card', `kpi-card--${item.tone}`]">
      <span class="kpi-card-icon">
        <component :is="ICON_MAP[item.tone]" :size="17" />
      </span>
      <strong class="kpi-card-value">{{ item.value }}</strong>
      <span class="kpi-card-label">{{ item.label }}</span>
      <small :class="['kpi-card-delta', `is-${deltaTone(item.delta)}`]">
        <ArrowUpRight v-if="deltaTone(item.delta) === 'up'" :size="11" />
        <ArrowDownRight v-else-if="deltaTone(item.delta) === 'down'" :size="11" />
        {{ deltaText(item.delta) }}
      </small>
      <small class="kpi-card-note">{{ TREND_HINT[item.tone].label }}</small>
      <svg class="kpi-card-spark" viewBox="0 0 80 40" preserveAspectRatio="none" aria-hidden="true">
        <path :d="trendPath(item.tone)" />
      </svg>
    </article>
  </section>
</template>

<style scoped>
.competitor-kpi-cards {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.kpi-card {
  align-items: flex-start;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  position: relative;
}

.kpi-card-icon {
  align-items: center;
  background: #f1f5f9;
  border-radius: 999px;
  color: var(--color-primary, #2563eb);
  display: inline-flex;
  height: 30px;
  justify-content: center;
  width: 30px;
}

.kpi-card--total .kpi-card-icon { background: #dbeafe; color: #1d4ed8; }
.kpi-card--core .kpi-card-icon { background: #fee2e2; color: #991b1b; }
.kpi-card--new .kpi-card-icon { background: #dcfce7; color: #166534; }
.kpi-card--price .kpi-card-icon { background: #ccfbf1; color: #0f766e; }
.kpi-card--key .kpi-card-icon { background: #ede9fe; color: #6d28d9; }

.kpi-card-value {
  color: var(--text-primary, #0f172a);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  margin-top: 4px;
}

.kpi-card-label {
  color: var(--text-secondary, #475569);
  font-size: 13px;
  font-weight: 600;
}

.kpi-card-delta {
  align-items: center;
  display: inline-flex;
  font-size: 11.5px;
  font-weight: 600;
  gap: 2px;
}

.kpi-card-delta.is-up { color: #166534; }
.kpi-card-delta.is-down { color: #991b1b; }
.kpi-card-delta.is-flat { color: var(--text-muted, #64748b); }
.kpi-card-delta.is-none { color: var(--text-muted, #94a3b8); }

.kpi-card-note {
  color: var(--text-muted, #64748b);
  font-size: 11px;
}

.kpi-card-spark {
  bottom: 8px;
  fill: none;
  height: 32px;
  pointer-events: none;
  position: absolute;
  right: 10px;
  stroke: currentColor;
  stroke-width: 1.4;
  width: 80px;
}

.kpi-card--total .kpi-card-spark { color: #1d4ed8; }
.kpi-card--core .kpi-card-spark { color: #991b1b; }
.kpi-card--new .kpi-card-spark { color: #166534; }
.kpi-card--price .kpi-card-spark { color: #0f766e; }
.kpi-card--key .kpi-card-spark { color: #6d28d9; }

@media (max-width: 1080px) {
  .competitor-kpi-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .competitor-kpi-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .kpi-card-spark {
    display: none;
  }
}
</style>
