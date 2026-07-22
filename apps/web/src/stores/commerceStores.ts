import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { CommerceStore, UpdateCommerceStoreInput } from "@amazon-monitor/shared";
import { commerceStoreApi, type CreateCommerceStorePayload } from "../api-stores";

export const useCommerceStoresStore = defineStore("commerceStores", () => {
  const stores = ref<CommerceStore[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const activeStores = computed(() => stores.value.filter((item) => item.status === "active"));

  async function fetchStores(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      stores.value = await commerceStoreApi.list({ limit: 200 });
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function createStore(payload: CreateCommerceStorePayload): Promise<void> {
    saving.value = true;
    try {
      await commerceStoreApi.create(payload);
      await fetchStores();
    } finally {
      saving.value = false;
    }
  }

  async function updateStore(id: number, payload: UpdateCommerceStoreInput): Promise<void> {
    saving.value = true;
    try {
      await commerceStoreApi.update(id, payload);
      await fetchStores();
    } finally {
      saving.value = false;
    }
  }

  return { stores, activeStores, loading, saving, error, fetchStores, createStore, updateStore };
});
