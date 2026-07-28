import { defineStore } from "pinia";
import { ref } from "vue";
import type {
  OwnedProductDetail,
  OwnedProductListItem,
  OwnedProductOperationsDetail,
  OwnedProductStatus,
} from "@amazon-monitor/shared";
import { productApi, type CreateProductPayload, type UpsertProductMetricPayload } from "../api-products";

export const useProductStore = defineStore("products", () => {
  const products = ref<OwnedProductListItem[]>([]);
  const selectedProduct = ref<OwnedProductDetail | null>(null);
  const selectedOperations = ref<OwnedProductOperationsDetail | null>(null);
  const loading = ref(false);
  const detailLoading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const query = ref("");
  const status = ref<OwnedProductStatus | "all">("active");
  const storeId = ref<number | null>(null);

  async function fetchProducts(date?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      products.value = await productApi.listProducts({
        q: query.value || undefined,
        status: status.value,
        storeId: storeId.value ?? undefined,
        date,
        limit: 200
      });
      if (selectedProduct.value) {
        const current = products.value.find((item) => item.id === selectedProduct.value?.id);
        if (!current) {
          selectedProduct.value = null;
          selectedOperations.value = null;
        }
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function selectProduct(id: number, date?: string): Promise<void> {
    detailLoading.value = true;
    error.value = null;
    try {
      const detail = await productApi.fetchProductOperations(id, date);
      selectedOperations.value = detail;
      selectedProduct.value = detail.product;
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      detailLoading.value = false;
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

  async function updateProductStore(productId: number, nextStoreId: number | null, date?: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await productApi.updateProduct(productId, { storeId: nextStoreId });
      await fetchProducts(date);
      if (products.value.some((item) => item.id === productId)) {
        await selectProduct(productId, date);
      }
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
    selectedOperations,
    loading,
    detailLoading,
    saving,
    error,
    query,
    status,
    storeId,
    fetchProducts,
    selectProduct,
    createProduct,
    updateProductStore,
    upsertMetric
  };
});
