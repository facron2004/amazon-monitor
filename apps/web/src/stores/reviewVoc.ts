import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { AiReviewVocAnalysisResponse, ReviewVocSummary } from "@amazon-monitor/shared";
import { aiApi } from "../api-ai";
import { reviewVocApi, type ProductReviewPayload } from "../api-review-voc";

export const useReviewVocStore = defineStore("reviewVoc", () => {
  const summaries = ref<ReviewVocSummary[]>([]);
  const selectedProductId = ref<number | null>(null);
  const aiAnalysis = ref<AiReviewVocAnalysisResponse | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const analyzing = ref(false);
  const error = ref<string | null>(null);
  const query = ref("");

  const selectedSummary = computed(
    () => summaries.value.find((item) => item.productId === selectedProductId.value) ?? summaries.value[0] ?? null
  );

  async function fetchSummaries(date: string): Promise<void> {
    if (aiAnalysis.value?.date !== date) aiAnalysis.value = null;
    loading.value = true;
    error.value = null;
    try {
      summaries.value = await reviewVocApi.listSummaries({ date, q: query.value, limit: 100 });
      if (selectedProductId.value === null && summaries.value.length > 0) {
        selectedProductId.value = summaries.value[0].productId;
      }
      if (selectedProductId.value !== null && !summaries.value.some((item) => item.productId === selectedProductId.value)) {
        selectedProductId.value = summaries.value[0]?.productId ?? null;
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function saveReview(productId: number, payload: ProductReviewPayload, date: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await reviewVocApi.upsertReview(productId, payload);
      selectedProductId.value = productId;
      aiAnalysis.value = null;
      await fetchSummaries(date);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function analyzeSelected(date: string): Promise<void> {
    if (selectedProductId.value === null) return;
    analyzing.value = true;
    error.value = null;
    try {
      aiAnalysis.value = await aiApi.analyzeReviewVoc(selectedProductId.value, date);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      analyzing.value = false;
    }
  }

  function selectProduct(productId: number): void {
    selectedProductId.value = productId;
    aiAnalysis.value = null;
  }

  return {
    summaries,
    selectedProductId,
    selectedSummary,
    aiAnalysis,
    loading,
    saving,
    analyzing,
    error,
    query,
    fetchSummaries,
    saveReview,
    analyzeSelected,
    selectProduct
  };
});
