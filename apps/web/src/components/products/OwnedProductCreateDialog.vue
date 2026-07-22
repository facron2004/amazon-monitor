<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
} from "element-plus";
import { useProductStore } from "../../stores/products";
import { useCommerceStoresStore } from "../../stores/commerceStores";

const props = defineProps<{ date: string }>();
const dialog = defineModel<boolean>({ default: false });

const productStore = useProductStore();
const commerceStoresStore = useCommerceStoresStore();
const { saving } = storeToRefs(productStore);
const { activeStores } = storeToRefs(commerceStoresStore);

const form = reactive({
  storeId: null as number | null,
  marketplace: "US",
  sku: "",
  asin: "",
  brand: "",
  title: "",
  category: "",
});

const matchingStores = computed(() =>
  activeStores.value.filter(
    (item) =>
      item.marketplace.toLowerCase() === form.marketplace.trim().toLowerCase(),
  ),
);

watch(dialog, (open) => {
  if (!open) return;
  form.storeId = null;
  form.marketplace = "US";
  form.sku = "";
  form.asin = "";
  form.brand = "";
  form.title = "";
  form.category = "";
});

async function submit(): Promise<void> {
  if (!form.sku.trim() || !form.asin.trim() || !form.title.trim()) {
    ElMessage.warning("请填写 SKU、ASIN 和标题");
    return;
  }

  try {
    await productStore.createProduct(
      {
        storeId: form.storeId,
        marketplace: form.marketplace.trim(),
        sku: form.sku.trim(),
        asin: form.asin.trim(),
        brand: form.brand.trim() || null,
        title: form.title.trim(),
        category: form.category.trim() || null,
        syncStatus: "manual",
        dataSource: "manual",
      },
      props.date,
    );
    dialog.value = false;
    ElMessage.success("已新增 SKU");
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}
</script>

<template>
  <ElDialog
    v-model="dialog"
    title="新增自营 SKU"
    width="min(560px, calc(100vw - 24px))"
  >
    <div class="product-form-grid">
      <ElInput v-model="form.sku" placeholder="SKU" />
      <ElInput v-model="form.asin" placeholder="ASIN" />
      <ElInput v-model="form.marketplace" placeholder="站点" />
      <ElSelect v-model="form.storeId" clearable placeholder="所属店铺（可选）">
        <ElOption
          v-for="item in matchingStores"
          :key="item.id"
          :label="`${item.name} · ${item.sellerId}`"
          :value="item.id"
        />
      </ElSelect>
      <ElInput v-model="form.brand" placeholder="品牌" />
      <ElInput
        v-model="form.title"
        class="product-form-wide"
        placeholder="标题"
      />
      <ElInput
        v-model="form.category"
        class="product-form-wide"
        placeholder="类目"
      />
    </div>
    <template #footer>
      <ElButton @click="dialog = false">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">创建</ElButton>
    </template>
  </ElDialog>
</template>
