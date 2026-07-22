<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  ElButton,
  ElDialog,
  ElMessage,
  ElOption,
  ElSelect,
} from "element-plus";
import type { OwnedProductDetail } from "@amazon-monitor/shared";
import { useProductStore } from "../../stores/products";
import { useCommerceStoresStore } from "../../stores/commerceStores";

const props = defineProps<{
  product: OwnedProductDetail | null;
  date: string;
}>();
const dialog = defineModel<boolean>({ default: false });

const productStore = useProductStore();
const commerceStoresStore = useCommerceStoresStore();
const { saving } = storeToRefs(productStore);
const { activeStores } = storeToRefs(commerceStoresStore);
const storeId = ref<number | null>(null);

const matchingStores = computed(() => {
  const marketplace = props.product?.marketplace.toLowerCase();
  if (!marketplace) return [];
  return activeStores.value.filter(
    (item) => item.marketplace.toLowerCase() === marketplace,
  );
});

watch(
  [dialog, () => props.product],
  ([open]) => {
    if (open) storeId.value = props.product?.storeId ?? null;
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  if (!props.product) return;

  try {
    await productStore.updateProductStore(
      props.product.id,
      storeId.value,
      props.date,
    );
    dialog.value = false;
    ElMessage.success("店铺归属已更新");
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}
</script>

<template>
  <ElDialog
    v-model="dialog"
    title="调整店铺归属"
    width="min(440px, calc(100vw - 24px))"
  >
    <ElSelect
      v-model="storeId"
      clearable
      placeholder="未分配店铺"
      style="width: 100%"
    >
      <ElOption
        v-for="item in matchingStores"
        :key="item.id"
        :label="`${item.name} · ${item.sellerId}`"
        :value="item.id"
      />
    </ElSelect>
    <template #footer>
      <ElButton @click="dialog = false">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">保存</ElButton>
    </template>
  </ElDialog>
</template>
