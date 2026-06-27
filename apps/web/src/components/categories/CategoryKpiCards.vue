<script setup lang="ts">
import { computed, type Component } from "vue";
import { ArrowDownRight, ArrowUpRight, BadgePercent, Sparkles } from "@lucide/vue";
import type { KpiDelta } from "../../composables/useCategoryDailyBriefing";

interface Props {
  moversCount: number;
  promotionsCount: number;
  fadingCount: number;
  reviewGrowthCount: number;
  yesterdayDelta: KpiDelta;
}

interface KpiItem {
  key: keyof KpiDelta;
  label: string;
  value: number;
  delta: number | null;
  tone: "new" | "rise" | "fall" | "activity" | "price" | "brand";
  icon: Component;
  note: string;
}

const props = defineProps<Props>();

function deltaText(delta: number | null): string {
  if (delta === null) return "较昨日 -";
  if (delta > 0) return `较昨日 +${delta}`;
  if (delta < 0) return `较昨日 ${delta}`;
  return "较昨日 持平";
}

function deltaTone(delta: number | null): "up" | "down" | "flat" | "none" {
  if (delta === null) return "none";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

const items = computed<KpiItem[]>(() => [
  {
    key: "movers",
    label: "异动",
    value: props.moversCount,
    delta: props.yesterdayDelta.movers,
    tone: "new",
    icon: Sparkles,
    note: "新进 + 上升 + 品牌矩阵"
  },
  {
    key: "promotions",
    label: "活动",
    value: props.promotionsCount,
    delta: props.yesterdayDelta.promotions,
    tone: "activity",
    icon: BadgePercent,
    note: "Coupon 启动 + Deal 启动"
  },
  {
    key: "fading",
    label: "风险",
    value: props.fadingCount,
    delta: props.yesterdayDelta.fading,
    tone: "fall",
    icon: ArrowDownRight,
    note: "Coupon/Deal 结束 + Rank 下滑"
  },
  {
    key: "reviewGrowth",
    label: "Review 增长",
    value: props.reviewGrowthCount,
    delta: props.yesterdayDelta.reviewGrowth,
    tone: "rise",
    icon: ArrowUpRight,
    note: "Review 净增量事件"
  }
]);
</script>

<template>
  <section class="kpi-cards">
    <article v-for="item in items" :key="item.key" :class="['kpi-card', `kpi-card--${item.tone}`]">
      <span class="kpi-card-icon">
        <component :is="item.icon" :size="18" />
      </span>
      <strong class="kpi-card-value">{{ item.value }}</strong>
      <span class="kpi-card-label">{{ item.label }}</span>
      <small :class="['kpi-card-delta', `is-${deltaTone(item.delta)}`]">{{ deltaText(item.delta) }}</small>
      <small class="kpi-card-note">{{ item.note }}</small>
    </article>
  </section>
</template>

<style scoped>
.kpi-cards {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.kpi-card {
  align-items: flex-start;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: grid;
  gap: 4px;
  padding: 14px 16px;
}

.kpi-card-icon {
  align-items: center;
  background: #f1f5f9;
  border-radius: 999px;
  color: var(--color-primary, #2563eb);
  display: inline-flex;
  height: 32px;
  justify-content: center;
  width: 32px;
}

.kpi-card--new .kpi-card-icon { background: #dbeafe; color: #1d4ed8; }
.kpi-card--rise .kpi-card-icon { background: #dcfce7; color: #166534; }
.kpi-card--fall .kpi-card-icon { background: #fee2e2; color: #991b1b; }
.kpi-card--activity .kpi-card-icon { background: #ffedd5; color: #b45309; }
.kpi-card--price .kpi-card-icon { background: #fef3c7; color: #92400e; }
.kpi-card--brand .kpi-card-icon { background: #ede9fe; color: #6d28d9; }

.kpi-card-value {
  color: var(--text-primary, #0f172a);
  font-size: 28px;
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
  font-size: 12px;
  font-weight: 600;
}

.kpi-card-delta.is-up { color: #166534; }
.kpi-card-delta.is-down { color: #991b1b; }
.kpi-card-delta.is-flat { color: var(--text-muted, #64748b); }
.kpi-card-delta.is-none { color: var(--text-muted, #94a3b8); }

.kpi-card-note {
  color: var(--text-muted, #64748b);
  font-size: 11.5px;
  margin-top: 2px;
}

@media (max-width: 880px) {
  .kpi-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>