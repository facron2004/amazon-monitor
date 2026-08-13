import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  CommerceStore,
  OwnedProductListItem,
  PromotionMonitorState,
  PromotionPlanView,
  PromotionTaskKind,
  UpdatePromotionPlanInput
} from "@amazon-monitor/shared";
import { productApi } from "../api-products";
import { commerceStoreApi } from "../api-stores";
import { promotionApi, type CreatePromotionPayload } from "../api-promotions";

export const usePromotionStore = defineStore("promotions", () => {
  const plans = ref<PromotionPlanView[]>([]);
  const stores = ref<CommerceStore[]>([]);
  const products = ref<OwnedProductListItem[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const query = ref("");
  const storeId = ref<number | null>(null);
  const monitorState = ref<PromotionMonitorState | "all">("all");

  const visiblePlans = computed(() => monitorState.value === "all"
    ? plans.value
    : plans.value.filter((plan) => plan.monitorState === monitorState.value));

  async function fetchWorkspace(asOf: string, signal?: AbortSignal): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [nextPlans, nextStores, nextProducts] = await Promise.all([
        promotionApi.list({ asOf, storeId: storeId.value ?? undefined, q: query.value || undefined, limit: 500 }, { signal }),
        commerceStoreApi.list({ limit: 500 }),
        productApi.listProducts({ status: "active", limit: 1000 })
      ]);
      plans.value = nextPlans;
      stores.value = nextStores;
      products.value = nextProducts;
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createPlan(payload: CreatePromotionPayload, asOf: string): Promise<void> {
    await save(async () => promotionApi.create(payload), asOf);
  }

  async function updatePlan(id: number, payload: UpdatePromotionPlanInput, asOf: string): Promise<void> {
    await save(async () => promotionApi.update(id, payload), asOf);
  }

  async function createTask(id: number, kind: PromotionTaskKind, asOf: string): Promise<boolean> {
    saving.value = true;
    try {
      const response = await promotionApi.createTask(id, kind);
      await fetchWorkspace(asOf);
      return response.created;
    } finally {
      saving.value = false;
    }
  }

  async function save(work: () => Promise<PromotionPlanView>, asOf: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await work();
      await fetchWorkspace(asOf);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  return {
    plans,
    visiblePlans,
    stores,
    products,
    loading,
    saving,
    error,
    query,
    storeId,
    monitorState,
    fetchWorkspace,
    createPlan,
    updatePlan,
    createTask
  };
});
