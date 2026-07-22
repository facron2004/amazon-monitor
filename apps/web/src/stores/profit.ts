import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { ProductProfitPlan, ProfitActionKind, ProfitPlanLevel } from "@amazon-monitor/shared";
import { profitApi, type ProfitSettingPayload } from "../api-profit";

export const useProfitStore = defineStore("profit", () => {
  const plans = ref<ProductProfitPlan[]>([]);
  const selectedProductId = ref<number | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const creatingTaskProductId = ref<number | null>(null);
  const taskIdsByAction = ref<Record<string, number>>({});
  const error = ref<string | null>(null);
  const query = ref("");
  const level = ref<ProfitPlanLevel | "">("");

  const selectedPlan = computed(
    () => plans.value.find((plan) => plan.productId === selectedProductId.value) ?? plans.value[0] ?? null
  );

  async function fetchPlans(date: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      plans.value = await profitApi.listPlans({
        date,
        q: query.value,
        level: level.value || undefined,
        limit: 100
      });
      if (selectedProductId.value === null && plans.value.length > 0) {
        selectedProductId.value = plans.value[0].productId;
      }
      if (selectedProductId.value !== null && !plans.value.some((plan) => plan.productId === selectedProductId.value)) {
        selectedProductId.value = plans.value[0]?.productId ?? null;
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function saveSetting(productId: number, payload: ProfitSettingPayload, date: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await profitApi.upsertSetting(productId, payload);
      selectedProductId.value = productId;
      await fetchPlans(date);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function createActionTask(
    productId: number,
    actionKind: ProfitActionKind,
    date: string
  ): Promise<{ created: boolean; taskId: number }> {
    creatingTaskProductId.value = productId;
    error.value = null;
    try {
      const result = await profitApi.createActionTask(productId, actionKind, date);
      taskIdsByAction.value = {
        ...taskIdsByAction.value,
        [`${productId}:${actionKind}`]: result.task.id
      };
      return { created: result.created, taskId: result.task.id };
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      creatingTaskProductId.value = null;
    }
  }

  function selectProduct(productId: number): void {
    selectedProductId.value = productId;
  }

  return {
    plans,
    selectedProductId,
    selectedPlan,
    loading,
    saving,
    creatingTaskProductId,
    taskIdsByAction,
    error,
    query,
    level,
    fetchPlans,
    saveSetting,
    createActionTask,
    selectProduct
  };
});
