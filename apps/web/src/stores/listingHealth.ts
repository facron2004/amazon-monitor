import { defineStore } from "pinia";
import { ref } from "vue";
import type { AiListingAnalysisResponse, ProductListingHealthItem } from "@amazon-monitor/shared";
import { aiApi } from "../api-ai";
import { listingHealthApi, type ListingSnapshotPayload } from "../api-listing-health";

export const useListingHealthStore = defineStore("listingHealth", () => {
  const items = ref<ProductListingHealthItem[]>([]);
  const selectedProductId = ref<number | null>(null);
  const aiAnalysis = ref<AiListingAnalysisResponse | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const analyzing = ref(false);
  const error = ref<string | null>(null);
  const query = ref("");

  async function fetchItems(date: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      items.value = await listingHealthApi.list({ date, q: query.value, limit: 200 });
      if (selectedProductId.value === null && items.value.length > 0) {
        selectedProductId.value = items.value[0].productId;
      }
      if (selectedProductId.value !== null && !items.value.some((item) => item.productId === selectedProductId.value)) {
        selectedProductId.value = items.value[0]?.productId ?? null;
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function saveSnapshot(productId: number, payload: ListingSnapshotPayload, date: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await listingHealthApi.upsertSnapshot(productId, payload);
      selectedProductId.value = productId;
      await fetchItems(date);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function analyzeSelectedListing(date: string): Promise<void> {
    if (selectedProductId.value === null) return;
    analyzing.value = true;
    error.value = null;
    try {
      aiAnalysis.value = await aiApi.analyzeListing(selectedProductId.value, date);
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
    items,
    selectedProductId,
    aiAnalysis,
    loading,
    saving,
    analyzing,
    error,
    query,
    fetchItems,
    saveSnapshot,
    analyzeSelectedListing,
    selectProduct
  };
});
