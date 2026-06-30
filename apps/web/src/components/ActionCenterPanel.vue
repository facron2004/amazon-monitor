<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  type AsinWatchLevel,
  type InsightEvent,
  type InsightEventLevel,
  type InsightEventStatus,
  type InsightReviewResult,
  type StrategyTag
} from "@amazon-monitor/shared";
import { ElSegmented } from "element-plus";
import { useInsightEventsStore, type InsightEventFilters } from "../stores/insightEvents";
import ActionCenterChartsPanel from "./action-center/ActionCenterChartsPanel.vue";
import AsinGroupList from "./action-center/AsinGroupList.vue";
import ActionCenterColumn from "./action-center/ActionCenterColumn.vue";
import ActionCenterFilterBar from "./action-center/ActionCenterFilterBar.vue";
import ActionFilterSummary from "./action-center/ActionFilterSummary.vue";
import ActionCenterHeader from "./action-center/ActionCenterHeader.vue";
import ActionCenterKpiBar from "./action-center/ActionCenterKpiBar.vue";
import ActionOwnershipPanel from "./action-center/ActionOwnershipPanel.vue";
import ActionReviewCadencePanel from "./action-center/ActionReviewCadencePanel.vue";
import ActionSignalFlowPanel from "./action-center/ActionSignalFlowPanel.vue";
import ActionStrategyFocusPanel from "./action-center/ActionStrategyFocusPanel.vue";
import InsightEventDrawer from "./action-center/InsightEventDrawer.vue";

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
  visibleEvents,
  visibleAsinGroups
} = storeToRefs(store);

type ActionColumnKey = "todo" | "mid" | "closed";
type ActionWorkView = "columns" | "cases";

const activeColumn = ref<ActionColumnKey | null>(null);
const drawerOpen = ref(false);
const activeWorkView = ref<ActionWorkView>("columns");
const workViewOptions: Array<{ value: ActionWorkView; label: string }> = [
  { value: "columns", label: "状态看板" },
  { value: "cases", label: "ASIN 案卷" }
];

const todoColumn = computed(() => visibleEvents.value.filter((event) => event.status === "TODO"));
const midColumn = computed(() => visibleEvents.value.filter((event) => event.status === "WATCHING" || event.status === "REVIEW_PENDING"));
const closedColumn = computed(() => visibleEvents.value.filter((event) => event.status === "FOLLOWED" || event.status === "REVIEWED" || event.status === "IGNORED"));
const unassignedVisibleCount = computed(() => visibleEvents.value.filter((event) => event.assignee === null).length);
const reviewDueKpiDetail = computed(() => {
  const overdueCount = reviewDueEvents.value.filter((event) => event.reviewDueDate !== null && event.reviewDueDate < props.date).length;
  const todayCount = reviewDueEvents.value.filter((event) => event.reviewDueDate === props.date).length;
  if (overdueCount > 0 && todayCount > 0) return `逾期 ${overdueCount} / 今日 ${todayCount}`;
  if (overdueCount > 0) return `逾期 ${overdueCount}`;
  if (todayCount > 0) return `今日 ${todayCount}`;
  return "暂无到期";
});
const displayDate = computed(() => props.date.slice(5) || "-");
const selectedWatchState = computed(() => {
  const asin = selectedEvent.value?.asin;
  return asin ? watchStates.value.find((state) => state.asin === asin) ?? null : null;
});

// 筛选草稿:和 store.filters 同步,但 refetch 走显式"筛选"按钮,避免每个 select 改一下
// 就触发全量 API 请求。watch 在 onMounted 一次性把 store.filters 拷到 draft。
const draftFilters = ref({ ...store.filters });
onMounted(() => {
  draftFilters.value = { ...store.filters };
  void store.loadReviewDueEvents(props.date);
});
watch(() => store.filters, (next) => {
  draftFilters.value = { ...next };
});
watch(() => props.date, (nextDate) => {
  void store.loadReviewDueEvents(nextDate);
});
function applyFilters(nextFilters?: InsightEventFilters): void {
  const filters = { ...(nextFilters ?? draftFilters.value) };
  draftFilters.value = filters;
  store.$patch({ filters });
  void store.loadEvents(props.date);
}

function focusUnassignedEvents(): void {
  draftFilters.value = {
    ...draftFilters.value,
    assignee: "",
    unassignedOnly: true
  };
  applyFilters();
}

function focusReviewDueEvents(): void {
  draftFilters.value = {
    ...draftFilters.value,
    reviewDueOnly: true
  };
  applyFilters();
}

function focusBrandEvents(brand: string): void {
  draftFilters.value = {
    ...draftFilters.value,
    brand
  };
  applyFilters();
}

function focusLevelEvents(level: InsightEventLevel): void {
  draftFilters.value = {
    ...draftFilters.value,
    level
  };
  applyFilters();
}

function focusAssigneeEvents(assignee: string | null): void {
  draftFilters.value = {
    ...draftFilters.value,
    assignee: assignee ?? "",
    unassignedOnly: assignee === null
  };
  applyFilters();
}

function focusStrategyEvents(tag: StrategyTag): void {
  draftFilters.value = {
    ...draftFilters.value,
    strategyTag: tag
  };
  applyFilters();
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
  activeWorkView.value = "columns";
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

async function selectCaseEvent(event: InsightEvent): Promise<void> {
  await selectColumnEvent(columnForStatus(event.status), event);
}

async function selectReviewCadenceEvent(event: InsightEvent): Promise<void> {
  activeWorkView.value = "columns";
  await selectColumnEvent(columnForStatus(event.status), event);
}

</script>

<template>
  <section class="action-center">
    <ActionCenterHeader
      :date="props.date"
      :generating="generating"
      :reviewing="reviewing"
      :review-due-count="reviewDueEvents.length"
      @generate="generate"
      @evaluate-review-due="evaluateDueReviews"
    />

    <ActionCenterKpiBar
      :todo-count="todoColumn.length"
      :mid-count="midColumn.length"
      :closed-count="closedColumn.length"
      :review-due-count="reviewDueEvents.length"
      :review-due-detail="reviewDueKpiDetail"
      :unassigned-count="unassignedVisibleCount"
      :display-date="displayDate"
      :review-due-active="draftFilters.reviewDueOnly"
      :unassigned-active="draftFilters.unassignedOnly"
      @select-column="pickFirstInColumn"
      @focus-review-due="focusReviewDueEvents"
      @focus-unassigned="focusUnassignedEvents"
    />

    <ActionReviewCadencePanel
      :events="visibleEvents"
      :review-due-events="reviewDueEvents"
      :current-date="props.date"
      :reviewing="reviewing"
      @focus-review-due="focusReviewDueEvents"
      @evaluate-review-due="evaluateDueReviews"
      @select="selectReviewCadenceEvent"
    />

    <ActionCenterChartsPanel
      :events="visibleEvents"
      :review-due-events="reviewDueEvents"
      :current-date="props.date"
      @focus-brand="focusBrandEvents"
      @focus-level="focusLevelEvents"
      @focus-review-due="focusReviewDueEvents"
      @focus-strategy="focusStrategyEvents"
      @select-workflow="pickFirstInColumn"
    />

    <ActionSignalFlowPanel :events="visibleEvents" :current-date="props.date" @select="selectCaseEvent" />

    <ActionStrategyFocusPanel
      :events="visibleEvents"
      :active-tag="draftFilters.strategyTag"
      @focus-strategy="focusStrategyEvents"
    />

    <ActionOwnershipPanel :events="visibleEvents" @focus-assignee="focusAssigneeEvents" />

    <ActionCenterFilterBar v-model:filters="draftFilters" :loading="loading" @apply="applyFilters" />

    <ActionFilterSummary
      v-model:filters="draftFilters"
      :visible-count="visibleEvents.length"
      :asin-case-count="visibleAsinGroups.length"
      @apply="applyFilters"
    />

    <div class="action-workview-bar">
      <ElSegmented v-model="activeWorkView" :options="workViewOptions" />
      <span>{{ visibleEvents.length }} events / {{ visibleAsinGroups.length }} ASIN cases</span>
    </div>

    <div v-if="activeWorkView === 'columns'" class="action-columns">
      <ActionCenterColumn
        column="todo"
        :current-date="props.date"
        :events="todoColumn"
        :selected-event-id="activeColumn === 'todo' ? selectedEvent?.id : null"
        @select="selectColumnEvent('todo', $event)"
      />
      <ActionCenterColumn
        column="mid"
        :current-date="props.date"
        :events="midColumn"
        :selected-event-id="activeColumn === 'mid' ? selectedEvent?.id : null"
        @select="selectColumnEvent('mid', $event)"
      />
      <ActionCenterColumn
        column="closed"
        :current-date="props.date"
        :events="closedColumn"
        :selected-event-id="activeColumn === 'closed' ? selectedEvent?.id : null"
        @select="selectColumnEvent('closed', $event)"
      />
    </div>
    <AsinGroupList v-else :groups="visibleAsinGroups" :loading="loading" @select="selectCaseEvent" />

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

.action-columns {
  display: grid;
  flex: 1 1 auto;
  gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 0;
}

.action-workview-bar {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.action-workview-bar span {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.action-workview-bar :deep(.el-segmented) {
  border-radius: 8px;
}

@media (max-width: 1180px) {
  .action-columns {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 760px) {
  .action-workview-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .action-workview-bar :deep(.el-segmented) {
    width: 100%;
  }
}
</style>
