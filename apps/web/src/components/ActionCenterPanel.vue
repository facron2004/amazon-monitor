<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  type AsinWatchLevel,
  type AttributionTag,
  type InsightEvent,
  type InsightEventLevel,
  type InsightEventStatus,
  type InsightEventType,
  type InsightReviewResult,
  type StrategyTag,
  type Task,
  type TaskPriority,
  type TaskType
} from "@amazon-monitor/shared";
import { ElMessage, ElMessageBox } from "element-plus";
import { convertEventToTask as apiConvertEventToTask } from "../api-tasks.js";
import { ElSegmented } from "element-plus";
import {
  useInsightEventsStore,
  type ActionCenterColumnKey,
  type ActionWorkView,
  type InsightEventFilters
} from "../stores/insightEvents";
import ActionCenterChartsPanel from "./action-center/ActionCenterChartsPanel.vue";
import AsinGroupList from "./action-center/AsinGroupList.vue";
import ActionCenterColumn from "./action-center/ActionCenterColumn.vue";
import ActionCenterFilterBar from "./action-center/ActionCenterFilterBar.vue";
import ActionFilterSummary from "./action-center/ActionFilterSummary.vue";
import ActionCenterHeader from "./action-center/ActionCenterHeader.vue";
import ActionCenterKpiCards from "./action-center/ActionCenterKpiCards.vue";
import ActionCenterKpiBar from "./action-center/ActionCenterKpiBar.vue";
import ActionOwnershipPanel from "./action-center/ActionOwnershipPanel.vue";
import ActionReadinessPanel from "./action-center/ActionReadinessPanel.vue";
import ActionReviewCadencePanel from "./action-center/ActionReviewCadencePanel.vue";
import ActionReviewOutcomePanel from "./action-center/ActionReviewOutcomePanel.vue";
import ActionSignalFlowPanel from "./action-center/ActionSignalFlowPanel.vue";
import ActionStrategyFocusPanel from "./action-center/ActionStrategyFocusPanel.vue";
import InsightEventDrawer from "./action-center/InsightEventDrawer.vue";
import { clearActionFilter, type ActionFilterKey } from "../utils/actionCenterFilterSummary";
import type { ActionEvidenceMovementFilter } from "../utils/actionCenterEvidenceDeltas";
import type { ReviewCadenceBucketKey } from "../utils/actionCenterReviewCadence";
import type { ActionScoreDriverFilter } from "../utils/actionCenterScoreBreakdown";
import type { ActionSignalFlowStageKey } from "../utils/actionCenterSignalFlow";

const props = defineProps<{
  date: string;
}>();

const store = useInsightEventsStore();
const {
  events,
  selectedEvent,
  reviewDueEvents,
  trend,
  brandPlaybook,
  selectedEventNotes,
  selectedBsrHistory,
  selectedPriceHistory,
  watchStates,
  loading,
  generating,
  reviewing,
  activeColumn,
  drawerOpen,
  workView,
  brandPlaybookLoading,
  eventNotesLoading,
  bsrHistoryLoading,
  priceHistoryLoading,
  visibleEvents,
  visibleAsinGroups,
  todoCount,
  p0Count,
  p1Count,
  reviewedConfirmedCount
} = storeToRefs(store);

const activeWorkView = computed<ActionWorkView>({
  get: () => workView.value,
  set: (next) => {
    workView.value = next;
  }
});

/**
 * Guard flag: only auto-select/scroll on the FIRST time selectedEvent
 * becomes non-null from an external navigation (Overview → Action Center).
 * Once set, internal selectColumnEvent calls take over.
 */
const hasHandledExternalNavigation = ref(false);

// Watch for external navigation (Overview "查看" → Action Center)
// Resets when selectedEvent is cleared (closeDrawer / re-navigation)
watch(() => store.selectedEvent, async (event) => {
  if (event === null) {
    hasHandledExternalNavigation.value = false;
    return;
  }
  if (hasHandledExternalNavigation.value) return;
  hasHandledExternalNavigation.value = true;

  const column = columnForStatus(event.status);
  activeColumn.value = column;
  drawerOpen.value = true;

  const doScroll = () => {
    const el = document.getElementById(`action-row-${event.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }
    return false;
  };

  await nextTick();
  if (!doScroll()) {
    const unwatch = watch(visibleEvents, () => {
      nextTick().then(() => { doScroll(); unwatch(); });
    }, { once: true });
  }
}, { immediate: true });
const workViewOptions: Array<{ value: ActionWorkView; label: string }> = [
  { value: "columns", label: "状态看板" },
  { value: "cases", label: "ASIN 案卷" }
];

const todoColumn = computed(() => visibleEvents.value.filter((event) => event.status === "TODO"));
const midColumn = computed(() => visibleEvents.value.filter((event) => event.status === "WATCHING" || event.status === "REVIEW_PENDING"));
const closedColumn = computed(() => visibleEvents.value.filter((event) => event.status === "FOLLOWED" || event.status === "REVIEWED" || event.status === "IGNORED"));
const unassignedVisibleCount = computed(() => visibleEvents.value.filter((event) => event.assignee === null).length);
const watchingAsinCount = computed(() => {
  const asins = new Set<string>();
  for (const state of watchStates.value) {
    if (state.watchLevel !== "IGNORED") {
      asins.add(state.asin);
    }
  }
  for (const event of events.value) {
    if (event.status === "WATCHING" && event.asin !== null) {
      asins.add(event.asin);
    }
  }
  return asins.size;
});
const reviewDueAsinCount = computed(() => uniqueAsinCount(reviewDueEvents.value));
const highRiskCoreCompetitorCount = computed(() => uniqueAsinCount(
  events.value.filter((event) => (
    event.eventType === "CORE_COMPETITOR_RISK"
    && (event.eventLevel === "P0" || event.eventLevel === "P1")
  ))
));
const reviewDueFocusActive = computed(() => (
  draftFilters.value.reviewDueOnly
  || draftFilters.value.reviewCadence === "overdue"
  || draftFilters.value.reviewCadence === "today"
));
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
  void store.loadTrend(props.date);
});
watch(() => store.filters, (next) => {
  draftFilters.value = { ...next };
});
watch(() => props.date, (nextDate) => {
  void store.loadReviewDueEvents(nextDate);
  void store.loadTrend(nextDate);
});
function applyFilters(nextFilters?: InsightEventFilters): void {
  const filters = { ...(nextFilters ?? draftFilters.value) };
  draftFilters.value = filters;
  store.$patch({ filters });
  void store.loadEvents(props.date);
  void store.loadReviewDueEvents(props.date);
  void store.loadTrend(props.date);
}

function clearChartScopeFilter(key: ActionFilterKey): void {
  applyFilters(clearActionFilter(draftFilters.value, key));
}

function focusUnassignedEvents(): void {
  draftFilters.value = {
    ...draftFilters.value,
    assignee: "",
    unassignedOnly: true,
    actionStage: ""
  };
  applyFilters();
}

function focusReviewDueEvents(): void {
  draftFilters.value = {
    ...draftFilters.value,
    reviewDueOnly: true,
    reviewCadence: "",
    actionStage: ""
  };
  applyFilters();
}

function focusReviewCadenceEvents(filter: ReviewCadenceBucketKey): void {
  draftFilters.value = {
    ...draftFilters.value,
    reviewDueOnly: false,
    reviewCadence: filter,
    actionStage: ""
  };
  applyFilters();
}

function focusSignalStageEvents(stage: ActionSignalFlowStageKey): void {
  draftFilters.value = {
    ...draftFilters.value,
    status: "",
    assignee: "",
    unassignedOnly: false,
    reviewDueOnly: false,
    reviewCadence: "",
    actionStage: stage
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

function focusEventTypeEvents(eventType: InsightEventType): void {
  draftFilters.value = {
    ...draftFilters.value,
    eventType
  };
  applyFilters();
}

function focusReviewResultEvents(result: InsightReviewResult): void {
  draftFilters.value = {
    ...draftFilters.value,
    reviewResult: result
  };
  applyFilters();
}

function focusAttributionEvents(tag: AttributionTag): void {
  draftFilters.value = {
    ...draftFilters.value,
    attributionTag: tag
  };
  applyFilters();
}

function focusEvidenceMovementEvents(filter: ActionEvidenceMovementFilter): void {
  draftFilters.value = {
    ...draftFilters.value,
    evidenceMovement: filter
  };
  applyFilters();
}

function focusScoreDriverEvents(filter: ActionScoreDriverFilter): void {
  draftFilters.value = {
    ...draftFilters.value,
    scoreDriver: filter
  };
  applyFilters();
}

function focusAssigneeEvents(assignee: string | null): void {
  draftFilters.value = {
    ...draftFilters.value,
    assignee: assignee ?? "",
    unassignedOnly: assignee === null,
    actionStage: ""
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
  await store.loadTrend(props.date);
}

async function evaluateDueReviews(): Promise<void> {
  await store.evaluateReviewDueEvents(props.date);
  await store.loadTrend(props.date);
}

async function selectColumnEvent(column: ActionCenterColumnKey, event: InsightEvent): Promise<void> {
  activeColumn.value = column;
  drawerOpen.value = true;
  selectedEvent.value = event;
  await store.loadEventDetail(event.id);
}

function pickFirstInColumn(column: ActionCenterColumnKey): void {
  activeWorkView.value = "columns";
  const events = getColumnEvents(column);
  if (events.length === 0) return;
  void selectColumnEvent(column, events[0]);
}

function getColumnEvents(column: ActionCenterColumnKey): InsightEvent[] {
  if (column === "todo") return todoColumn.value;
  if (column === "mid") return midColumn.value;
  return closedColumn.value;
}

function columnForStatus(status: InsightEventStatus): ActionCenterColumnKey {
  if (status === "TODO") return "todo";
  if (status === "WATCHING" || status === "REVIEW_PENDING") return "mid";
  return "closed";
}

function uniqueAsinCount(source: InsightEvent[]): number {
  return new Set(source
    .map((event) => event.asin)
    .filter((asin): asin is string => asin !== null)
  ).size;
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
  await store.loadTrend(props.date);
}

async function updateNote(id: string, note: string): Promise<void> {
  await store.setNote(id, note);
}

async function updateAssignee(id: string, assignee: string | null): Promise<void> {
  await store.setAssignee(id, assignee);
  await store.loadTrend(props.date);
}

async function watchEvent(id: string): Promise<void> {
  await store.watchEvent(id);
  await store.loadTrend(props.date);
}

async function updateWatchState(event: InsightEvent, level: AsinWatchLevel): Promise<void> {
  await store.setWatchState(event, level);
}

async function reviewEvent(id: string, result: InsightReviewResult, note?: string | null): Promise<void> {
  await store.reviewEvent(id, result, note, props.date);
  activeColumn.value = "closed";
  await store.loadTrend(props.date);
}

function inferTaskType(eventType: InsightEventType): TaskType {
  if (eventType.includes("PRICE")) return "price";
  if (eventType.includes("COUPON") || eventType.includes("DEAL")) return "coupon";
  if (eventType.includes("REVIEW") || eventType.includes("LOW_REVIEW")) return "review";
  if (eventType.includes("LISTING")) return "listing";
  if (eventType.includes("BREAKOUT") || eventType.includes("NEW_PRODUCT") || eventType.includes("RANK") || eventType.includes("BSR") || eventType.includes("BRAND") || eventType.includes("CORE")) return "competitor";
  return "other";
}

async function convertEventToTask(insight: InsightEvent): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将事件「${insight.eventTitle}」转化为任务？`,
      "转化为任务",
      { type: "info" }
    );
  } catch {
    return;
  }
  try {
    const task = await apiConvertEventToTask(
      insight.id,
      insight.eventTitle,
      inferTaskType(insight.eventType),
      insight.eventLevel as TaskPriority,
      insight.asin ?? null,
      insight.brand ?? null,
      insight.categoryId ?? null,
      insight.suggestedAction ?? null
    );
    ElMessage.success(`已创建任务 #${task.id}`);
    void task;
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
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

    <ActionCenterKpiCards
      :p0-count="p0Count"
      :p1-count="p1Count"
      :todo-count="todoCount"
      :watching-count="watchingAsinCount"
      :review-due-count="reviewDueAsinCount"
      :confirmed-count="reviewedConfirmedCount"
      :core-risk-count="highRiskCoreCompetitorCount"
    />

    <ActionCenterKpiBar
      :todo-count="todoColumn.length"
      :mid-count="midColumn.length"
      :closed-count="closedColumn.length"
      :review-due-count="reviewDueEvents.length"
      :review-due-detail="reviewDueKpiDetail"
      :unassigned-count="unassignedVisibleCount"
      :display-date="displayDate"
      :review-due-active="reviewDueFocusActive"
      :unassigned-active="draftFilters.unassignedOnly"
      @select-column="pickFirstInColumn"
      @focus-review-due="focusReviewDueEvents"
      @focus-unassigned="focusUnassignedEvents"
    />

    <ActionReadinessPanel
      :events="visibleEvents"
      :current-date="props.date"
      :review-due-active="reviewDueFocusActive"
      :unassigned-active="draftFilters.unassignedOnly"
      :p0-active="draftFilters.level === 'P0'"
      @focus-review-due="focusReviewDueEvents"
      @focus-unassigned="focusUnassignedEvents"
      @focus-level="focusLevelEvents"
    />

    <ActionReviewCadencePanel
      :events="visibleEvents"
      :review-due-events="reviewDueEvents"
      :current-date="props.date"
      :reviewing="reviewing"
      @focus-review-due="focusReviewDueEvents"
      @focus-review-cadence="focusReviewCadenceEvents"
      @evaluate-review-due="evaluateDueReviews"
      @select="selectReviewCadenceEvent"
    />

    <ActionReviewOutcomePanel
      :events="visibleEvents"
      :current-date="props.date"
      @focus-review-due="focusReviewDueEvents"
      @focus-review-result="focusReviewResultEvents"
      @select="selectCaseEvent"
    />

    <ActionCenterChartsPanel
      :events="visibleEvents"
      :review-due-events="reviewDueEvents"
      :trend="trend"
      :current-date="props.date"
      :filters="draftFilters"
      @focus-brand="focusBrandEvents"
      @focus-level="focusLevelEvents"
      @focus-event-type="focusEventTypeEvents"
      @focus-attribution="focusAttributionEvents"
      @focus-evidence-movement="focusEvidenceMovementEvents"
      @focus-review-cadence="focusReviewCadenceEvents"
      @focus-review-result="focusReviewResultEvents"
      @focus-score-driver="focusScoreDriverEvents"
      @focus-review-due="focusReviewDueEvents"
      @focus-strategy="focusStrategyEvents"
      @clear-filter="clearChartScopeFilter"
      @select="selectCaseEvent"
      @select-workflow="pickFirstInColumn"
    />

    <ActionSignalFlowPanel
      :events="visibleEvents"
      :current-date="props.date"
      :active-stage="draftFilters.actionStage"
      @select="selectCaseEvent"
      @focus-stage="focusSignalStageEvents"
    />

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
        @status="updateStatus"
        @watch="watchEvent"
      />
      <ActionCenterColumn
        column="mid"
        :current-date="props.date"
        :events="midColumn"
        :selected-event-id="activeColumn === 'mid' ? selectedEvent?.id : null"
        @select="selectColumnEvent('mid', $event)"
        @status="updateStatus"
        @watch="watchEvent"
      />
      <ActionCenterColumn
        column="closed"
        :current-date="props.date"
        :events="closedColumn"
        :selected-event-id="activeColumn === 'closed' ? selectedEvent?.id : null"
        @select="selectColumnEvent('closed', $event)"
        @status="updateStatus"
        @watch="watchEvent"
      />
    </div>
    <AsinGroupList v-else :groups="visibleAsinGroups" :loading="loading" @select="selectCaseEvent" />

    <InsightEventDrawer
      :event="drawerOpen ? selectedEvent : null"
      :current-date="props.date"
      :watch-state="selectedWatchState"
      :brand-playbook="brandPlaybook"
      :brand-playbook-loading="brandPlaybookLoading"
      :note-history="selectedEventNotes"
      :note-history-loading="eventNotesLoading"
      :bsr-history="selectedBsrHistory"
      :bsr-history-loading="bsrHistoryLoading"
      :price-history="selectedPriceHistory"
      :price-history-loading="priceHistoryLoading"
      @close="closeDrawer"
      @status="updateStatus"
      @note="updateNote"
      @assignee="updateAssignee"
      @watch="watchEvent"
      @watch-state="updateWatchState"
      @review="reviewEvent"
      @convert-to-task="convertEventToTask"
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
  min-height: 520px;
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
