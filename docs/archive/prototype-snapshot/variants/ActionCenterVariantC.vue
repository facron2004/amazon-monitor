<script setup lang="ts">
// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
// Variant C — Master-detail docked. Layout changes from the production view:
//   - KPI row collapses to 5 inline counts (severity + status, no grid 7-col)
//   - Event list rows are ~80px (badge 40px + 48px image + meta + pill)
//   - Right column is a docked detail panel (always visible on >=1180px)
//   - Below 1180px, falls back to the existing drawer (InsightEventDrawer)
import { computed, ref } from "vue";
import {
  insightEventStatusLabels,
  insightEventTypeLabels,
  type AsinWatchLevel,
  type AsinWatchState,
  type InsightEvent,
  type InsightEventStatus,
  type InsightReviewResult
} from "@amazon-monitor/shared";
import { AlertTriangle, CheckCircle2, Clock3, ListTodo, SignalHigh } from "@lucide/vue";
import PrototypeKpiRow, { type PrototypeKpiItem } from "../shared/PrototypeKpiRow.vue";
import InsightEventDrawerDocked from "../shared/InsightEventDrawerDocked.vue";
import InsightEventDrawer from "../../InsightEventDrawer.vue";

const props = defineProps<{
  events: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  loading: boolean;
  p0Count: number;
  p1Count: number;
  todoCount: number;
  reviewDueCount: number;
  confirmedCount: number;
  selectedEvent: InsightEvent | null;
  selectedWatchState: AsinWatchState | null;
}>();

const emit = defineEmits<{
  (event: "select", value: InsightEvent): void;
  (event: "close"): void;
  (event: "status", id: string, status: InsightEventStatus, reviewDueDate?: string | null): void;
  (event: "note", id: string, note: string): void;
  (event: "watch", id: string): void;
  (event: "watch-state", insight: InsightEvent, level: AsinWatchLevel): void;
  (event: "review", id: string, result: InsightReviewResult, note?: string | null): void;
}>();

// Drawer mode is runtime-detected (window resize). Match the project's 1180px
// breakpoint — same one the production view uses for its 2-col → 1-col collapse.
const isWide = ref(typeof window !== "undefined" ? window.innerWidth >= 1180 : true);
if (typeof window !== "undefined") {
  window.addEventListener("resize", () => {
    isWide.value = window.innerWidth >= 1180;
  });
}

const kpis = computed<PrototypeKpiItem[]>(() => [
  { key: "p0", label: "今日 P0", value: props.p0Count, icon: AlertTriangle },
  { key: "p1", label: "今日 P1", value: props.p1Count, icon: SignalHigh },
  { key: "todo", label: "待处理", value: props.todoCount, icon: ListTodo },
  { key: "review", label: "待复盘", value: props.reviewDueCount, icon: Clock3 },
  { key: "confirmed", label: "已验证", value: props.confirmedCount, icon: CheckCircle2 }
]);

function rankPath(event: InsightEvent): string {
  const previous = event.evidence.previousRank ? `#${event.evidence.previousRank}` : "-";
  const current = event.evidence.currentRank ? `#${event.evidence.currentRank}` : "-";
  return `${previous} → ${current}`;
}

function rankDelta(event: InsightEvent): string {
  const value = event.evidence.rankChange;
  if (value === null || value === undefined) return "—";
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "持平";
}

function reviewDelta(event: InsightEvent): string | null {
  const value = event.evidence.reviewCountChange;
  if (value === null || value === undefined) return null;
  if (value > 0) return `+${value} reviews`;
  if (value < 0) return `${value} reviews`;
  return "0 reviews";
}
</script>

<template>
  <div class="variant-c">
    <PrototypeKpiRow :items="kpis" />

    <div class="variant-c-body">
      <section class="variant-c-list">
        <header class="variant-c-list-head">
          <h3>事件列表 · {{ events.length }}</h3>
          <small v-if="loading">加载中...</small>
        </header>
        <div v-if="events.length" class="variant-c-rows">
          <article
            v-for="event in events"
            :key="event.id"
            class="variant-c-row"
            :class="{ 'variant-c-row--selected': selectedEvent?.id === event.id }"
            @click="emit('select', event)"
          >
            <span class="variant-c-badge" :data-level="event.scoreLevel">{{ event.scoreTotal }}</span>
            <img v-if="event.evidence.imageUrl" class="variant-c-thumb" :src="event.evidence.imageUrl" :alt="event.eventTitle" loading="lazy" decoding="async" />
            <div v-else class="variant-c-thumb variant-c-thumb--fallback">ASIN</div>
            <div class="variant-c-main">
              <div class="variant-c-meta">
                <span class="variant-c-level" :data-level="event.eventLevel">{{ event.eventLevel }}</span>
                <span class="variant-c-type">{{ insightEventTypeLabels[event.eventType] }}</span>
                <span class="variant-c-status" :data-status="event.status">{{ insightEventStatusLabels[event.status] }}</span>
              </div>
              <h4>{{ event.eventTitle }}</h4>
              <small>{{ event.brand || "未知品牌" }} · {{ event.asin || "品牌事件" }}</small>
            </div>
            <div class="variant-c-data">
              <span>BSR {{ rankPath(event) }}</span>
              <strong>{{ rankDelta(event) }}</strong>
              <small v-if="reviewDelta(event)">{{ reviewDelta(event) }}</small>
            </div>
          </article>
        </div>
        <p v-else class="empty-copy">暂无洞察事件</p>
      </section>

      <section v-if="isWide" class="variant-c-detail">
        <InsightEventDrawerDocked
          :event="selectedEvent"
          :watch-state="selectedWatchState"
          @close="emit('close')"
          @status="(id: string, status: InsightEventStatus, due: string | null | undefined) => emit('status', id, status, due)"
          @note="(id: string, note: string) => emit('note', id, note)"
          @watch="(id: string) => emit('watch', id)"
          @watch-state="(insight: InsightEvent, level: AsinWatchLevel) => emit('watch-state', insight, level)"
          @review="(id: string, result: InsightReviewResult, note?: string | null) => emit('review', id, result, note ?? null)"
        />
      </section>
    </div>

    <InsightEventDrawer
      v-if="!isWide && selectedEvent"
      :event="selectedEvent"
      :watch-state="selectedWatchState"
      @close="emit('close')"
      @status="(id: string, status: InsightEventStatus, due: string | null | undefined) => emit('status', id, status, due)"
      @note="(id: string, note: string) => emit('note', id, note)"
      @watch="(id: string) => emit('watch', id)"
      @watch-state="(insight: InsightEvent, level: AsinWatchLevel) => emit('watch-state', insight, level)"
      @review="(id: string, result: InsightReviewResult, note?: string | null) => emit('review', id, result, note ?? null)"
    />
  </div>
</template>

<style scoped>
.variant-c {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.variant-c-body {
  display: grid;
  flex: 1 1 auto;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 1fr);
  min-height: 0;
}

.variant-c-list {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}

.variant-c-list-head {
  align-items: baseline;
  display: flex;
  justify-content: space-between;
}

.variant-c-list-head h3 {
  color: var(--text-primary, #0f172a);
  font-size: 15px;
  margin: 0;
}

.variant-c-list-head small {
  color: var(--text-muted, #64748b);
  font-size: 12px;
}

.variant-c-rows {
  display: grid;
  gap: 6px;
}

.variant-c-row {
  align-items: center;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  display: grid;
  gap: 10px;
  grid-template-columns: auto 48px minmax(0, 1fr) minmax(120px, 160px);
  min-height: 80px;
  padding: 10px 12px;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.variant-c-row:hover {
  background: #f1f5f9;
}

.variant-c-row--selected {
  background: var(--color-primary-light, rgba(37, 99, 235, 0.12));
  border-color: var(--color-primary-border, rgba(96, 165, 250, 0.4));
}

.variant-c-badge {
  align-items: center;
  aspect-ratio: 1;
  background: #f1f5f9;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary, #0f172a);
  display: inline-flex;
  flex-direction: column;
  font-size: 14px;
  font-weight: 700;
  height: 40px;
  justify-content: center;
}

.variant-c-badge[data-level="S"] {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.variant-c-badge[data-level="A"] {
  background: #ffedd5;
  border-color: #fdba74;
  color: #9a3412;
}

.variant-c-badge[data-level="B"],
.variant-c-badge[data-level="C"] {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
}

.variant-c-thumb {
  background: #eef2f7;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  height: 48px;
  object-fit: contain;
  width: 48px;
}

.variant-c-thumb--fallback {
  align-items: center;
  color: var(--text-muted, #64748b);
  display: flex;
  font-size: 10px;
  justify-content: center;
}

.variant-c-main {
  min-width: 0;
}

.variant-c-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.variant-c-level,
.variant-c-type,
.variant-c-status {
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 7px;
}

.variant-c-level[data-level="P0"] {
  background: #fee2e2;
  color: #991b1b;
}

.variant-c-level[data-level="P1"] {
  background: #ffedd5;
  color: #9a3412;
}

.variant-c-level[data-level="P2"] {
  background: #f1f5f9;
  color: #475569;
}

.variant-c-type {
  background: #e0f2fe;
  color: #075985;
}

.variant-c-status[data-status="TODO"] {
  background: #fef3c7;
  color: #92400e;
}

.variant-c-status[data-status="WATCHING"] {
  background: #dbeafe;
  color: #1e40af;
}

.variant-c-status[data-status="FOLLOWED"] {
  background: #dcfce7;
  color: #166534;
}

.variant-c-status[data-status="IGNORED"] {
  background: #f1f5f9;
  color: #64748b;
}

.variant-c-status[data-status="REVIEW_PENDING"] {
  background: #fae8ff;
  color: #6b21a8;
}

.variant-c-status[data-status="REVIEWED"] {
  background: #cffafe;
  color: #155e75;
}

.variant-c-main h4 {
  color: var(--text-primary, #0f172a);
  font-size: 13.5px;
  line-height: 1.3;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-c-main small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11.5px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-c-data {
  color: var(--text-muted, #64748b);
  display: grid;
  font-size: 12px;
  gap: 2px;
  justify-items: end;
  text-align: right;
}

.variant-c-data strong {
  color: var(--text-primary, #0f172a);
  font-size: 13px;
}

.empty-copy {
  color: var(--text-muted, #64748b);
  font-size: 13px;
  margin: 12px 0 0;
  text-align: center;
}

.variant-c-detail {
  min-height: 0;
}
</style>
