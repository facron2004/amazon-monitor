<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElInput, ElOption, ElSelect } from "element-plus";
import { PackagePlus, RefreshCw } from "@lucide/vue";
import type {
  OwnedProductDetail,
  OwnedProductListItem,
} from "@amazon-monitor/shared";
import type { TabKey } from "../constants/tabs";
import { useProductStore } from "../stores/products";
import { useCommerceStoresStore } from "../stores/commerceStores";
import ProductKpiStrip from "./products/ProductKpiStrip.vue";
import ProductListPanel from "./products/ProductListPanel.vue";
import ProductDetailPanel from "./products/ProductDetailPanel.vue";
import OwnedProductCreateDialog from "./products/OwnedProductCreateDialog.vue";
import OwnedProductMetricDialog from "./products/OwnedProductMetricDialog.vue";
import OwnedProductStoreDialog from "./products/OwnedProductStoreDialog.vue";

const props = defineProps<{ date: string }>();

const store = useProductStore();
const commerceStoresStore = useCommerceStoresStore();
const { stores: commerceStores } = storeToRefs(commerceStoresStore);
const { products, selectedProduct, selectedOperations, loading, detailLoading, error, query, status, storeId } =
  storeToRefs(store);
const emit = defineEmits<{ navigate: [tab: TabKey] }>();

const createDialogOpen = ref(false);
const metricDialogOpen = ref(false);
const storeDialogOpen = ref(false);
const metricProduct = ref<OwnedProductListItem | OwnedProductDetail | null>(
  null,
);

watch(
  () => props.date,
  async (date) => {
    await store.fetchProducts(date);
    if (selectedProduct.value) {
      await store.selectProduct(selectedProduct.value.id, date);
    }
  },
);

onMounted(async () => {
  await Promise.all([
    store.fetchProducts(props.date),
    commerceStoresStore.fetchStores(),
  ]);
});

async function selectProduct(item: OwnedProductListItem): Promise<void> {
  await store.selectProduct(item.id, props.date);
}

function openMetricDialog(
  item: OwnedProductListItem | OwnedProductDetail,
): void {
  metricProduct.value = item;
  metricDialogOpen.value = true;
  void store.selectProduct(item.id, props.date);
}
</script>

<template>
  <section class="view products-view">
    <header class="products-toolbar panel">
      <div>
        <p class="eyebrow">Owned SKU Center</p>
        <h2>自营 SKU 经营中心</h2>
      </div>
      <div class="products-toolbar__actions">
        <ElInput
          v-model="query"
          clearable
          placeholder="搜索 SKU / ASIN / 标题"
          style="width: 240px"
          @keyup.enter="store.fetchProducts(props.date)"
        />
        <ElSelect
          v-model="status"
          style="width: 120px"
          @change="store.fetchProducts(props.date)"
        >
          <ElOption label="活跃" value="active" />
          <ElOption label="暂停" value="paused" />
          <ElOption label="归档" value="archived" />
          <ElOption label="全部" value="all" />
        </ElSelect>
        <ElSelect
          v-model="storeId"
          clearable
          placeholder="全部店铺"
          style="width: 150px"
          @change="store.fetchProducts(props.date)"
        >
          <ElOption
            v-for="item in commerceStores"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </ElSelect>
        <ElButton :loading="loading" @click="store.fetchProducts(props.date)">
          <template #icon><RefreshCw :size="14" /></template>
          刷新
        </ElButton>
        <ElButton type="primary" @click="createDialogOpen = true">
          <template #icon><PackagePlus :size="14" /></template>
          新增 SKU
        </ElButton>
      </div>
    </header>

    <ProductKpiStrip :products="products" />

    <p v-if="error" class="products-error">{{ error }}</p>

    <div class="products-layout">
      <ProductListPanel
        :products="products"
        :selected-product-id="selectedProduct?.id ?? null"
        :stores="commerceStores"
        :loading="loading"
        :date="props.date"
        @select="selectProduct"
        @edit-metric="openMetricDialog"
      />
      <ProductDetailPanel
        :operations="selectedOperations"
        :stores="commerceStores"
        :loading="detailLoading"
        @edit-store="storeDialogOpen = true"
        @edit-metric="openMetricDialog"
        @navigate="emit('navigate', $event)"
      />
    </div>

    <OwnedProductCreateDialog v-model="createDialogOpen" :date="props.date" />
    <OwnedProductMetricDialog
      v-model="metricDialogOpen"
      :product="metricProduct"
      :date="props.date"
    />
    <OwnedProductStoreDialog
      v-model="storeDialogOpen"
      :product="selectedProduct"
      :date="props.date"
    />
  </section>
</template>

<style src="../styles/products.css"></style>
