import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { AdsWorkflowItem, AdsWorkflowLevel, AdsWorkflowSummary, AiAdsAnalysisResponse } from "@amazon-monitor/shared";
import { adsApi, type AdsMetricPayload } from "../api-ads";
import { aiApi } from "../api-ai";

export const useAdsStore = defineStore("ads", () => {
  const summary = ref<AdsWorkflowSummary | null>(null);
  const selectedMetricId = ref<number | null>(null);
  const aiAnalysis = ref<AiAdsAnalysisResponse | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const analyzing = ref(false);
  const error = ref<string | null>(null);
  const query = ref("");
  const level = ref<AdsWorkflowLevel | "">("");

  const items = computed(() => summary.value?.items ?? []);
  const selectedItem = computed<AdsWorkflowItem | null>(
    () => items.value.find((item) => item.metric.id === selectedMetricId.value) ?? items.value[0] ?? null
  );

  async function fetchSummary(date: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      summary.value = await adsApi.fetchSummary({
        date,
        q: query.value,
        level: level.value || undefined,
        limit: 200
      });
      if (selectedMetricId.value === null && items.value.length > 0) {
        selectedMetricId.value = items.value[0].metric.id;
      }
      if (selectedMetricId.value !== null && !items.value.some((item) => item.metric.id === selectedMetricId.value)) {
        selectedMetricId.value = items.value[0]?.metric.id ?? null;
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function saveMetric(payload: AdsMetricPayload, date: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      const metric = await adsApi.upsertMetric(payload);
      selectedMetricId.value = metric.id;
      await fetchSummary(date);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function analyze(date: string): Promise<void> {
    analyzing.value = true;
    error.value = null;
    try {
      aiAnalysis.value = await aiApi.analyzeAds(date);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      analyzing.value = false;
    }
  }

  function selectMetric(id: number): void {
    selectedMetricId.value = id;
  }

  return {
    summary,
    items,
    selectedItem,
    selectedMetricId,
    aiAnalysis,
    loading,
    saving,
    analyzing,
    error,
    query,
    level,
    fetchSummary,
    saveMetric,
    analyze,
    selectMetric
  };
});
