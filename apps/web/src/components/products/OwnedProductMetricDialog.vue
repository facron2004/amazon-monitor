<script setup lang="ts">
import { reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElMessage } from "element-plus";
import type {
  OwnedProductDetail,
  OwnedProductListItem,
} from "@amazon-monitor/shared";
import { useProductStore } from "../../stores/products";

const props = defineProps<{
  product: OwnedProductListItem | OwnedProductDetail | null;
  date: string;
}>();
const dialog = defineModel<boolean>({ default: false });

const productStore = useProductStore();
const { saving } = storeToRefs(productStore);

const form = reactive({
  date: props.date,
  salesAmount: null as number | null,
  orders: null as number | null,
  inventoryDays: null as number | null,
  adSpend: null as number | null,
  acos: null as number | null,
  grossMargin: null as number | null,
  bsrRank: null as number | null,
  keywordRank: null as number | null,
  rating: null as number | null,
  reviewCount: null as number | null,
});

watch(
  [dialog, () => props.product, () => props.date],
  ([open]) => {
    if (!open) return;
    const metric = props.product?.latestMetric;
    form.date = props.date;
    form.salesAmount = metric?.salesAmount ?? null;
    form.orders = metric?.orders ?? null;
    form.inventoryDays = metric?.inventoryDays ?? null;
    form.adSpend = metric?.adSpend ?? null;
    form.acos = metric?.acos ?? null;
    form.grossMargin = metric?.grossMargin ?? null;
    form.bsrRank = metric?.bsrRank ?? null;
    form.keywordRank = metric?.keywordRank ?? null;
    form.rating = metric?.rating ?? null;
    form.reviewCount = metric?.reviewCount ?? null;
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  if (!props.product) return;

  try {
    await productStore.upsertMetric(
      props.product.id,
      {
        date: form.date,
        salesAmount: form.salesAmount,
        orders: form.orders,
        inventoryDays: form.inventoryDays,
        adSpend: form.adSpend,
        acos: form.acos,
        grossMargin: form.grossMargin,
        bsrRank: form.bsrRank,
        keywordRank: form.keywordRank,
        rating: form.rating,
        reviewCount: form.reviewCount,
        syncStatus: "manual",
        dataSource: "manual",
      },
      props.date,
    );
    dialog.value = false;
    ElMessage.success("已保存指标");
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}
</script>

<template>
  <ElDialog
    v-model="dialog"
    title="录入经营指标"
    width="min(680px, calc(100vw - 24px))"
  >
    <div class="metric-form-grid">
      <ElInput v-model="form.date" placeholder="日期" />
      <ElInput v-model.number="form.salesAmount" placeholder="销售额" />
      <ElInput v-model.number="form.orders" placeholder="订单数" />
      <ElInput v-model.number="form.inventoryDays" placeholder="库存天数" />
      <ElInput v-model.number="form.adSpend" placeholder="广告花费" />
      <ElInput v-model.number="form.acos" placeholder="ACOS，如 0.25" />
      <ElInput
        v-model.number="form.grossMargin"
        placeholder="毛利率，如 0.32"
      />
      <ElInput v-model.number="form.bsrRank" placeholder="BSR 排名" />
      <ElInput v-model.number="form.keywordRank" placeholder="核心词排名" />
      <ElInput v-model.number="form.rating" placeholder="评分" />
      <ElInput v-model.number="form.reviewCount" placeholder="Review 数" />
    </div>
    <template #footer>
      <ElButton @click="dialog = false">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">保存</ElButton>
    </template>
  </ElDialog>
</template>
