<script setup lang="ts">
// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
// Variant B — Three-column status-centric reader. The structural shift:
//   from "pick one event, read it" to "scan the funnel: TODO → Watching+Review → Followed+Reviewed"
//   - 5 inline status KPIs at top (severity is implicit in the rows themselves)
//   - 3 equal columns derived from store.events.status, no shared selection
//   - Click a row → that column's bottom inline detail strip (60% column height)
//   - "Open full" button in the strip → existing InsightEventDrawer overlay
//   - selectNextInStatus is computed inline; NOT a store action (prototype only)
import { computed, ref, watch } from "vue";
import {
  inferInsightEventStrategyTags,
  insightEventStatusLabels,
  type AsinWatchLevel,
  type AsinWatchState,
  type InsightEvent,
  type InsightEventStatus,
  type InsightReviewResult
} from "@amazon-monitor/shared";
import { CheckCircle2, Clock3, Eye, ListTodo, Maximize2, Send } from "@lucide/vue";
import AttributionTags from "../../AttributionTags.vue";
import StrategyTags from "../../StrategyTags.vue";
import InsightScoreBadge from "../../InsightScoreBadge.vue";
import InsightEventDrawer from "../../InsightEventDrawer.vue";

const props = defineProps<{
  events: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  loading: boolean;
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

// Column buckets — derived from store.events, never from a snapshot.
const todoColumn = computed(() => props.events.filter((event) => event.status === "TODO"));
const midColumn = computed(() => props.events.filter((event) => event.status === "WATCHING" || event.status === "REVIEW_PENDING"));
const closedColumn = computed(() => props.events.filter((event) => event.status === "FOLLOWED" || event.status === "REVIEWED" || event.status === "IGNORED"));

const todoCount = computed(() => todoColumn.value.length);
const midCount = computed(() => midColumn.value.length);
const closedCount = computed(() => closedColumn.value.length);

// Per-column local selection. Clicking a row in column N expands the strip in
// column N. The store's selectedEvent is updated to drive the drawer's
// "Open full" action, but the in-column strip is local state for fairness.
const expandedColumn = ref<"todo" | "mid" | "closed" | null>(null);

const expandedEvent = computed<InsightEvent | null>(() => {
  if (!expandedColumn.value || !props.selectedEvent) return null;
  const column = expandedColumn.value === "todo" ? todoColumn.value
    : expandedColumn.value === "mid" ? midColumn.value
    : closedColumn.value;
  return column.find((event) => event.id === props.selectedEvent?.id) ?? null;
});

const strategyTags = computed(() => expandedEvent.value ? inferInsightEventStrategyTags(expandedEvent.value) : []);

const noteDraft = ref("");
const reviewDraft = ref<InsightReviewResult>("CONFIRMED");
watch(() => expandedEvent.value?.id, () => {
  noteDraft.value = expandedEvent.value?.userNote ?? "";
  reviewDraft.value = expandedEvent.value?.reviewResult ?? "CONFIRMED";
}, { immediate: true });

function selectInColumn(column: "todo" | "mid" | "closed", event: InsightEvent): void {
  expandedColumn.value = column;
  emit("select", event);
}

function pickFirstInColumn(column: "todo" | "mid" | "closed"): void {
  const list = column === "todo" ? todoColumn.value : column === "mid" ? midColumn.value : closedColumn.value;
  if (list.length === 0) return;
  selectInColumn(column, list[0]);
}

function applyNote(): void {
  if (expandedEvent.value) emit("note", expandedEvent.value.id, noteDraft.value);
}

function applyReview(): void {
  if (expandedEvent.value) emit("review", expandedEvent.value.id, reviewDraft.value, noteDraft.value || null);
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
  <div class="variant-b">
    <header class="variant-b-kpis">
      <button type="button" class="variant-b-kpi" @click="pickFirstInColumn('todo')">
        <ListTodo :size="14" />
        <small>待处理</small>
        <strong>{{ todoCount }}</strong>
      </button>
      <button type="button" class="variant-b-kpi" @click="pickFirstInColumn('mid')">
        <Eye :size="14" />
        <small>观察 / 待复盘</small>
        <strong>{{ midCount }}</strong>
      </button>
      <button type="button" class="variant-b-kpi" @click="pickFirstInColumn('closed')">
        <CheckCircle2 :size="14" />
        <small>已跟进 / 已复盘</small>
        <strong>{{ closedCount }}</strong>
      </button>
      <span class="variant-b-kpi variant-b-kpi--static">
        <Clock3 :size="14" />
        <small>待复盘</small>
        <strong>{{ reviewDueEvents.length }}</strong>
      </span>
      <span class="variant-b-kpi variant-b-kpi--static">
        <Send :size="14" />
        <small>日期</small>
        <strong>{{ events[0]?.eventDate?.slice(5) ?? "—" }}</strong>
      </span>
    </header>

    <div class="variant-b-grid">
      <section class="variant-b-col">
        <header><ListTodo :size="13" /><span>待处理 · {{ todoCount }}</span></header>
        <div class="variant-b-rows" v-if="todoColumn.length">
          <article
            v-for="event in todoColumn"
            :key="event.id"
            class="variant-b-row"
            :class="{ 'variant-b-row--selected': expandedColumn === 'todo' && selectedEvent?.id === event.id }"
            @click="selectInColumn('todo', event)"
          >
            <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
            <div class="variant-b-row-main">
              <span class="variant-b-row-title">{{ event.eventTitle }}</span>
              <small>{{ event.brand || "未知品牌" }} · {{ insightEventStatusLabels[event.status] }}</small>
            </div>
            <strong class="variant-b-row-delta">{{ rankDelta(event) }}</strong>
          </article>
        </div>
        <p v-else class="empty-copy">没有待处理事件</p>
      </section>

      <section class="variant-b-col">
        <header><Eye :size="13" /><span>观察 / 待复盘 · {{ midCount }}</span></header>
        <div class="variant-b-rows" v-if="midColumn.length">
          <article
            v-for="event in midColumn"
            :key="event.id"
            class="variant-b-row"
            :class="{ 'variant-b-row--selected': expandedColumn === 'mid' && selectedEvent?.id === event.id }"
            @click="selectInColumn('mid', event)"
          >
            <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
            <div class="variant-b-row-main">
              <span class="variant-b-row-title">{{ event.eventTitle }}</span>
              <small>{{ event.brand || "未知品牌" }} · {{ insightEventStatusLabels[event.status] }}</small>
            </div>
            <strong class="variant-b-row-delta">{{ rankDelta(event) }}</strong>
          </article>
        </div>
        <p v-else class="empty-copy">没有观察 / 待复盘事件</p>
      </section>

      <section class="variant-b-col">
        <header><CheckCircle2 :size="13" /><span>已跟进 / 已复盘 · {{ closedCount }}</span></header>
        <div class="variant-b-rows" v-if="closedColumn.length">
          <article
            v-for="event in closedColumn"
            :key="event.id"
            class="variant-b-row"
            :class="{ 'variant-b-row--selected': expandedColumn === 'closed' && selectedEvent?.id === event.id }"
            @click="selectInColumn('closed', event)"
          >
            <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
            <div class="variant-b-row-main">
              <span class="variant-b-row-title">{{ event.eventTitle }}</span>
              <small>{{ event.brand || "未知品牌" }} · {{ insightEventStatusLabels[event.status] }}</small>
            </div>
            <strong class="variant-b-row-delta">{{ rankDelta(event) }}</strong>
          </article>
        </div>
        <p v-else class="empty-copy">没有已结事件</p>
      </section>
    </div>

    <Transition name="variant-b-strip">
      <aside v-if="expandedEvent" class="variant-b-strip">
        <div class="variant-b-strip-head">
          <div class="variant-b-strip-head-main">
            <InsightScoreBadge :score="expandedEvent.scoreTotal" :level="expandedEvent.scoreLevel" />
            <div>
              <h4>{{ expandedEvent.eventTitle }}</h4>
              <small>{{ expandedEvent.brand || "未知品牌" }} · {{ expandedEvent.asin || "品牌事件" }} · {{ insightEventStatusLabels[expandedEvent.status] }}</small>
            </div>
          </div>
          <button type="button" class="variant-b-strip-open" @click="emit('select', expandedEvent)">
            <Maximize2 :size="13" />
            <span>打开完整</span>
          </button>
          <button type="button" class="variant-b-strip-close" aria-label="关闭" @click="expandedColumn = null; emit('close')">×</button>
        </div>
        <div class="variant-b-strip-body">
          <div class="variant-b-strip-section">
            <small>归因</small>
            <AttributionTags :tags="expandedEvent.attributionTags" />
            <StrategyTags v-if="strategyTags.length" :tags="strategyTags" />
          </div>
          <dl class="variant-b-strip-evidence">
            <div><dt>BSR</dt><dd>{{ expandedEvent.evidence.previousRank ?? "—" }} → {{ expandedEvent.evidence.currentRank ?? "—" }}</dd></div>
            <div><dt>价格</dt><dd>{{ expandedEvent.evidence.priceBefore ?? "—" }} → {{ expandedEvent.evidence.priceAfter ?? "—" }}</dd></div>
            <div><dt>Review</dt><dd>{{ expandedEvent.evidence.reviewCountBefore ?? "—" }} → {{ expandedEvent.evidence.reviewCountAfter ?? "—" }}</dd></div>
            <div><dt>复盘日</dt><dd>{{ expandedEvent.reviewDueDate || "—" }}</dd></div>
            <div v-if="expandedEvent.evidence.dealType || expandedEvent.evidence.couponBefore || expandedEvent.evidence.couponAfter"><dt>活动</dt><dd>{{ expandedEvent.evidence.dealType || expandedEvent.evidence.couponBefore || expandedEvent.evidence.couponAfter }}</dd></div>
          </dl>
          <div class="variant-b-strip-actions">
            <textarea v-model="noteDraft" rows="2" placeholder="备注"></textarea>
            <button type="button" @click="applyNote">保存备注</button>
            <select v-model="reviewDraft" aria-label="复盘结论">
              <option value="CONFIRMED">判断成立</option>
              <option value="REVERTED">短期回落</option>
              <option value="CONTINUING">仍在持续</option>
              <option value="FAILED">机会消失</option>
              <option value="UNCLEAR">数据不足</option>
            </select>
            <button type="button" @click="applyReview">标记复盘</button>
          </div>
        </div>
      </aside>
    </Transition>

    <InsightEventDrawer
      v-if="selectedEvent && expandedColumn !== null"
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
.variant-b {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.variant-b-kpis {
  align-items: stretch;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.variant-b-kpi {
  align-items: center;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  display: grid;
  gap: 4px;
  grid-template-columns: auto 1fr auto;
  padding: 8px 12px;
  text-align: left;
}

.variant-b-kpi--static {
  cursor: default;
}

.variant-b-kpi svg {
  color: var(--text-muted, #64748b);
  grid-column: 1;
}

.variant-b-kpi small {
  color: var(--text-muted, #64748b);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.variant-b-kpi strong {
  color: var(--text-primary, #0f172a);
  font-size: 18px;
  font-weight: 700;
  text-align: right;
}

.variant-b-grid {
  display: grid;
  flex: 1 1 auto;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 0;
}

.variant-b-col {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 12px;
}

.variant-b-col header {
  align-items: center;
  color: var(--text-muted, #64748b);
  display: inline-flex;
  font-size: 11.5px;
  font-weight: 600;
  gap: 6px;
  letter-spacing: 0.04em;
  padding-bottom: 6px;
  text-transform: uppercase;
}

.variant-b-rows {
  display: grid;
  flex: 1 1 auto;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
}

.variant-b-row {
  align-items: center;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 6px 8px;
}

.variant-b-row:hover {
  background: #f1f5f9;
}

.variant-b-row--selected {
  background: var(--color-primary-light, rgba(37, 99, 235, 0.12));
  border-color: var(--color-primary-border, rgba(96, 165, 250, 0.4));
}

.variant-b-row :deep(.insight-score-badge) {
  height: 30px;
  min-width: 36px;
  padding: 2px;
}

.variant-b-row :deep(.insight-score-badge strong) {
  font-size: 13px;
}

.variant-b-row :deep(.insight-score-badge small) {
  font-size: 9px;
  margin-top: 1px;
}

.variant-b-row-main {
  display: grid;
  font-size: 12px;
  min-width: 0;
}

.variant-b-row-title {
  color: var(--text-primary, #0f172a);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-b-row-main small {
  color: var(--text-muted, #64748b);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-b-row-delta {
  color: var(--text-primary, #0f172a);
  font-size: 12.5px;
  font-weight: 700;
}

.variant-b-strip {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60%;
  overflow: hidden;
  padding: 12px;
}

.variant-b-strip-head {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.variant-b-strip-head-main {
  align-items: center;
  display: inline-flex;
  gap: 10px;
  min-width: 0;
}

.variant-b-strip-head-main h4 {
  color: var(--text-primary, #0f172a);
  font-size: 13.5px;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-b-strip-head-main small {
  color: var(--text-muted, #64748b);
  font-size: 11.5px;
}

.variant-b-strip-open,
.variant-b-strip-close {
  align-items: center;
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: 6px;
  padding: 5px 9px;
}

.variant-b-strip-close {
  border-radius: 50%;
  font-size: 16px;
  height: 26px;
  justify-content: center;
  padding: 0;
  width: 26px;
}

.variant-b-strip-body {
  display: grid;
  flex: 1 1 auto;
  gap: 10px;
  grid-template-columns: minmax(220px, 1fr) minmax(280px, 1.4fr);
  min-height: 0;
  overflow-y: auto;
}

.variant-b-strip-section small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.variant-b-strip-section :deep(.attribution-tags),
.variant-b-strip-section :deep(.strategy-tags) {
  margin-bottom: 6px;
}

.variant-b-strip-evidence {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.variant-b-strip-evidence div {
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 10px;
}

.variant-b-strip-evidence dt {
  color: var(--text-muted, #64748b);
  font-size: 11px;
}

.variant-b-strip-evidence dd {
  color: var(--text-primary, #0f172a);
  font-weight: 600;
  margin: 2px 0 0;
}

.variant-b-strip-actions {
  align-items: stretch;
  display: grid;
  gap: 6px;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
}

.variant-b-strip-actions textarea,
.variant-b-strip-actions select,
.variant-b-strip-actions button {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font: inherit;
  padding: 6px 8px;
}

.variant-b-strip-actions textarea {
  resize: vertical;
}

.variant-b-strip-actions button {
  background: #ffffff;
  cursor: pointer;
}

.empty-copy {
  color: var(--text-muted, #64748b);
  font-size: 12px;
  margin: 12px 0;
  text-align: center;
}

.variant-b-strip-enter-active,
.variant-b-strip-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
}

.variant-b-strip-enter-from,
.variant-b-strip-leave-to {
  max-height: 0;
  opacity: 0;
}

.variant-b-strip-enter-to,
.variant-b-strip-leave-from {
  max-height: 60%;
  opacity: 1;
}

@media (max-width: 1180px) {
  .variant-b-grid {
    grid-template-columns: 1fr;
  }
}
</style>
