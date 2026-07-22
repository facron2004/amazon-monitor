import { computed, ref, type Ref } from "vue";
import { storeToRefs } from "pinia";
import type { AiActionFeedbackValue, InsightEvent, InsightEventStatus } from "@amazon-monitor/shared";
import { convertEventToTask } from "../api-tasks";
import { useInsightEventsStore } from "../stores/insightEvents";
import { useReportsStore } from "../stores/reports";
import { useOverviewActivityStore } from "../stores/overviewActivity";
import { toErrorMessage } from "../utils/error-message";
import { inferInsightTaskType } from "../utils/insight-event-task";

interface OverviewWorkflowActionsOptions {
  date: Ref<string>;
  loadSummary: () => Promise<void>;
  setAction: (message: string) => void;
  setError: (message: string) => void;
}

export function useOverviewWorkflowActions(options: OverviewWorkflowActionsOptions) {
  const insightEventsStore = useInsightEventsStore();
  const overviewActivityStore = useOverviewActivityStore();
  const reportsStore = useReportsStore();
  const { dailyBriefFeedbackLoadingKey } = storeToRefs(insightEventsStore);
  const { archive, generating: dailyReportGenerating } = storeToRefs(reportsStore);
  const overviewEventBusyId = ref<string | null>(null);
  const dailyReportReady = computed(() => archive.value?.reportDate === options.date.value);

  async function updateOverviewEventStatus(
    event: InsightEvent,
    status: Extract<InsightEventStatus, "FOLLOWED" | "IGNORED">
  ) {
    if (overviewEventBusyId.value) return;
    overviewEventBusyId.value = event.id;
    try {
      await insightEventsStore.setStatus(event.id, status);
      await Promise.all([
        insightEventsStore.loadTopSummary(options.date.value),
        overviewActivityStore.load(options.date.value)
      ]);
      options.setAction(status === "FOLLOWED" ? "事件已标记为已跟进。" : "事件已忽略。");
    } catch (error) {
      options.setError(toErrorMessage(error));
    } finally {
      overviewEventBusyId.value = null;
    }
  }

  async function convertOverviewEventToTask(event: InsightEvent) {
    if (overviewEventBusyId.value) return;
    overviewEventBusyId.value = event.id;
    try {
      const task = await convertEventToTask(
        event.id,
        event.eventTitle,
        inferInsightTaskType(event.eventType),
        event.eventLevel,
        event.asin,
        event.brand,
        event.categoryId,
        event.suggestedAction
      );
      await Promise.all([
        insightEventsStore.loadTopSummary(options.date.value),
        overviewActivityStore.load(options.date.value),
        options.loadSummary()
      ]);
      options.setAction(`已创建任务 #${task.id}。`);
    } catch (error) {
      options.setError(toErrorMessage(error));
    } finally {
      overviewEventBusyId.value = null;
    }
  }

  async function generateDailyReportFromOverview() {
    if (dailyReportGenerating.value) return;
    try {
      const report = await reportsStore.generateDaily(options.date.value);
      options.setAction(`日报 ${report.reportDate} v${report.version} 已生成。`);
    } catch (error) {
      options.setError(toErrorMessage(error));
    }
  }

  async function setDailyBriefActionFeedback(actionIndex: number, value: AiActionFeedbackValue) {
    if (dailyBriefFeedbackLoadingKey.value !== null) return;
    try {
      await insightEventsStore.setDailyBriefActionFeedback(actionIndex, value);
      options.setAction(value === "up" ? "已标记这条建议有帮助。" : "已记录这条建议需要改进。");
    } catch (error) {
      options.setError(toErrorMessage(error));
    }
  }

  return {
    overviewEventBusyId,
    dailyBriefFeedbackLoadingKey,
    dailyReportGenerating,
    dailyReportReady,
    updateOverviewEventStatus,
    convertOverviewEventToTask,
    setDailyBriefActionFeedback,
    generateDailyReportFromOverview
  };
}
