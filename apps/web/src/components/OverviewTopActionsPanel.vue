<script setup lang="ts">
import { computed } from "vue";
import {
  Flame,
  Info,
  ListChecks,
  ShoppingBag,
  Sparkles,
  TrendingUp
} from "@lucide/vue";
import {
  insightEventTypeLabels,
  type InsightEvent,
  type InsightEventType
} from "@amazon-monitor/shared";
import InsightScoreBadge from "./action-center/InsightScoreBadge.vue";

const props = defineProps<{
  events: InsightEvent[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (event: "open-asin", value: InsightEvent): void;
}>();

const ICONS: Partial<Record<InsightEventType, typeof Flame>> = {
  RANK_SURGE: TrendingUp,
  RANK_DROP: TrendingUp,
  PRICE_DROP: ShoppingBag,
  COUPON_ADDED: ShoppingBag,
  NEW_PRODUCT_BREAKOUT: Sparkles,
  LOW_REVIEW_HIGH_RANK: Sparkles,
  CORE_COMPETITOR_RISK: Flame,
  BRAND_MATRIX_SURGE: Flame
};

function iconFor(type: InsightEventType) {
  return ICONS[type] ?? Info;
}

function describeEvent(event: InsightEvent): string {
  const { eventTitle, evidence } = event;
  const fragments: string[] = [eventTitle];
  if (typeof evidence.rankChange === "number" && evidence.rankChange !== 0) {
    fragments.push(`排名变化 ${evidence.rankChange > 0 ? "+" : ""}${evidence.rankChange}`);
  }
  if (typeof evidence.priceChangeRate === "number" && evidence.priceChangeRate !== 0) {
    fragments.push(`价格 ${(evidence.priceChangeRate * 100).toFixed(1)}%`);
  }
  return fragments.join(" · ");
}
</script>

<template>
  <section class="top-actions-panel">
    <header class="top-actions-head">
      <ListChecks :size="18" />
      <div>
        <span>今日必看</span>
        <h2>今日必须关注 {{ events.length }} 件事</h2>
      </div>
    </header>

    <div v-if="loading" class="top-actions-loading">正在汇总今日关键事件...</div>

    <div v-else-if="events.length === 0" class="top-actions-empty">
      <Info :size="24" />
      <p>今日暂无重点事件。系统会在新事件触发时自动汇总。</p>
      <small>提示：先到 Action Center 点击「生成洞察」刷新事件池。</small>
    </div>

    <ol v-else class="top-actions-list">
      <li v-for="(event, index) in events" :key="event.id" :class="['top-action-card', `level-${event.eventLevel}`]">
        <div class="rank">{{ index + 1 }}</div>
        <component :is="iconFor(event.eventType)" :size="22" class="action-icon" />
        <div class="action-body">
          <div class="action-topline">
            <span :class="['level-pill', `level-pill-${event.eventLevel}`]">{{ event.eventLevel }}</span>
            <span class="event-type">{{ insightEventTypeLabels[event.eventType] }}</span>
            <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
          </div>
          <h3>{{ event.brand || "未知品牌" }} · {{ event.asin || "品牌事件" }}</h3>
          <p>{{ describeEvent(event) }}</p>
          <p v-if="event.suggestedAction" class="suggested">建议：{{ event.suggestedAction }}</p>
        </div>
        <button class="action-button" type="button" @click="emit('open-asin', event)">查看 →</button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.top-actions-panel {
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  border: 1px solid #d9e2ec;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 18px;
  padding: 18px;
}

.top-actions-head {
  align-items: center;
  display: flex;
  gap: 12px;
}

.top-actions-head svg {
  color: #0f766e;
}

.top-actions-head span {
  color: #64748b;
  display: block;
  font-size: 12px;
}

.top-actions-head h2 {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.3;
  margin: 3px 0 0;
}

.top-actions-loading,
.top-actions-empty {
  align-items: center;
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px;
  text-align: center;
}

.top-actions-empty small {
  color: #94a3b8;
}

.top-actions-list {
  display: grid;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.top-action-card {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-left: 4px solid #94a3b8;
  border-radius: 10px;
  display: grid;
  gap: 12px;
  grid-template-columns: 32px auto minmax(0, 1fr) auto;
  padding: 12px 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.top-action-card:hover {
  border-color: #94a3b8;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.top-action-card.level-P0 {
  border-left-color: #b91c1c;
}

.top-action-card.level-P1 {
  border-left-color: #c2410c;
}

.top-action-card.level-P2 {
  border-left-color: #0e7490;
}

.rank {
  align-items: center;
  background: #0f172a;
  border-radius: 999px;
  color: #ffffff;
  display: flex;
  font-size: 13px;
  font-weight: 700;
  height: 28px;
  justify-content: center;
  width: 28px;
}

.action-icon {
  color: #0f766e;
}

.action-body h3 {
  color: #0f172a;
  font-size: 14px;
  margin: 6px 0 4px;
}

.action-body p {
  color: #475569;
  font-size: 13px;
  margin: 0;
}

.action-body .suggested {
  color: #0f766e;
  font-weight: 500;
}

.action-topline {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.level-pill,
.event-type {
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 8px;
}

.level-pill-P0 {
  background: #fee2e2;
  color: #991b1b;
}

.level-pill-P1 {
  background: #ffedd5;
  color: #9a3412;
}

.level-pill-P2 {
  background: #e0f2fe;
  color: #075985;
}

.event-type {
  background: #f1f5f9;
  color: #334155;
}

.action-button {
  align-self: stretch;
  background: #0f766e;
  border: none;
  border-radius: 8px;
  color: #ffffff;
  font-size: 13px;
  padding: 8px 14px;
}

.action-button:hover {
  background: #115e59;
}

@media (max-width: 760px) {
  .top-action-card {
    grid-template-columns: 28px auto minmax(0, 1fr);
  }

  .action-button {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
}
</style>