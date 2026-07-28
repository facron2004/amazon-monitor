<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElSkeleton, ElTabPane, ElTabs } from "element-plus";
import { BarChart3, ImageOff, Save, Store } from "@lucide/vue";
import type {
  CommerceStore,
  OwnedProductDetail,
  OwnedProductOperationsDetail,
} from "@amazon-monitor/shared";
import type { TabKey } from "../../constants/tabs";
import ProductHealthSnapshot from "./ProductHealthSnapshot.vue";
import ProductTrendWorkspace from "./ProductTrendWorkspace.vue";
import ProductWorkflowTimeline from "./ProductWorkflowTimeline.vue";

const props = defineProps<{
  operations: OwnedProductOperationsDetail | null;
  stores: CommerceStore[];
  loading: boolean;
}>();

const emit = defineEmits<{
  editStore: [];
  editMetric: [product: OwnedProductDetail];
  navigate: [tab: TabKey];
}>();

const activeSection = ref("trend");
const failedImageUrl = ref<string | null>(null);
const product = computed(() => props.operations?.product ?? null);
const showProductImage = computed(
  () =>
    Boolean(product.value?.imageUrl) &&
    product.value?.imageUrl !== failedImageUrl.value,
);

function storeName(id: number | null): string {
  if (id === null) return "未分配店铺";
  return props.stores.find((item) => item.id === id)?.name ?? `店铺 #${id}`;
}
</script>

<template>
  <aside class="panel products-detail-panel product-operations-detail">
    <div v-if="loading" class="product-detail-loading">
      <ElSkeleton :rows="12" animated />
    </div>
    <div v-else-if="!operations || !product" class="empty-state">
      <BarChart3 :size="28" />
      <p>选择一个 SKU 查看经营趋势、专项健康和工作闭环。</p>
    </div>
    <template v-else>
      <header class="product-detail-hero">
        <div class="product-detail-hero__media">
          <img
            v-if="showProductImage"
            :src="product.imageUrl ?? undefined"
            :alt="product.title"
            @error="failedImageUrl = product.imageUrl"
          />
          <ImageOff v-else :size="18" aria-hidden="true" />
        </div>
        <div class="product-detail-hero__identity">
          <span>{{ storeName(product.storeId) }} · {{ product.marketplace }}</span>
          <h2>{{ product.sku }}</h2>
          <p>{{ product.title }}</p>
          <small>
            {{ product.asin }} · {{ product.brand || "未标品牌" }}
            · 证据日 {{ operations.asOfDate }}
          </small>
        </div>
        <div class="products-panel-actions">
          <ElButton size="small" title="调整店铺归属" @click="emit('editStore')">
            <template #icon><Store :size="13" /></template>
            店铺
          </ElButton>
          <ElButton size="small" type="primary" @click="emit('editMetric', product)">
            <template #icon><Save :size="13" /></template>
            录入指标
          </ElButton>
        </div>
      </header>

      <ElTabs v-model="activeSection" class="product-detail-tabs">
        <ElTabPane label="经营趋势" name="trend">
          <ProductTrendWorkspace
            :metrics="product.metrics"
            :access="operations.access"
          />
        </ElTabPane>
        <ElTabPane label="健康与竞品" name="health">
          <ProductHealthSnapshot
            :operations="operations"
            @navigate="emit('navigate', $event)"
          />
        </ElTabPane>
        <ElTabPane
          :label="`工作闭环 ${operations.tasks.length}`"
          name="workflow"
        >
          <ProductWorkflowTimeline
            :operations="operations"
            @navigate="emit('navigate', $event)"
          />
        </ElTabPane>
      </ElTabs>
    </template>
  </aside>
</template>
