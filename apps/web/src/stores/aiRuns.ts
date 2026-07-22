import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { AiActionFeedbackValue, AiAgentType, AiRun, AiRunStatus } from "@amazon-monitor/shared";
import { aiApi } from "../api-ai";
import { replaceAiActionFeedback } from "../utils/ai-action-feedback";

export const useAiRunsStore = defineStore("aiRuns", () => {
  const runs = ref<AiRun[]>([]);
  const selectedRunId = ref<number | null>(null);
  const agentType = ref<AiAgentType | "">("");
  const status = ref<AiRunStatus | "">("");
  const limit = ref(50);
  const loading = ref(false);
  const feedbackLoadingKey = ref<string | null>(null);
  const error = ref<string | null>(null);

  const selectedRun = computed(
    () => runs.value.find((run) => run.id === selectedRunId.value) ?? runs.value[0] ?? null
  );

  async function fetchRuns(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await aiApi.listRuns({
        agentType: agentType.value || undefined,
        status: status.value || undefined,
        limit: limit.value,
        offset: 0
      });
      runs.value = response.runs;
      if (selectedRunId.value === null && runs.value.length > 0) {
        selectedRunId.value = runs.value[0].id;
      }
      if (selectedRunId.value !== null && !runs.value.some((run) => run.id === selectedRunId.value)) {
        selectedRunId.value = runs.value[0]?.id ?? null;
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function selectRun(id: number): void {
    selectedRunId.value = id;
  }

  async function setActionFeedback(runId: number, actionIndex: number, value: AiActionFeedbackValue): Promise<void> {
    feedbackLoadingKey.value = `${runId}:${actionIndex}`;
    error.value = null;
    try {
      const feedback = await aiApi.setActionFeedback(runId, actionIndex, value);
      const run = runs.value.find((item) => item.id === runId);
      if (run) {
        run.actionFeedback = replaceAiActionFeedback(run.actionFeedback, feedback);
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      feedbackLoadingKey.value = null;
    }
  }

  return {
    runs,
    selectedRun,
    selectedRunId,
    agentType,
    status,
    limit,
    loading,
    feedbackLoadingKey,
    error,
    fetchRuns,
    selectRun,
    setActionFeedback
  };
});
