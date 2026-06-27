<script setup lang="ts">
import { computed } from "vue";
import { Activity, DollarSign, Tag } from "@lucide/vue";
import type { ProductPriceHistory } from "@amazon-monitor/shared";

const props = defineProps<{
  rows: ProductPriceHistory[];
  loading: boolean;
}>();

const descendingRows = computed(() => [...props.rows].sort((left, right) => right.snapshotDate.localeCompare(left.snapshotDate)));
const latest = computed(() => descendingRows.value[0] ?? null);
const recentRows = computed(() => descendingRows.value.slice(0, 8));
const chartRows = computed(() => [...descendingRows.value].reverse().slice(-14));
const maxChartPrice = computed(() => Math.max(...chartRows.value.map(effectivePrice).filter(isNumber), 0));

function effectivePrice(row: ProductPriceHistory): number | null {
  return row.finalEstimatedPrice ?? row.currentPrice;
}

function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `$${value.toFixed(2)}`;
}

function formatReview(value: number | null | undefined, change: number | null | undefined): string {
  const total = value === null || value === undefined ? "-" : String(value);
  if (change === null || change === undefined || change === 0) {
    return total;
  }
  return `${total} (${change > 0 ? "+" : ""}${change})`;
}

function promoText(row: ProductPriceHistory): string {
  return row.couponText || row.dealBadge || "-";
}

function barStyle(row: ProductPriceHistory): { height: string } {
  const price = effectivePrice(row);
  if (!price || maxChartPrice.value <= 0) {
    return { height: "10px" };
  }
  return { height: `${Math.max(10, Math.round((price / maxChartPrice.value) * 54))}px` };
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
</script>

<template>
  <section class="price-timeline-card">
    <header>
      <Activity :size="16" />
      <div>
        <h3>ASIN 价格时间线</h3>
        <small v-if="latest">{{ latest.snapshotDate }} · {{ rows.length }} 条记录</small>
      </div>
    </header>

    <p v-if="loading" class="muted">时间线加载中...</p>
    <p v-else-if="rows.length === 0" class="muted">暂无价格历史证据</p>
    <template v-else>
      <div class="timeline-kpis">
        <span>
          <DollarSign :size="14" />
          <small>当前价</small>
          <strong>{{ formatMoney(latest?.currentPrice) }}</strong>
        </span>
        <span>
          <Tag :size="14" />
          <small>到手价</small>
          <strong>{{ formatMoney(latest ? effectivePrice(latest) : null) }}</strong>
        </span>
        <span>
          <small>Review</small>
          <strong>{{ formatReview(latest?.reviewCount, latest?.reviewCountChange) }}</strong>
        </span>
      </div>

      <div class="price-bars" aria-label="price timeline">
        <span
          v-for="row in chartRows"
          :key="`${row.snapshotDate}-${row.asin}`"
          :style="barStyle(row)"
          :title="`${row.snapshotDate}: ${formatMoney(effectivePrice(row))}`"
        ></span>
      </div>

      <div class="timeline-rows">
        <article v-for="row in recentRows" :key="`${row.snapshotDate}-${row.asin}`">
          <time>{{ row.snapshotDate.slice(5) }}</time>
          <strong>{{ formatMoney(effectivePrice(row)) }}</strong>
          <small>{{ promoText(row) }}</small>
          <em>{{ formatReview(row.reviewCount, row.reviewCountChange) }}</em>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.price-timeline-card {
  display: grid;
  gap: 10px;
}

.price-timeline-card > header {
  align-items: center;
  color: #0f172a;
  display: flex;
  gap: 8px;
}

.price-timeline-card h3 {
  font-size: 15px;
  margin: 0;
}

.price-timeline-card small,
.muted,
.timeline-rows em {
  color: #64748b;
  font-size: 12px;
}

.muted {
  margin: 0;
}

.timeline-kpis {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.timeline-kpis span {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
}

.timeline-kpis svg {
  color: #0f766e;
}

.timeline-kpis strong,
.timeline-rows strong {
  color: #0f172a;
  font-weight: 700;
}

.price-bars {
  align-items: end;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 3px;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  height: 70px;
  padding: 8px;
}

.price-bars span {
  background: linear-gradient(180deg, #14b8a6, #0f766e);
  border-radius: 4px 4px 2px 2px;
  min-width: 4px;
}

.timeline-rows {
  display: grid;
  gap: 6px;
}

.timeline-rows article {
  align-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  grid-template-columns: 48px 70px minmax(0, 1fr) auto;
  min-height: 36px;
  padding: 7px 9px;
}

.timeline-rows time {
  color: #475569;
  font-size: 12px;
}

.timeline-rows small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
