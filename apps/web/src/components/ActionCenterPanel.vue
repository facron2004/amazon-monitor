<script setup lang="ts">
import { computed, toRef } from "vue";
import { storeToRefs } from "pinia";
import type { InsightEvent } from "@amazon-monitor/shared";
import { ElSegmented } from "element-plus";
import {
  useInsightEventsStore,
  type ActionCenterColumnKey,
  type ActionWorkView,
} from "../stores/insightEvents.js";
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
import {
  actionCenterColumnForStatus,
  buildReviewDueKpiDetail,
  countHighRiskCoreCompetitors,
  countWatchingAsins,
  uniqueInsightAsinCount,
} from "../utils/actionCenterWorkspace.js";
import { useActionCenterDrawerWorkflow } from "../composables/useActionCenterDrawerWorkflow.js";
import { useActionCenterFilterScope } from "../composables/useActionCenterFilterScope.js";
import { useWriteAccess } from "../composables/useWriteAccess.js";
import ReadOnlyNotice from "./ReadOnlyNotice.vue";

const props = defineProps<{
  date: string;
}>();

const { canWrite } = useWriteAccess();

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
  reviewedConfirmedCount,
} = storeToRefs(store);

const activeWorkView = computed<ActionWorkView>({
  get: () => workView.value,
  set: (next) => {
    workView.value = next;
  },
});

const date = toRef(props, "date");
const {
  draftFilters,
  reviewDueFocusActive,
  applyFilters,
  clearChartScopeFilter,
  focusUnassignedEvents,
  focusReviewDueEvents,
  focusReviewCadenceEvents,
  focusSignalStageEvents,
  focusBrandEvents,
  focusLevelEvents,
  focusEventTypeEvents,
  focusReviewResultEvents,
  focusAttributionEvents,
  focusEvidenceMovementEvents,
  focusScoreDriverEvents,
  focusAssigneeEvents,
  focusStrategyEvents,
} = useActionCenterFilterScope(date);
const {
  selectedEventTasks,
  selectedEventTasksLoading,
  selectedEventTasksError,
  competitorAnalysis,
  competitorAnalysisLoading,
  competitorAnalysisError,
  selectedWatchState,
  selectColumnEvent,
  closeDrawer,
  runCompetitorAnalysis,
  updateStatus,
  updateNote,
  updateAssignee,
  watchEvent,
  updateWatchState,
  reviewEvent,
  convertEventToTask,
} = useActionCenterDrawerWorkflow(date, canWrite);
const workViewOptions: Array<{ value: ActionWorkView; label: string }> = [
  { value: "columns", label: "状态看板" },
  { value: "cases", label: "ASIN 案卷" },
];

const todoColumn = computed(() =>
  visibleEvents.value.filter((event) => event.status === "TODO"),
);
const midColumn = computed(() =>
  visibleEvents.value.filter(
    (event) => event.status === "WATCHING" || event.status === "REVIEW_PENDING",
  ),
);
const closedColumn = computed(() =>
  visibleEvents.value.filter(
    (event) =>
      event.status === "FOLLOWED" ||
      event.status === "REVIEWED" ||
      event.status === "IGNORED",
  ),
);
const unassignedVisibleCount = computed(
  () => visibleEvents.value.filter((event) => event.assignee === null).length,
);
const watchingAsinCount = computed(() =>
  countWatchingAsins(watchStates.value, events.value),
);
const reviewDueAsinCount = computed(() =>
  uniqueInsightAsinCount(reviewDueEvents.value),
);
const highRiskCoreCompetitorCount = computed(() =>
  countHighRiskCoreCompetitors(events.value),
);
const reviewDueKpiDetail = computed(() =>
  buildReviewDueKpiDetail(reviewDueEvents.value, props.date),
);
const displayDate = computed(() => props.date.slice(5) || "-");

async function generate(): Promise<void> {
  if (!canWrite.value) return;
  await store.generateEvents(props.date);
  await store.loadTrend(props.date);
}

async function evaluateDueReviews(): Promise<void> {
  if (!canWrite.value) return;
  await store.evaluateReviewDueEvents(props.date);
  await store.loadTrend(props.date);
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

async function selectCaseEvent(event: InsightEvent): Promise<void> {
  await selectColumnEvent(actionCenterColumnForStatus(event.status), event);
}

async function selectReviewCadenceEvent(event: InsightEvent): Promise<void> {
  activeWorkView.value = "columns";
  await selectColumnEvent(actionCenterColumnForStatus(event.status), event);
}
</script>

<template>
  <section class="action-center">
    <ReadOnlyNotice v-if="!canWrite" />
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

    <ActionOwnershipPanel
      :events="visibleEvents"
      @focus-assignee="focusAssigneeEvents"
    />

    <ActionCenterFilterBar
      v-model:filters="draftFilters"
      :loading="loading"
      @apply="applyFilters"
    />

    <ActionFilterSummary
      v-model:filters="draftFilters"
      :visible-count="visibleEvents.length"
      :asin-case-count="visibleAsinGroups.length"
      @apply="applyFilters"
    />

    <div class="action-workview-bar">
      <ElSegmented v-model="activeWorkView" :options="workViewOptions" />
      <span
        >{{ visibleEvents.length }} events / {{ visibleAsinGroups.length }} ASIN
        cases</span
      >
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
        :selected-event-id="
          activeColumn === 'closed' ? selectedEvent?.id : null
        "
        @select="selectColumnEvent('closed', $event)"
        @status="updateStatus"
        @watch="watchEvent"
      />
    </div>
    <AsinGroupList
      v-else
      :groups="visibleAsinGroups"
      :loading="loading"
      @select="selectCaseEvent"
      @watch-state="updateWatchState"
      @status="updateStatus"
    />

    <InsightEventDrawer
      :event="drawerOpen ? selectedEvent : null"
      :current-date="props.date"
      :watch-state="selectedWatchState"
      :brand-playbook="brandPlaybook"
      :brand-playbook-loading="brandPlaybookLoading"
      :note-history="selectedEventNotes"
      :note-history-loading="eventNotesLoading"
      :linked-tasks="selectedEventTasks"
      :linked-tasks-loading="selectedEventTasksLoading"
      :linked-tasks-error="selectedEventTasksError"
      :competitor-analysis="competitorAnalysis"
      :competitor-analysis-loading="competitorAnalysisLoading"
      :competitor-analysis-error="competitorAnalysisError"
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
      @analyze-competitor="runCompetitorAnalysis"
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
