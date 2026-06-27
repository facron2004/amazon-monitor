<script setup lang="ts">
// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
// Variant A — Compact scan, no detail drawer.
//   - 52px table-style rows: badge · brand · title · 1 core BSR delta · status pill
//   - No images, no topline chips, no attribution tags
//   - Review queue moves from sidebar to horizontal strip under KPI
//   - Status/note/review actions expand inline (push row down) — never a drawer
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
import { AlertTriangle, CheckCircle2, Clock3, Eye, ListTodo, ShieldAlert, SignalHigh } from "@lucide/vue";
import PrototypeKpiRow, { type PrototypeKpiItem } from "../shared/PrototypeKpiRow.vue";

type ExpandedKey = string | null;

const props = defineProps<{
  events: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  loading: boolean;
  p0Count: number;
  p1Count: number;
  todoCount: number;
  watchingCount: number;
  reviewDueCount: number;
  confirmedCount: number;
  coreRiskCount: number;
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

const expandedId = ref<ExpandedKey>(null);
const inlineNote = ref("");
const inlineReview = ref<InsightReviewResult>("CONFIRMED");
const inlineReviewDate = ref("");

function toggleExpand(event: InsightEvent): void {
  if (expandedId.value === event.id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = event.id;
  inlineNote.value = event.userNote ?? "";
  inlineReview.value = event.reviewResult ?? "CONFIRMED";
  inlineReviewDate.value = event.reviewDueDate ?? "";
  // also surface in store so detail load happens (re-uses store.selectedEvent contract)
  emit("select", event);
}

function applyStatus(id: string, status: InsightEventStatus): void {
  emit("status", id, status, status === "REVIEW_PENDING" ? inlineReviewDate.value || null : null);
}

function applyNote(id: string): void {
  emit("note", id, inlineNote.value);
}

function applyReview(id: string): void {
  emit("review", id, inlineReview.value, inlineNote.value || null);
}

const primaryKpis = computed<PrototypeKpiItem[]>(() => [
  { key: "p0", label: "P0", value: props.p0Count, icon: AlertTriangle },
  { key: "p1", label: "P1", value: props.p1Count, icon: SignalHigh },
  { key: "todo", label: "待处理", value: props.todoCount, icon: ListTodo },
  { key: "confirmed", label: "已验证", value: props.confirmedCount, icon: CheckCircle2 }
]);

const secondaryKpis = computed<PrototypeKpiItem[]>(() => [
  { key: "watching", label: "观察中", value: props.watchingCount, icon: Eye, emphasis: "secondary" },
  { key: "review", label: "待复盘", value: props.reviewDueCount, icon: Clock3, emphasis: "secondary" },
  { key: "core", label: "核心风险", value: props.coreRiskCount, icon: ShieldAlert, emphasis: "secondary" }
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
</script>

<template>
  <div class="variant-a">
    <PrototypeKpiRow :items="primaryKpis" />
    <PrototypeKpiRow :items="secondaryKpis" />

    <section v-if="reviewDueEvents.length" class="variant-a-review-strip">
      <header><Clock3 :size="14" /><span>复盘队列 · {{ reviewDueEvents.length }}</span></header>
      <div class="variant-a-review-chips">
        <button
          v-for="event in reviewDueEvents.slice(0, 8)"
          :key="event.id"
          type="button"
          class="variant-a-review-chip"
          @click="toggleExpand(event)"
        >
          <span class="variant-a-review-chip-score" :data-level="event.scoreLevel">{{ event.scoreTotal }}</span>
          <span class="variant-a-review-chip-title">{{ event.eventTitle }}</span>
          <small>{{ event.reviewDueDate || "—" }}</small>
        </button>
      </div>
    </section>

    <section class="variant-a-list">
      <header class="variant-a-list-head">
        <h3>事件列表 · {{ events.length }}</h3>
        <small v-if="loading">加载中...</small>
      </header>
      <div v-if="events.length" class="variant-a-rows">
        <article
          v-for="event in events"
          :key="event.id"
          class="variant-a-row"
          :class="{ 'variant-a-row--expanded': expandedId === event.id }"
        >
          <button type="button" class="variant-a-row-main" @click="toggleExpand(event)">
            <span class="variant-a-badge" :data-level="event.scoreLevel">{{ event.scoreTotal }}</span>
            <span class="variant-a-row-brand">
              <b>{{ event.brand || "未知品牌" }}</b>
              <small>{{ event.asin || "品牌事件" }}</small>
            </span>
            <span class="variant-a-row-title">
              <span class="variant-a-level" :data-level="event.eventLevel">{{ event.eventLevel }}</span>
              <span>{{ event.eventTitle }}</span>
            </span>
            <span class="variant-a-row-data">
              <strong>{{ rankDelta(event) }}</strong>
              <small>{{ rankPath(event) }}</small>
            </span>
            <span class="variant-a-status" :data-status="event.status">{{ insightEventStatusLabels[event.status] }}</span>
          </button>
          <div v-if="expandedId === event.id" class="variant-a-row-expand">
            <div class="variant-a-row-expand-actions">
              <button type="button" @click="applyStatus(event.id, 'FOLLOWED')">已跟进</button>
              <button type="button" @click="applyStatus(event.id, 'WATCHING')">观察</button>
              <button type="button" @click="applyStatus(event.id, 'IGNORED')">忽略</button>
              <input v-model="inlineReviewDate" type="date" aria-label="复盘日期" />
              <button type="button" :disabled="!inlineReviewDate" @click="applyStatus(event.id, 'REVIEW_PENDING')">设复盘</button>
            </div>
            <div class="variant-a-row-expand-note">
              <textarea v-model="inlineNote" rows="2" placeholder="备注"></textarea>
              <button type="button" class="primary" @click="applyNote(event.id)">保存备注</button>
            </div>
            <div class="variant-a-row-expand-review">
              <select v-model="inlineReview" aria-label="复盘结论">
                <option value="CONFIRMED">判断成立</option>
                <option value="REVERTED">短期回落</option>
                <option value="CONTINUING">仍在持续</option>
                <option value="FAILED">机会消失</option>
                <option value="UNCLEAR">数据不足</option>
              </select>
              <button type="button" class="primary" @click="applyReview(event.id)">标记复盘</button>
            </div>
            <small class="variant-a-type">{{ insightEventTypeLabels[event.eventType] }}</small>
          </div>
        </article>
      </div>
      <p v-else class="empty-copy">暂无洞察事件</p>
    </section>
  </div>
</template>

<style scoped>
.variant-a {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.variant-a-review-strip {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 12px;
  padding: 10px 12px;
}

.variant-a-review-strip header {
  align-items: center;
  color: #92400e;
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  letter-spacing: 0.02em;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.variant-a-review-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.variant-a-review-chip {
  align-items: center;
  background: #ffffff;
  border: 1px solid #fde68a;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  max-width: 280px;
  padding: 4px 10px 4px 4px;
}

.variant-a-review-chip-score {
  align-items: center;
  aspect-ratio: 1;
  background: #fef3c7;
  border-radius: 999px;
  color: #92400e;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  justify-content: center;
  padding: 0 4px;
}

.variant-a-review-chip-score[data-level="S"] { background: #fee2e2; color: #991b1b; }
.variant-a-review-chip-score[data-level="A"] { background: #ffedd5; color: #9a3412; }
.variant-a-review-chip-score[data-level="B"],
.variant-a-review-chip-score[data-level="C"] { background: #dcfce7; color: #166534; }

.variant-a-review-chip-title {
  color: var(--text-primary, #0f172a);
  font-size: 12.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-a-review-chip small {
  color: var(--text-muted, #64748b);
  font-size: 11px;
}

.variant-a-list {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
}

.variant-a-list-head {
  align-items: baseline;
  display: flex;
  justify-content: space-between;
  padding: 0 4px 6px;
}

.variant-a-list-head h3 {
  color: var(--text-primary, #0f172a);
  font-size: 14px;
  margin: 0;
}

.variant-a-list-head small {
  color: var(--text-muted, #64748b);
  font-size: 12px;
}

.variant-a-rows {
  display: grid;
  gap: 4px;
}

.variant-a-row {
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.variant-a-row--expanded {
  background: var(--color-primary-light, rgba(37, 99, 235, 0.08));
  border-color: var(--color-primary-border, rgba(96, 165, 250, 0.4));
}

.variant-a-row-main {
  align-items: center;
  background: transparent;
  border: 0;
  cursor: pointer;
  display: grid;
  gap: 10px;
  grid-template-columns: 32px minmax(110px, 140px) minmax(0, 1fr) minmax(80px, 110px) auto;
  padding: 8px 10px;
  text-align: left;
  width: 100%;
}

.variant-a-badge {
  align-items: center;
  aspect-ratio: 1;
  background: #f1f5f9;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary, #0f172a);
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  height: 32px;
  justify-content: center;
}

.variant-a-badge[data-level="S"] { background: #fee2e2; color: #991b1b; }
.variant-a-badge[data-level="A"] { background: #ffedd5; color: #9a3412; }
.variant-a-badge[data-level="B"],
.variant-a-badge[data-level="C"] { background: #dcfce7; color: #166534; }

.variant-a-row-brand {
  display: grid;
  font-size: 12px;
  min-width: 0;
}

.variant-a-row-brand b {
  color: var(--text-primary, #0f172a);
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-a-row-brand small {
  color: var(--text-muted, #64748b);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-a-row-title {
  align-items: center;
  color: var(--text-primary, #0f172a);
  display: inline-flex;
  font-size: 13px;
  gap: 8px;
  min-width: 0;
}

.variant-a-row-title > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-a-level {
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 5px;
}

.variant-a-level[data-level="P0"] { background: #fee2e2; color: #991b1b; }
.variant-a-level[data-level="P1"] { background: #ffedd5; color: #9a3412; }
.variant-a-level[data-level="P2"] { background: #f1f5f9; color: #475569; }

.variant-a-row-data {
  color: var(--text-muted, #64748b);
  display: grid;
  font-size: 11.5px;
  gap: 1px;
  text-align: right;
}

.variant-a-row-data strong {
  color: var(--text-primary, #0f172a);
  font-size: 13px;
}

.variant-a-status {
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
}

.variant-a-status[data-status="TODO"] { background: #fef3c7; color: #92400e; }
.variant-a-status[data-status="WATCHING"] { background: #dbeafe; color: #1e40af; }
.variant-a-status[data-status="FOLLOWED"] { background: #dcfce7; color: #166534; }
.variant-a-status[data-status="IGNORED"] { background: #f1f5f9; color: #64748b; }
.variant-a-status[data-status="REVIEW_PENDING"] { background: #fae8ff; color: #6b21a8; }
.variant-a-status[data-status="REVIEWED"] { background: #cffafe; color: #155e75; }

.variant-a-row-expand {
  border-top: 1px dashed var(--border-color);
  display: grid;
  gap: 8px;
  margin: 0 10px;
  padding: 10px 0;
}

.variant-a-row-expand-actions,
.variant-a-row-expand-review {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.variant-a-row-expand-actions button,
.variant-a-row-expand-review button,
.variant-a-row-expand-review select,
.variant-a-row-expand-actions input {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font: inherit;
  padding: 5px 8px;
}

.variant-a-row-expand-actions button,
.variant-a-row-expand-review button,
.variant-a-row-expand-note button {
  background: #ffffff;
  cursor: pointer;
}

.variant-a-row-expand-actions button:hover,
.variant-a-row-expand-review button:hover {
  background: #f1f5f9;
}

button.primary {
  background: #0f172a !important;
  border-color: #0f172a !important;
  color: #ffffff;
}

.variant-a-row-expand-note {
  display: grid;
  gap: 6px;
  grid-template-columns: minmax(0, 1fr) auto;
}

.variant-a-row-expand-note textarea {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font: inherit;
  padding: 6px 8px;
  resize: vertical;
}

.variant-a-type {
  color: var(--text-muted, #64748b);
  font-size: 11.5px;
}

.empty-copy {
  color: var(--text-muted, #64748b);
  font-size: 13px;
  margin: 12px 0 0;
  text-align: center;
}
</style>
