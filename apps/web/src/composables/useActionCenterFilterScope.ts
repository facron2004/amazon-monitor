import { computed, onMounted, ref, watch, type Ref } from "vue";
import type {
  AttributionTag,
  InsightEventLevel,
  InsightEventType,
  InsightReviewResult,
  StrategyTag,
} from "@amazon-monitor/shared";
import {
  useInsightEventsStore,
  type InsightEventFilters,
} from "../stores/insightEvents.js";
import {
  clearActionFilter,
  type ActionFilterKey,
} from "../utils/actionCenterFilterSummary.js";
import type { ActionEvidenceMovementFilter } from "../utils/actionCenterEvidenceDeltas.js";
import type { ReviewCadenceBucketKey } from "../utils/actionCenterReviewCadence.js";
import type { ActionScoreDriverFilter } from "../utils/actionCenterScoreBreakdown.js";
import type { ActionSignalFlowStageKey } from "../utils/actionCenterSignalFlow.js";

export function useActionCenterFilterScope(date: Readonly<Ref<string>>) {
  const store = useInsightEventsStore();
  const draftFilters = ref<InsightEventFilters>({ ...store.filters });
  const reviewDueFocusActive = computed(
    () =>
      draftFilters.value.reviewDueOnly ||
      draftFilters.value.reviewCadence === "overdue" ||
      draftFilters.value.reviewCadence === "today",
  );

  onMounted(() => {
    draftFilters.value = { ...store.filters };
    void refreshSupportingData(date.value);
  });
  watch(
    () => store.filters,
    (next) => {
      draftFilters.value = { ...next };
    },
  );
  watch(date, (nextDate) => {
    void refreshSupportingData(nextDate);
  });

  function applyFilters(nextFilters?: InsightEventFilters): void {
    const filters = { ...(nextFilters ?? draftFilters.value) };
    draftFilters.value = filters;
    store.$patch({ filters });
    void store.loadEvents(date.value);
    void refreshSupportingData(date.value);
  }

  function updateScope(patch: Partial<InsightEventFilters>): void {
    draftFilters.value = { ...draftFilters.value, ...patch };
    applyFilters();
  }

  function clearChartScopeFilter(key: ActionFilterKey): void {
    applyFilters(clearActionFilter(draftFilters.value, key));
  }

  function focusUnassignedEvents(): void {
    updateScope({ assignee: "", unassignedOnly: true, actionStage: "" });
  }

  function focusReviewDueEvents(): void {
    updateScope({ reviewDueOnly: true, reviewCadence: "", actionStage: "" });
  }

  function focusReviewCadenceEvents(filter: ReviewCadenceBucketKey): void {
    updateScope({
      reviewDueOnly: false,
      reviewCadence: filter,
      actionStage: "",
    });
  }

  function focusSignalStageEvents(stage: ActionSignalFlowStageKey): void {
    updateScope({
      status: "",
      assignee: "",
      unassignedOnly: false,
      reviewDueOnly: false,
      reviewCadence: "",
      actionStage: stage,
    });
  }

  function focusBrandEvents(brand: string): void {
    updateScope({ brand });
  }

  function focusLevelEvents(level: InsightEventLevel): void {
    updateScope({ level });
  }

  function focusEventTypeEvents(eventType: InsightEventType): void {
    updateScope({ eventType });
  }

  function focusReviewResultEvents(reviewResult: InsightReviewResult): void {
    updateScope({ reviewResult });
  }

  function focusAttributionEvents(attributionTag: AttributionTag): void {
    updateScope({ attributionTag });
  }

  function focusEvidenceMovementEvents(
    evidenceMovement: ActionEvidenceMovementFilter,
  ): void {
    updateScope({ evidenceMovement });
  }

  function focusScoreDriverEvents(scoreDriver: ActionScoreDriverFilter): void {
    updateScope({ scoreDriver });
  }

  function focusAssigneeEvents(assignee: string | null): void {
    updateScope({
      assignee: assignee ?? "",
      unassignedOnly: assignee === null,
      actionStage: "",
    });
  }

  function focusStrategyEvents(strategyTag: StrategyTag): void {
    updateScope({ strategyTag });
  }

  async function refreshSupportingData(targetDate: string): Promise<void> {
    await Promise.all([
      store.loadReviewDueEvents(targetDate),
      store.loadTrend(targetDate),
    ]);
  }

  return {
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
  };
}
