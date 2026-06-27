<script setup lang="ts">
import { computed } from "vue";
import { AlertTriangle, ChevronRight, TrendingDown, TrendingUp } from "@lucide/vue";
import type { LaneEvent, ReviewGrowthBrandTotal } from "../../composables/useCategoryDailyBriefing";

interface Props {
  reviewGrowthTopBrands: ReviewGrowthBrandTotal[];
  priceDropTopItems: LaneEvent[];
  fadingAlertItems: LaneEvent[];
}

interface Emits {
  (e: "jump-to-board", payload: { brand: string | null }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const reviewLabel = computed(() =>
  props.reviewGrowthTopBrands.length === 0
    ? "暂无增长"
    : props.reviewGrowthTopBrands
        .map((item) => `${item.brand} (+${item.totalGrowth})`)
        .join(" · ")
);

const priceLabel = computed(() =>
  props.priceDropTopItems.length === 0
    ? "暂无下降"
    : props.priceDropTopItems
        .map((item) => {
          const rate = item.event.priceChangeRate;
          if (rate === null || rate === undefined) return item.asin ?? item.brand;
          return `${item.brand} ${(rate * 100).toFixed(1)}%`;
        })
        .join(" · ")
);

const riskLabel = computed(() =>
  props.fadingAlertItems.length === 0
    ? "近期无 Fading 风险事件"
    : props.fadingAlertItems
        .slice(0, 3)
        .map((item) => item.asin ?? item.brand)
        .join(" · ")
);

const reviewLeadBrand = computed(() => props.reviewGrowthTopBrands[0]?.brand ?? null);

function jumpToBoard(brand: string | null): void {
  emit("jump-to-board", { brand });
}
</script>

<template>
  <section class="insight-strip">
    <button
      type="button"
      class="insight-strip-item"
      :title="reviewLeadBrand ? `跳到 BSR 榜单（${reviewLeadBrand}）` : '跳到 BSR 榜单'"
      @click="jumpToBoard(reviewLeadBrand)"
    >
      <span class="insight-strip-icon is-rise">
        <TrendingUp :size="14" />
      </span>
      <div class="insight-strip-body">
        <small>Review 增长 Top 品牌</small>
        <strong>{{ reviewLabel }}</strong>
      </div>
      <ChevronRight :size="14" class="insight-strip-arrow" />
    </button>
    <button
      type="button"
      class="insight-strip-item"
      title="跳到 BSR 榜单（仅看有活动）"
      @click="jumpToBoard(null)"
    >
      <span class="insight-strip-icon is-price">
        <TrendingDown :size="14" />
      </span>
      <div class="insight-strip-body">
        <small>价格下降最多</small>
        <strong>{{ priceLabel }}</strong>
      </div>
      <ChevronRight :size="14" class="insight-strip-arrow" />
    </button>
    <button
      type="button"
      class="insight-strip-item"
      title="跳到 BSR 榜单"
      @click="jumpToBoard(null)"
    >
      <span class="insight-strip-icon is-risk">
        <AlertTriangle :size="14" />
      </span>
      <div class="insight-strip-body">
        <small>近期风险提示</small>
        <strong>{{ riskLabel }}</strong>
      </div>
      <ChevronRight :size="14" class="insight-strip-arrow" />
    </button>
  </section>
</template>

<style scoped>
.insight-strip {
  align-items: stretch;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 12px 14px;
}

.insight-strip-item {
  align-items: center;
  background: transparent;
  border: none;
  border-right: 1px dashed var(--border-color);
  color: inherit;
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 4px 12px 4px 4px;
  text-align: left;
  transition: background 0.12s ease;
  width: 100%;
}

.insight-strip-item:hover {
  background: #f8fafc;
}

.insight-strip-item:focus-visible {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: -2px;
}

.insight-strip-item:last-child {
  border-right: none;
}

.insight-strip-icon {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  width: 28px;
}

.insight-strip-icon.is-rise { background: #dcfce7; color: #166534; }
.insight-strip-icon.is-price { background: #fef3c7; color: #92400e; }
.insight-strip-icon.is-risk { background: #fee2e2; color: #991b1b; }

.insight-strip-body {
  min-width: 0;
}

.insight-strip-body small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11px;
}

.insight-strip-body strong {
  color: var(--text-primary, #0f172a);
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.insight-strip-arrow {
  color: var(--text-muted, #94a3b8);
}

@media (max-width: 880px) {
  .insight-strip {
    grid-template-columns: 1fr;
  }
  .insight-strip-item {
    border-right: none;
    border-bottom: 1px dashed var(--border-color);
    padding: 8px 4px;
  }
  .insight-strip-item:last-child {
    border-bottom: none;
  }
}
</style>