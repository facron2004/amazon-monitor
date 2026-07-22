import { computed, nextTick, ref, watch, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  AiCompetitorAnalysisResponse,
  AsinWatchLevel,
  InsightEvent,
  InsightEventStatus,
  InsightReviewResult,
  Task,
  TaskPriority,
} from "@amazon-monitor/shared";
import { aiApi } from "../api-ai.js";
import {
  convertEventToTask as apiConvertEventToTask,
  listTasksForEvent,
} from "../api-tasks.js";
import {
  useInsightEventsStore,
  type ActionCenterColumnKey,
} from "../stores/insightEvents.js";
import { actionCenterColumnForStatus } from "../utils/actionCenterWorkspace.js";
import { toErrorMessage } from "../utils/error-message.js";
import { inferInsightTaskType } from "../utils/insight-event-task.js";

export function useActionCenterDrawerWorkflow(
  date: Readonly<Ref<string>>,
  canWrite: Readonly<Ref<boolean>>,
) {
  const store = useInsightEventsStore();
  const {
    selectedEvent,
    visibleEvents,
    activeColumn,
    drawerOpen,
    watchStates,
  } = storeToRefs(store);
  const selectedEventTasks = ref<Task[]>([]);
  const selectedEventTasksLoading = ref(false);
  const selectedEventTasksError = ref("");
  const competitorAnalysis = ref<AiCompetitorAnalysisResponse | null>(null);
  const competitorAnalysisLoading = ref(false);
  const competitorAnalysisError = ref("");
  const hasHandledExternalNavigation = ref(false);
  const selectedWatchState = computed(() => {
    const asin = selectedEvent.value?.asin;
    return asin
      ? (watchStates.value.find((state) => state.asin === asin) ?? null)
      : null;
  });

  watch(
    () => store.selectedEvent,
    async (event) => {
      if (event === null) {
        hasHandledExternalNavigation.value = false;
        return;
      }
      if (hasHandledExternalNavigation.value) return;
      hasHandledExternalNavigation.value = true;
      activeColumn.value = actionCenterColumnForStatus(event.status);
      drawerOpen.value = true;
      await scrollToEvent(event.id);
    },
    { immediate: true },
  );

  watch(
    () => store.selectedEvent?.id ?? null,
    (id) => {
      resetSupplementaryState();
      if (id) void loadLinkedTasks(id);
    },
  );

  async function scrollToEvent(eventId: string): Promise<void> {
    const doScroll = () => {
      const element = document.getElementById(`action-row-${eventId}`);
      if (!element) return false;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    };
    await nextTick();
    if (doScroll()) return;
    const stop = watch(
      visibleEvents,
      () => {
        void nextTick().then(() => {
          doScroll();
          stop();
        });
      },
      { once: true },
    );
  }

  async function selectColumnEvent(
    column: ActionCenterColumnKey,
    event: InsightEvent,
  ): Promise<void> {
    activeColumn.value = column;
    drawerOpen.value = true;
    selectedEvent.value = event;
    await store.loadEventDetail(event.id);
  }

  function closeDrawer(): void {
    activeColumn.value = null;
    drawerOpen.value = false;
    selectedEvent.value = null;
    resetSupplementaryState();
  }

  function resetSupplementaryState(): void {
    selectedEventTasks.value = [];
    selectedEventTasksLoading.value = false;
    selectedEventTasksError.value = "";
    competitorAnalysis.value = null;
    competitorAnalysisLoading.value = false;
    competitorAnalysisError.value = "";
  }

  async function loadLinkedTasks(eventId: string): Promise<void> {
    selectedEventTasksLoading.value = true;
    selectedEventTasksError.value = "";
    try {
      const tasks = await listTasksForEvent(eventId);
      if (selectedEvent.value?.id === eventId) selectedEventTasks.value = tasks;
    } catch (errorValue) {
      if (selectedEvent.value?.id === eventId) {
        selectedEventTasks.value = [];
        selectedEventTasksError.value = toErrorMessage(errorValue);
      }
    } finally {
      if (selectedEvent.value?.id === eventId)
        selectedEventTasksLoading.value = false;
    }
  }

  async function runCompetitorAnalysis(event: InsightEvent): Promise<void> {
    if (!canWrite.value) return;
    competitorAnalysisLoading.value = true;
    competitorAnalysisError.value = "";
    try {
      const analysis = await aiApi.analyzeCompetitor(event.id, date.value);
      if (selectedEvent.value?.id === event.id)
        competitorAnalysis.value = analysis;
    } catch (errorValue) {
      if (selectedEvent.value?.id === event.id) {
        competitorAnalysis.value = null;
        competitorAnalysisError.value = toErrorMessage(errorValue);
      }
    } finally {
      if (selectedEvent.value?.id === event.id) {
        competitorAnalysisLoading.value = false;
      }
    }
  }

  async function updateStatus(
    id: string,
    status: InsightEventStatus,
    reviewDueDate?: string | null,
  ): Promise<void> {
    if (!canWrite.value) return;
    await store.setStatus(id, status, reviewDueDate);
    activeColumn.value = actionCenterColumnForStatus(status);
    await Promise.all([
      store.loadReviewDueEvents(date.value),
      store.loadTrend(date.value),
    ]);
  }

  async function updateNote(id: string, note: string): Promise<void> {
    if (canWrite.value) await store.setNote(id, note);
  }

  async function updateAssignee(
    id: string,
    assignee: string | null,
  ): Promise<void> {
    if (!canWrite.value) return;
    await store.setAssignee(id, assignee);
    await store.loadTrend(date.value);
  }

  async function watchEvent(id: string): Promise<void> {
    if (!canWrite.value) return;
    await store.watchEvent(id);
    await store.loadTrend(date.value);
  }

  async function updateWatchState(
    event: InsightEvent,
    level: AsinWatchLevel,
  ): Promise<void> {
    if (canWrite.value) await store.setWatchState(event, level);
  }

  async function reviewEvent(
    id: string,
    result: InsightReviewResult,
    note?: string | null,
  ): Promise<void> {
    if (!canWrite.value) return;
    await store.reviewEvent(id, result, note, date.value);
    activeColumn.value = "closed";
    await store.loadTrend(date.value);
  }

  async function convertEventToTask(event: InsightEvent): Promise<void> {
    if (!canWrite.value) return;
    try {
      await ElMessageBox.confirm(
        `将事件「${event.eventTitle}」转化为任务？`,
        "转化为任务",
        { type: "info" },
      );
    } catch {
      return;
    }
    try {
      const task = await apiConvertEventToTask(
        event.id,
        event.eventTitle,
        inferInsightTaskType(event.eventType),
        event.eventLevel as TaskPriority,
        event.asin ?? null,
        event.brand ?? null,
        event.categoryId ?? null,
        event.suggestedAction ?? null,
      );
      ElMessage.success(`已创建任务 #${task.id}`);
      selectedEventTasks.value = [
        task,
        ...selectedEventTasks.value.filter((item) => item.id !== task.id),
      ];
      await store.loadEventDetail(event.id);
      await loadLinkedTasks(event.id);
      activeColumn.value = "closed";
      await store.loadTrend(date.value);
    } catch (errorValue) {
      ElMessage.error(toErrorMessage(errorValue));
    }
  }

  return {
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
  };
}
