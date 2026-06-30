<script setup lang="ts">
import { computed } from "vue";
import { ExternalLink, X } from "@lucide/vue";
import type {
  AsinWatchLevel,
  AsinWatchState,
  BrandPlaybookProfile,
  InsightEvent,
  InsightEventStatus,
  InsightReviewResult,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { inferInsightEventStrategyTags } from "@amazon-monitor/shared";
import AttributionTags from "./AttributionTags.vue";
import BrandPlaybookCard from "./BrandPlaybookCard.vue";
import InsightEventActionPanel from "./InsightEventActionPanel.vue";
import InsightScoreBadge from "./InsightScoreBadge.vue";
import PriceTimelineCard from "./PriceTimelineCard.vue";
import StrategyTags from "./StrategyTags.vue";

const props = withDefaults(defineProps<{
  event: InsightEvent | null;
  watchState: AsinWatchState | null;
  brandPlaybook?: BrandPlaybookProfile | null;
  brandPlaybookLoading?: boolean;
  priceHistory?: ProductPriceHistory[];
  priceHistoryLoading?: boolean;
}>(), {
  brandPlaybook: null,
  brandPlaybookLoading: false,
  priceHistory: () => [],
  priceHistoryLoading: false
});

const emit = defineEmits<{
  (event: "close"): void;
  (event: "status", id: string, status: InsightEventStatus, reviewDueDate?: string | null): void;
  (event: "note", id: string, note: string): void;
  (event: "assignee", id: string, assignee: string | null): void;
  (event: "watch", id: string): void;
  (event: "watch-state", insight: InsightEvent, level: AsinWatchLevel): void;
  (event: "review", id: string, result: InsightReviewResult, note?: string | null): void;
}>();

const strategyTags = computed(() => props.event ? inferInsightEventStrategyTags(props.event) : []);

const scoreRows = computed(() => {
  const breakdown = props.event?.scoreBreakdown;
  if (!breakdown) {
    return [];
  }
  return [
    ["排名", breakdown.rankingScore],
    ["商品", breakdown.productScore],
    ["活动", breakdown.promoScore],
    ["品牌", breakdown.brandScore],
    ["风险", breakdown.riskScore]
  ];
});

function emitStatus(id: string, status: InsightEventStatus, reviewDueDate?: string | null): void {
  emit("status", id, status, reviewDueDate);
}

function emitNote(id: string, note: string): void {
  emit("note", id, note);
}

function emitAssignee(id: string, assignee: string | null): void {
  emit("assignee", id, assignee);
}

function emitWatch(id: string): void {
  emit("watch", id);
}

function emitWatchState(insight: InsightEvent, level: AsinWatchLevel): void {
  emit("watch-state", insight, level);
}

function emitReview(id: string, result: InsightReviewResult, note?: string | null): void {
  emit("review", id, result, note);
}

function openProduct(): void {
  const url = props.event?.evidence.productUrl;
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <div v-if="event" class="drawer-backdrop" @click="emit('close')"></div>
  <aside v-if="event" class="event-drawer" @click.stop>
    <button class="icon-button drawer-close" type="button" aria-label="关闭" @click="emit('close')">
      <X :size="18" />
    </button>

    <div class="drawer-title">
      <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
      <div>
        <span>{{ event.eventLevel }} / {{ event.eventType }}</span>
        <h2>{{ event.eventTitle }}</h2>
        <p>{{ event.brand || "未知品牌" }} / {{ event.asin || "品牌事件" }}</p>
      </div>
    </div>

    <img v-if="event.evidence.imageUrl" class="drawer-image" :src="event.evidence.imageUrl" :alt="event.eventTitle" loading="lazy" decoding="async" />

    <section class="drawer-section">
      <h3>归因</h3>
      <AttributionTags :tags="event.attributionTags" />
      <div v-if="strategyTags.length" class="strategy-tag-block">
        <small>策略标签</small>
        <StrategyTags :tags="strategyTags" />
      </div>
      <p>{{ event.eventSummary }}</p>
    </section>

    <section class="drawer-section">
      <h3>证据</h3>
      <dl class="evidence-grid">
        <div><dt>BSR</dt><dd>{{ event.evidence.previousRank ? `#${event.evidence.previousRank}` : "-" }} -> {{ event.evidence.currentRank ? `#${event.evidence.currentRank}` : "-" }}</dd></div>
        <div><dt>价格</dt><dd>{{ event.evidence.priceBefore ?? "-" }} -> {{ event.evidence.priceAfter ?? "-" }}</dd></div>
        <div><dt>Review</dt><dd>{{ event.evidence.reviewCountBefore ?? "-" }} -> {{ event.evidence.reviewCountAfter ?? "-" }}</dd></div>
        <div><dt>复盘日</dt><dd>{{ event.reviewDueDate || "-" }}</dd></div>
        <div v-if="event.evidence.dealType || event.evidence.couponBefore || event.evidence.couponAfter"><dt>活动</dt><dd>{{ event.evidence.dealType || event.evidence.couponBefore || event.evidence.couponAfter }}</dd></div>
      </dl>
      <ul>
        <li v-for="item in event.evidence.evidenceItems" :key="item">{{ item }}</li>
      </ul>
    </section>

    <PriceTimelineCard
      v-if="event.asin"
      class="drawer-section"
      :rows="priceHistory"
      :loading="priceHistoryLoading"
    />

    <BrandPlaybookCard
      v-if="event.brand && event.categoryId !== null"
      class="drawer-section"
      :profile="brandPlaybook"
      :loading="brandPlaybookLoading"
    />

    <section class="drawer-section">
      <h3>评分拆解</h3>
      <div class="score-breakdown">
        <span v-for="[label, value] in scoreRows" :key="label">
          <small>{{ label }}</small>
          <strong>{{ value }}</strong>
        </span>
      </div>
      <p>{{ event.scoreBreakdown.reasons.join("，") || "暂无评分原因" }}</p>
    </section>

    <InsightEventActionPanel
      :event="event"
      :watch-state="watchState"
      @status="emitStatus"
      @note="emitNote"
      @assignee="emitAssignee"
      @watch="emitWatch"
      @watch-state="emitWatchState"
      @review="emitReview"
    />

    <button v-if="event.evidence.productUrl" class="drawer-link" type="button" @click="openProduct">
      <ExternalLink :size="16" />
      <span>打开 Amazon</span>
    </button>
  </aside>
</template>

<style scoped>
.drawer-backdrop {
  background: rgba(15, 23, 42, 0.32);
  inset: 0;
  position: fixed;
  z-index: 40;
}

.event-drawer {
  background: #ffffff;
  border-left: 1px solid #d9e2ec;
  bottom: 0;
  box-shadow: -12px 0 32px rgba(15, 23, 42, 0.14);
  overflow-y: auto;
  padding: 22px;
  position: fixed;
  right: 0;
  top: 0;
  width: min(520px, 100vw);
  z-index: 41;
}

.drawer-close {
  position: absolute;
  right: 14px;
  top: 14px;
}

.drawer-title {
  align-items: center;
  display: grid;
  gap: 14px;
  grid-template-columns: auto minmax(0, 1fr);
  padding-right: 32px;
}

.drawer-title span {
  color: #64748b;
  font-size: 12px;
}

.drawer-title h2 {
  color: #0f172a;
  font-size: 20px;
  line-height: 1.25;
  margin: 4px 0;
}

.drawer-title p,
.drawer-section p {
  color: #475569;
  line-height: 1.6;
  margin: 6px 0 0;
}

.drawer-image {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  height: 180px;
  margin-top: 18px;
  object-fit: contain;
  width: 100%;
}

.drawer-section {
  border-top: 1px solid #e2e8f0;
  margin-top: 18px;
  padding-top: 16px;
}

.drawer-section h3 {
  color: #0f172a;
  font-size: 15px;
  margin: 0 0 10px;
}

.strategy-tag-block {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.strategy-tag-block > small {
  color: #64748b;
}

.evidence-grid,
.score-breakdown {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.evidence-grid div,
.score-breakdown span {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
}

.evidence-grid dt,
.score-breakdown small {
  color: #64748b;
  display: block;
  font-size: 12px;
}

.evidence-grid dd,
.score-breakdown strong {
  color: #0f172a;
  font-weight: 700;
  margin: 4px 0 0;
}

ul {
  color: #475569;
  margin: 10px 0 0;
  padding-left: 18px;
}

button {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  padding: 8px 10px;
}

.drawer-link {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 18px;
  width: 100%;
}
</style>
