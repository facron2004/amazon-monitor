import { defineStore } from "pinia";
import { ref } from "vue";
import type { OwnedProductDetail, OwnedProductListItem, OwnedProductStatus } from "@amazon-monitor/shared";
import { productApi, type CreateProductPayload, type UpsertProductMetricPayload } from "../api-products";

export const useProductStore = defineStore("products", () => {
  const products = ref<OwnedProductListItem[]>([]);
  const selectedProduct = ref<OwnedProductDetail | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const query = ref("");
  const status = ref<OwnedProductStatus | "all">("active");

  async function fetchProducts(date?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      products.value = await productApi.listProducts({
        q: query.value || undefined,
        status: status.value,
        date,
        limit: 200
      });
      if (selectedProduct.value) {
        const current = products.value.find((item) => item.id === selectedProduct.value?.id);
        if (!current) {
          selectedProduct.value = null;
        }
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function selectProduct(id: number, date?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      selectedProduct.value = await productApi.fetchProductDetail(id, date);
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function createProduct(payload: CreateProductPayload, date?: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      const created = await productApi.createProduct(payload);
      await fetchProducts(date);
      await selectProduct(created.id, date);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function upsertMetric(productId: number, payload: UpsertProductMetricPayload, date?: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await productApi.upsertMetric(productId, payload);
      await Promise.all([fetchProducts(date), selectProduct(productId, date)]);
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  return {
    products,
    selectedProduct,
    loading,
    saving,
    error,
    query,
    status,
    fetchProducts,
    selectProduct,
    createProduct,
    upsertMetric
  };
});
