<script setup lang="ts">
// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
import { computed } from "vue";
import { storeToRefs } from "pinia";
import type { AsinWatchLevel, AsinWatchState, InsightEvent, InsightEventStatus, InsightReviewResult } from "@amazon-monitor/shared";
import { useInsightEventsStore } from "../../../stores/insightEvents";
import ActionCenterVariantA from "./variants/ActionCenterVariantA.vue";
import ActionCenterVariantB from "./variants/ActionCenterVariantB.vue";
import ActionCenterVariantC from "./variants/ActionCenterVariantC.vue";
import PrototypeSwitcher from "./PrototypeSwitcher.vue";
import { usePrototypeVariant } from "./usePrototypeVariant";

defineProps<{ date: string }>();

const { variant, set, labels, variants } = usePrototypeVariant();
const store = useInsightEventsStore();
const { visibleEvents, reviewDueEvents, watchStates, loading, generating, reviewing,
  selectedEvent, p0Count, p1Count, todoCount, reviewedConfirmedCount, coreRiskCount } = storeToRefs(store);

const watchingCount = computed(() => watchStates.value.filter((state) => state.watchLevel !== "IGNORED").length);

const selectedWatchState = computed<AsinWatchState | null>(() => {
  const asin = selectedEvent.value?.asin;
  return asin ? watchStates.value.find((state) => state.asin === asin) ?? null : null;
});

// --- shared event handlers, dispatched to whichever variant triggers them ---

async function selectEvent(event: InsightEvent): Promise<void> {
  selectedEvent.value = event;
  await store.loadEventDetail(event.id);
}

async function closeDrawer(): Promise<void> {
  selectedEvent.value = null;
}

async function updateStatus(id: string, status: InsightEventStatus, reviewDueDate?: string | null): Promise<void> {
  await store.setStatus(id, status, reviewDueDate);
}

async function updateNote(id: string, note: string): Promise<void> {
  await store.setNote(id, note);
}

async function watchEvent(id: string): Promise<void> {
  await store.watchEvent(id);
}

async function updateWatchState(event: InsightEvent, level: AsinWatchLevel): Promise<void> {
  await store.setWatchState(event, level);
}

async function reviewEvent(id: string, result: InsightReviewResult, note?: string | null): Promise<void> {
  await store.reviewEvent(id, result, note);
}

async function generate(date: string): Promise<void> {
  await store.generateEvents(date);
}

async function evaluateDueReviews(date: string): Promise<void> {
  await store.evaluateReviewDueEvents(date);
}

// Wrapped so template expressions don't need `import.meta` (Vite's vue
// plugin parses template expressions with a non-module sourceType).
const isDev = import.meta.env.DEV;
</script>

<template>
  <section class="ac-prototype">
    <header class="ac-prototype-head">
      <div>
        <span>Action Center · PROTOTYPE</span>
        <h2>{{ labels[variant] }}</h2>
        <p>3 个 variants 通过 ?variant= 切换;生产构建不会带这些代码</p>
      </div>
      <div class="ac-prototype-actions">
        <button class="secondary" type="button" :disabled="reviewing || reviewDueEvents.length === 0" @click="evaluateDueReviews(date)">
          <span>{{ reviewing ? "复盘中" : "自动复盘" }}</span>
        </button>
        <button class="primary" type="button" :disabled="generating" @click="generate(date)">
          <span>{{ generating ? "生成中" : "生成洞察" }}</span>
        </button>
      </div>
    </header>

    <ActionCenterVariantA
      v-if="variant === 'A'"
      :events="visibleEvents"
      :review-due-events="reviewDueEvents"
      :loading="loading"
      :p0-count="p0Count"
      :p1-count="p1Count"
      :todo-count="todoCount"
      :watching-count="watchingCount"
      :review-due-count="reviewDueEvents.length"
      :confirmed-count="reviewedConfirmedCount"
      :core-risk-count="coreRiskCount"
      :selected-event="selectedEvent"
      :selected-watch-state="selectedWatchState"
      @select="selectEvent"
      @close="closeDrawer"
      @status="updateStatus"
      @note="updateNote"
      @watch="watchEvent"
      @watch-state="updateWatchState"
      @review="reviewEvent"
    />

    <ActionCenterVariantB
      v-else-if="variant === 'B'"
      :events="visibleEvents"
      :review-due-events="reviewDueEvents"
      :loading="loading"
      :selected-event="selectedEvent"
      :selected-watch-state="selectedWatchState"
      @select="selectEvent"
      @close="closeDrawer"
      @status="updateStatus"
      @note="updateNote"
      @watch="watchEvent"
      @watch-state="updateWatchState"
      @review="reviewEvent"
    />

    <ActionCenterVariantC
      v-else
      :events="visibleEvents"
      :review-due-events="reviewDueEvents"
      :loading="loading"
      :p0-count="p0Count"
      :p1-count="p1Count"
      :todo-count="todoCount"
      :review-due-count="reviewDueEvents.length"
      :confirmed-count="reviewedConfirmedCount"
      :selected-event="selectedEvent"
      :selected-watch-state="selectedWatchState"
      @select="selectEvent"
      @close="closeDrawer"
      @status="updateStatus"
      @note="updateNote"
      @watch="watchEvent"
      @watch-state="updateWatchState"
      @review="reviewEvent"
    />

    <PrototypeSwitcher
      v-if="isDev"
      :current="variant"
      :variants="variants"
      :labels="labels"
      @select="set"
    />
  </section>
</template>

<style scoped>
.ac-prototype {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 18px 18px 96px;
}

.ac-prototype-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.ac-prototype-head span {
  color: var(--text-muted, #94a3b8);
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ac-prototype-head h2 {
  color: var(--text-primary, #0f172a);
  font-size: 20px;
  line-height: 1.2;
  margin: 4px 0 0;
}

.ac-prototype-head p {
  color: var(--text-secondary, #475569);
  font-size: 12.5px;
  margin: 4px 0 0;
}

.ac-prototype-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

button.primary,
button.secondary {
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: 8px;
  padding: 8px 12px;
}

button.primary {
  background: #0f172a;
  border-color: #0f172a;
  color: #ffffff;
}

button.secondary {
  background: var(--bg-surface, #ffffff);
  color: var(--text-primary, #0f172a);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
