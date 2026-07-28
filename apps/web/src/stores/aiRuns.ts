import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  AiActionFeedbackValue,
  AiAgentType,
  AiQualityResponse,
  AiRun,
  AiRunStatus,
} from "@amazon-monitor/shared";
import { aiApi } from "../api-ai";
import { replaceAiActionFeedback } from "../utils/ai-action-feedback";

export const useAiRunsStore = defineStore("aiRuns", () => {
  const runs = ref<AiRun[]>([]);
  const selectedRunId = ref<number | null>(null);
  const agentType = ref<AiAgentType | "">("");
  const status = ref<AiRunStatus | "">("");
  const limit = ref(50);
  const offset = ref(0);
  const total = ref(0);
  const loading = ref(false);
  const feedbackLoadingKey = ref<string | null>(null);
  const error = ref<string | null>(null);
  const qualityDays = ref<7 | 30 | 90>(30);
  const quality = ref<AiQualityResponse | null>(null);
  const qualityLoading = ref(false);
  const qualityError = ref<string | null>(null);

  const selectedRun = computed(
    () => runs.value.find((run) => run.id === selectedRunId.value) ?? runs.value[0] ?? null
  );
  const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1);
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

  async function fetchRuns(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await aiApi.listRuns({
        agentType: agentType.value || undefined,
        status: status.value || undefined,
        limit: limit.value,
        offset: offset.value
      });
      runs.value = response.runs;
      total.value = response.total;
      if (!runs.value.some((run) => run.id === selectedRunId.value)) {
        selectedRunId.value = runs.value[0]?.id ?? null;
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

  async function resetAndFetch(): Promise<void> {
    offset.value = 0;
    await fetchRuns();
  }

  async function goToPage(page: number): Promise<void> {
    const nextPage = Math.min(Math.max(1, page), pageCount.value);
    offset.value = (nextPage - 1) * limit.value;
    await fetchRuns();
  }

  async function fetchQuality(): Promise<void> {
    qualityLoading.value = true;
    qualityError.value = null;
    try {
      quality.value = await aiApi.getQuality(qualityDays.value);
    } catch (err) {
      qualityError.value = (err as Error).message;
    } finally {
      qualityLoading.value = false;
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
      if (quality.value) await fetchQuality();
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
    offset,
    total,
    currentPage,
    pageCount,
    loading,
    feedbackLoadingKey,
    error,
    qualityDays,
    quality,
    qualityLoading,
    qualityError,
    fetchRuns,
    fetchQuality,
    resetAndFetch,
    goToPage,
    selectRun,
    setActionFeedback
  };
});
