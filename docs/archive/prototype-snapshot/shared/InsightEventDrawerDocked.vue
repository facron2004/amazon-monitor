<script setup lang="ts">
// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
// Forked from action-center/InsightEventDrawer.vue. Identical body + emits;
// only the wrapper positioning and image height changed (fixed → static,
// shadow removed, image locked to 140px to keep docked panel from jumping).
import { computed, ref, watch } from "vue";
import { ExternalLink } from "@lucide/vue";
import type { AsinWatchLevel, AsinWatchState, InsightEvent, InsightEventStatus, InsightReviewResult } from "@amazon-monitor/shared";
import { inferInsightEventStrategyTags } from "@amazon-monitor/shared";
import AttributionTags from "../../AttributionTags.vue";
import InsightScoreBadge from "../../InsightScoreBadge.vue";
import StrategyTags from "../../StrategyTags.vue";
import WatchStateSelector from "../../WatchStateSelector.vue";

const props = defineProps<{
  event: InsightEvent | null;
  watchState: AsinWatchState | null;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "status", id: string, status: InsightEventStatus, reviewDueDate?: string | null): void;
  (event: "note", id: string, note: string): void;
  (event: "watch", id: string): void;
  (event: "watch-state", insight: InsightEvent, level: AsinWatchLevel): void;
  (event: "review", id: string, result: InsightReviewResult, note?: string | null): void;
}>();

const noteDraft = ref("");
const reviewResult = ref<InsightReviewResult>("CONFIRMED");
const reviewDateDraft = ref("");

watch(
  () => props.event?.id,
  () => {
    noteDraft.value = props.event?.userNote ?? "";
    reviewResult.value = props.event?.reviewResult ?? "CONFIRMED";
    reviewDateDraft.value = props.event?.reviewDueDate ?? "";
  },
  { immediate: true }
);

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

function saveNote(): void {
  if (props.event) {
    emit("note", props.event.id, noteDraft.value);
  }
}

function scheduleReview(): void {
  if (props.event && reviewDateDraft.value) {
    emit("status", props.event.id, "REVIEW_PENDING", reviewDateDraft.value);
  }
}

function openProduct(): void {
  const url = props.event?.evidence.productUrl;
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <aside v-if="event" class="event-drawer-docked">
    <div class="drawer-title">
      <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
      <div>
        <span>{{ event.eventLevel }} · {{ event.eventType }}</span>
        <h2>{{ event.eventTitle }}</h2>
        <p>{{ event.brand || "未知品牌" }} · {{ event.asin || "品牌事件" }}</p>
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

    <section class="drawer-section">
      <h3>评分拆解</h3>
      <div class="score-breakdown">
        <span v-for="[label, value] in scoreRows" :key="label">
          <small>{{ label }}</small>
          <strong>{{ value }}</strong>
        </span>
      </div>
      <p>{{ event.scoreBreakdown.reasons.join("；") || "暂无评分原因" }}</p>
    </section>

    <section class="drawer-section">
      <h3>状态</h3>
      <div class="drawer-actions">
        <button type="button" @click="emit('status', event.id, 'FOLLOWED')">已跟进</button>
        <button type="button" @click="emit('watch', event.id)">观察</button>
        <button type="button" @click="emit('status', event.id, 'IGNORED')">忽略</button>
      </div>
      <WatchStateSelector
        v-if="event.asin"
        :state="watchState"
        @change="emit('watch-state', event, $event)"
      />
      <div class="review-date-row">
        <input v-model="reviewDateDraft" type="date" aria-label="复盘日期" />
        <button type="button" :disabled="!reviewDateDraft" @click="scheduleReview">设置复盘</button>
      </div>
      <textarea v-model="noteDraft" rows="4" placeholder="备注"></textarea>
      <button class="primary" type="button" @click="saveNote">保存备注</button>
    </section>

    <section class="drawer-section">
      <h3>复盘结论</h3>
      <div class="review-row">
        <select v-model="reviewResult">
          <option value="CONFIRMED">判断成立</option>
          <option value="REVERTED">短期回落</option>
          <option value="CONTINUING">仍在持续</option>
          <option value="FAILED">机会消失</option>
          <option value="UNCLEAR">数据不足</option>
        </select>
        <button type="button" @click="emit('review', event.id, reviewResult, noteDraft)">标记复盘</button>
      </div>
    </section>

    <button v-if="event.evidence.productUrl" class="drawer-link" type="button" @click="openProduct">
      <ExternalLink :size="16" />
      <span>打开 Amazon</span>
    </button>
  </aside>
  <div v-else class="event-drawer-empty">
    <p>从左侧列表选中一条事件,这里会展示完整归因与证据。</p>
  </div>
</template>

<style scoped>
.event-drawer-docked {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
}

.event-drawer-empty {
  align-items: center;
  background: #f8fafc;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  color: var(--text-muted, #64748b);
  display: flex;
  height: 100%;
  justify-content: center;
  padding: 24px;
  text-align: center;
}

.event-drawer-empty p {
  font-size: 13px;
  margin: 0;
  max-width: 220px;
}

.drawer-title {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: auto minmax(0, 1fr);
}

.drawer-title span {
  color: var(--text-muted, #64748b);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.drawer-title h2 {
  color: var(--text-primary, #0f172a);
  font-size: 18px;
  line-height: 1.25;
  margin: 4px 0;
}

.drawer-title p,
.drawer-section p {
  color: var(--text-secondary, #475569);
  line-height: 1.55;
  margin: 6px 0 0;
}

.drawer-image {
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  height: 140px; /* LOCKED — prevents docked panel from jumping between rows with/without image */
  object-fit: contain;
  width: 100%;
}

.drawer-section {
  border-top: 1px solid var(--border-color);
  padding-top: 14px;
}

.drawer-section h3 {
  color: var(--text-primary, #0f172a);
  font-size: 14px;
  margin: 0 0 10px;
}

.strategy-tag-block {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.strategy-tag-block > small {
  color: var(--text-muted, #64748b);
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
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 10px;
}

.evidence-grid dt,
.score-breakdown small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11.5px;
}

.evidence-grid dd,
.score-breakdown strong {
  color: var(--text-primary, #0f172a);
  font-weight: 700;
  margin: 4px 0 0;
}

ul {
  color: var(--text-secondary, #475569);
  margin: 10px 0 0;
  padding-left: 18px;
}

.drawer-actions,
.review-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.drawer-actions button,
.review-row select,
.review-row button,
.review-date-row button,
textarea,
input[type="date"] {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font: inherit;
  padding: 6px 10px;
}

button {
  background: var(--bg-surface, #ffffff);
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary {
  background: #0f172a !important;
  border-color: #0f172a !important;
  color: #ffffff;
  margin-top: 8px;
}

textarea,
.review-row select {
  margin-top: 8px;
  padding: 8px 10px;
  width: 100%;
}

.review-date-row {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-top: 8px;
}

.drawer-link {
  align-items: center;
  border: 1px solid var(--border-color) !important;
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 4px;
  padding: 8px !important;
  width: 100%;
}
</style>
