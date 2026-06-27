<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { CheckCircle2, Clock3, Eye, ListTodo, RefreshCw, Send, SlidersHorizontal } from "@lucide/vue";
import {
  insightEventLevels,
  insightEventStatuses,
  insightEventStatusLabels,
  insightEventTypes,
  insightEventTypeLabels,
  type AsinWatchLevel,
  type InsightEvent,
  type InsightEventStatus,
  type InsightReviewResult
} from "@amazon-monitor/shared";
import { useInsightEventsStore } from "../stores/insightEvents";
import InsightEventDrawer from "./action-center/InsightEventDrawer.vue";
import InsightScoreBadge from "./action-center/InsightScoreBadge.vue";

const props = defineProps<{
  date: string;
}>();

const store = useInsightEventsStore();
const {
  selectedEvent,
  reviewDueEvents,
  brandPlaybook,
  selectedPriceHistory,
  watchStates,
  loading,
  generating,
  reviewing,
  brandPlaybookLoading,
  priceHistoryLoading,
  visibleEvents
} = storeToRefs(store);

type ActionColumnKey = "todo" | "mid" | "closed";

const activeColumn = ref<ActionColumnKey | null>(null);
const drawerOpen = ref(false);

const todoColumn = computed(() => visibleEvents.value.filter((event) => event.status === "TODO"));
const midColumn = computed(() => visibleEvents.value.filter((event) => event.status === "WATCHING" || event.status === "REVIEW_PENDING"));
const closedColumn = computed(() => visibleEvents.value.filter((event) => event.status === "FOLLOWED" || event.status === "REVIEWED" || event.status === "IGNORED"));
const displayDate = computed(() => visibleEvents.value[0]?.eventDate?.slice(5) ?? props.date.slice(5) ?? "-");
const selectedWatchState = computed(() => {
  const asin = selectedEvent.value?.asin;
  return asin ? watchStates.value.find((state) => state.asin === asin) ?? null : null;
});

// 筛选草稿:和 store.filters 同步,但 refetch 走显式"筛选"按钮,避免每个 select 改一下
// 就触发全量 API 请求。watch 在 onMounted 一次性把 store.filters 拷到 draft。
const draftFilters = ref({ ...store.filters });
onMounted(() => {
  draftFilters.value = { ...store.filters };
});
watch(() => store.filters, (next) => {
  draftFilters.value = { ...next };
});
function applyFilters(): void {
  store.$patch({ filters: { ...draftFilters.value } });
  void store.loadEvents(props.date);
}

async function generate(): Promise<void> {
  await store.generateEvents(props.date);
}

async function evaluateDueReviews(): Promise<void> {
  await store.evaluateReviewDueEvents(props.date);
}

async function selectColumnEvent(column: ActionColumnKey, event: InsightEvent): Promise<void> {
  activeColumn.value = column;
  drawerOpen.value = true;
  selectedEvent.value = event;
  await store.loadEventDetail(event.id);
}

function pickFirstInColumn(column: ActionColumnKey): void {
  const events = getColumnEvents(column);
  if (events.length === 0) return;
  void selectColumnEvent(column, events[0]);
}

function getColumnEvents(column: ActionColumnKey): InsightEvent[] {
  if (column === "todo") return todoColumn.value;
  if (column === "mid") return midColumn.value;
  return closedColumn.value;
}

function columnForStatus(status: InsightEventStatus): ActionColumnKey {
  if (status === "TODO") return "todo";
  if (status === "WATCHING" || status === "REVIEW_PENDING") return "mid";
  return "closed";
}

function closeDrawer(): void {
  activeColumn.value = null;
  drawerOpen.value = false;
  selectedEvent.value = null;
}

function rankDelta(event: InsightEvent): string {
  const value = event.evidence.rankChange;
  if (value === null || value === undefined) return "-";
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "持平";
}

function eventMeta(event: InsightEvent): string {
  const parts = [event.brand || "Unknown brand", insightEventStatusLabels[event.status]];
  if (event.assignee) {
    parts.push(`Owner: ${event.assignee}`);
  }
  return parts.join(" / ");
}

async function updateStatus(id: string, status: InsightEventStatus, reviewDueDate?: string | null): Promise<void> {
  await store.setStatus(id, status, reviewDueDate);
  activeColumn.value = columnForStatus(status);
  await store.loadReviewDueEvents(props.date);
}

async function updateNote(id: string, note: string): Promise<void> {
  await store.setNote(id, note);
}

async function updateAssignee(id: string, assignee: string | null): Promise<void> {
  await store.setAssignee(id, assignee);
}

async function watchEvent(id: string): Promise<void> {
  await store.watchEvent(id);
}

async function updateWatchState(event: InsightEvent, level: AsinWatchLevel): Promise<void> {
  await store.setWatchState(event, level);
}

async function reviewEvent(id: string, result: InsightReviewResult, note?: string | null): Promise<void> {
  await store.reviewEvent(id, result, note);
  activeColumn.value = "closed";
}

</script>

<template>
  <section class="action-center">
    <div class="action-center-head">
      <div>
        <span>Action Center</span>
        <h2>运营行动中心</h2>
        <p>{{ props.date }} · 洞察事件、归因评分、状态流转和复盘队列</p>
      </div>
      <div class="action-center-actions">
        <button class="secondary" type="button" :disabled="reviewing || reviewDueEvents.length === 0" @click="evaluateDueReviews">
          <CheckCircle2 :size="16" :class="{ spinning: reviewing }" />
          <span>{{ reviewing ? "复盘中" : "自动复盘" }}</span>
        </button>
        <button class="primary" type="button" :disabled="generating" @click="generate">
        <RefreshCw :size="16" :class="{ spinning: generating }" />
        <span>{{ generating ? "生成中" : "生成洞察" }}</span>
        </button>
      </div>
    </div>

    <header class="action-status-kpis">
      <button type="button" class="status-kpi" @click="pickFirstInColumn('todo')">
        <ListTodo :size="15" />
        <small>待处理</small>
        <strong>{{ todoColumn.length }}</strong>
      </button>
      <button type="button" class="status-kpi" @click="pickFirstInColumn('mid')">
        <Eye :size="15" />
        <small>观察 / 待复盘</small>
        <strong>{{ midColumn.length }}</strong>
      </button>
      <button type="button" class="status-kpi" @click="pickFirstInColumn('closed')">
        <CheckCircle2 :size="15" />
        <small>已跟进 / 已复盘</small>
        <strong>{{ closedColumn.length }}</strong>
      </button>
      <span class="status-kpi status-kpi-static">
        <Clock3 :size="15" />
        <small>到期复盘</small>
        <strong>{{ reviewDueEvents.length }}</strong>
      </span>
      <span class="status-kpi status-kpi-static">
        <Send :size="15" />
        <small>日期</small>
        <strong>{{ displayDate }}</strong>
      </span>
    </header>

    <div class="action-filter-bar">
      <SlidersHorizontal :size="16" />
      <select v-model="draftFilters.level">
        <option value="">全部等级</option>
        <option v-for="level in insightEventLevels" :key="level" :value="level">{{ level }}</option>
      </select>
      <select v-model="draftFilters.status">
        <option value="">全部状态</option>
        <option v-for="status in insightEventStatuses" :key="status" :value="status">{{ insightEventStatusLabels[status] }}</option>
      </select>
      <select v-model="draftFilters.eventType">
        <option value="">全部类型</option>
        <option v-for="type in insightEventTypes" :key="type" :value="type">{{ insightEventTypeLabels[type] }}</option>
      </select>
      <select v-model="draftFilters.sortBy">
        <option value="score">机会分</option>
        <option value="level">事件等级</option>
        <option value="rankChange">排名变化</option>
        <option value="reviewChange">Review 增量</option>
        <option value="createdAt">创建时间</option>
      </select>
      <input v-model="draftFilters.brand" type="search" placeholder="品牌" @keydown.enter="applyFilters" />
      <input v-model="draftFilters.asin" type="search" placeholder="ASIN" @keydown.enter="applyFilters" />
      <label class="filter-toggle"><input v-model="draftFilters.coreOnly" type="checkbox" />核心竞品</label>
      <label class="filter-toggle"><input v-model="draftFilters.newBreakoutOnly" type="checkbox" />新品黑马</label>
      <label class="filter-toggle"><input v-model="draftFilters.reviewDueOnly" type="checkbox" />待复盘</label>
      <button type="button" :disabled="loading" @click="applyFilters">筛选</button>
    </div>

    <div class="action-columns">
      <section class="action-column">
        <header><ListTodo :size="14" /><span>待处理 · {{ todoColumn.length }}</span></header>
        <div v-if="todoColumn.length" class="action-column-rows">
          <article
            v-for="event in todoColumn"
            :key="event.id"
            class="action-row"
            :title="eventMeta(event)"
            :class="{ 'action-row-selected': activeColumn === 'todo' && selectedEvent?.id === event.id }"
            @click="selectColumnEvent('todo', event)"
          >
            <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
            <div class="action-row-main">
              <span>{{ event.eventTitle }}</span>
              <small>{{ event.brand || "未知品牌" }} · {{ insightEventStatusLabels[event.status] }}</small>
            </div>
            <strong>{{ rankDelta(event) }}</strong>
          </article>
        </div>
        <p v-else class="empty-copy">没有待处理事件</p>
      </section>

      <section class="action-column">
        <header><Eye :size="14" /><span>观察 / 待复盘 · {{ midColumn.length }}</span></header>
        <div v-if="midColumn.length" class="action-column-rows">
          <article
            v-for="event in midColumn"
            :key="event.id"
            class="action-row"
            :title="eventMeta(event)"
            :class="{ 'action-row-selected': activeColumn === 'mid' && selectedEvent?.id === event.id }"
            @click="selectColumnEvent('mid', event)"
          >
            <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
            <div class="action-row-main">
              <span>{{ event.eventTitle }}</span>
              <small>{{ event.brand || "未知品牌" }} · {{ insightEventStatusLabels[event.status] }}</small>
            </div>
            <strong>{{ rankDelta(event) }}</strong>
          </article>
        </div>
        <p v-else class="empty-copy">没有观察 / 待复盘事件</p>
      </section>

      <section class="action-column">
        <header><CheckCircle2 :size="14" /><span>已跟进 / 已复盘 · {{ closedColumn.length }}</span></header>
        <div v-if="closedColumn.length" class="action-column-rows">
          <article
            v-for="event in closedColumn"
            :key="event.id"
            class="action-row"
            :title="eventMeta(event)"
            :class="{ 'action-row-selected': activeColumn === 'closed' && selectedEvent?.id === event.id }"
            @click="selectColumnEvent('closed', event)"
          >
            <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" />
            <div class="action-row-main">
              <span>{{ event.eventTitle }}</span>
              <small>{{ event.brand || "未知品牌" }} · {{ insightEventStatusLabels[event.status] }}</small>
            </div>
            <strong>{{ rankDelta(event) }}</strong>
          </article>
        </div>
        <p v-else class="empty-copy">没有已结束事件</p>
      </section>
    </div>

    <InsightEventDrawer
      :event="drawerOpen ? selectedEvent : null"
      :watch-state="selectedWatchState"
      :brand-playbook="brandPlaybook"
      :brand-playbook-loading="brandPlaybookLoading"
      :price-history="selectedPriceHistory"
      :price-history-loading="priceHistoryLoading"
      @close="closeDrawer"
      @status="updateStatus"
      @note="updateNote"
      @assignee="updateAssignee"
      @watch="watchEvent"
      @watch-state="updateWatchState"
      @review="reviewEvent"
    />
  </section>
</template>

<style scoped>
.action-center {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 18px;
}

.action-center-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.action-center-head span {
  color: #64748b;
  display: block;
  font-size: 12px;
}

.action-filter-bar > svg {
  color: #64748b;
}

.action-center-head h2 {
  color: #0f172a;
  font-size: 26px;
  line-height: 1.2;
  margin: 3px 0 0;
}

.action-center-head p {
  color: #64748b;
  margin: 6px 0 0;
}

button,
select,
input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
}

button {
  background: #ffffff;
  cursor: pointer;
  padding: 8px 10px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary {
  align-items: center;
  background: #0f172a;
  color: #ffffff;
  display: inline-flex;
  gap: 8px;
}

.secondary {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

.action-center-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.spinning {
  animation: spin 0.9s linear infinite;
}

.action-filter-bar {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
}

.action-filter-bar input[type="search"],
.action-filter-bar select {
  min-width: 120px;
  padding: 8px 10px;
}

.action-filter-bar select,
.action-filter-bar input[type="search"] {
  flex: 1 1 130px;
}

.filter-toggle {
  align-items: center;
  color: #475569;
  display: inline-flex;
  font-size: 13px;
  gap: 6px;
  white-space: nowrap;
}

.filter-toggle input {
  accent-color: #0f766e;
  height: 16px;
  width: 16px;
}

.action-status-kpis {
  align-items: stretch;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.status-kpi {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: grid;
  gap: 6px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 54px;
  padding: 9px 12px;
  text-align: left;
}

.status-kpi svg {
  color: #64748b;
}

.status-kpi small {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-kpi strong {
  color: #0f172a;
  font-size: 20px;
  line-height: 1;
  text-align: right;
}

.status-kpi-static {
  cursor: default;
}

.action-columns {
  display: grid;
  flex: 1 1 auto;
  gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 0;
}

.action-column {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 12px;
}

.action-column > header {
  align-items: center;
  color: #64748b;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  gap: 6px;
  letter-spacing: 0.02em;
  padding-bottom: 4px;
  text-transform: uppercase;
}

.action-column-rows {
  display: grid;
  flex: 1 1 auto;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.action-row {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 54px;
  padding: 7px 8px;
}

.action-row:hover {
  background: #f1f5f9;
}

.action-row-selected {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.action-row :deep(.insight-score-badge) {
  border-radius: 7px;
  min-width: 38px;
  padding: 4px;
}

.action-row :deep(.insight-score-badge strong) {
  font-size: 13px;
}

.action-row :deep(.insight-score-badge small) {
  font-size: 9px;
  margin-top: 1px;
}

.action-row-main {
  display: grid;
  min-width: 0;
}

.action-row-main span {
  color: #0f172a;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-row-main small {
  color: #64748b;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-row > strong {
  color: #0f172a;
  font-size: 13px;
}

.empty-copy {
  color: #64748b;
  font-size: 13px;
  margin: 12px 0;
  text-align: center;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .action-status-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .action-columns {
    grid-template-columns: 1fr;
  }

  .action-column {
    min-height: auto;
  }

  .action-column-rows {
    flex: 0 1 auto;
    max-height: 420px;
    overflow-y: auto;
  }
}

@media (max-width: 760px) {
  .action-center-head {
    align-items: stretch;
    flex-direction: column;
  }

  .action-center-actions {
    justify-content: flex-start;
  }

  .action-status-kpis {
    grid-template-columns: 1fr;
  }

  .action-column-rows {
    max-height: 360px;
  }
}
</style>
