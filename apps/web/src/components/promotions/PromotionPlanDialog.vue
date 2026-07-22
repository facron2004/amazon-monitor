<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDatePicker, ElDialog, ElInput, ElInputNumber, ElOption, ElSelect } from "element-plus";
import type { PromotionPlanStatus, PromotionPlanType, PromotionPlanView } from "@amazon-monitor/shared";
import type { CreatePromotionPayload } from "../../api-promotions";
import { usePromotionStore } from "../../stores/promotions";

const props = defineProps<{
  modelValue: boolean;
  plan: PromotionPlanView | null;
  saving: boolean;
  date: string;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "save", value: CreatePromotionPayload): void;
}>();

const promotionStore = usePromotionStore();
const { stores, products } = storeToRefs(promotionStore);
const form = reactive({
  storeId: null as number | null,
  productId: null as number | null,
  name: "",
  type: "custom" as PromotionPlanType,
  marketplace: "US",
  startDate: "",
  endDate: "",
  status: "planned" as PromotionPlanStatus,
  targetPrice: null as number | null,
  budget: null as number | null,
  inventoryTarget: null as number | null,
  notes: ""
});

const typeOptions: Array<{ value: PromotionPlanType; label: string }> = [
  { value: "prime_day", label: "Prime Day" },
  { value: "black_friday", label: "Black Friday" },
  { value: "cyber_monday", label: "Cyber Monday" },
  { value: "deal", label: "Deal" },
  { value: "coupon", label: "Coupon" },
  { value: "seasonal", label: "季节活动" },
  { value: "custom", label: "自定义" }
];

const matchingStores = computed(() => stores.value.filter(
  (item) => item.status === "active" && item.marketplace.toLowerCase() === form.marketplace.toLowerCase()
));
const matchingProducts = computed(() => products.value.filter((item) => {
  if (item.marketplace.toLowerCase() !== form.marketplace.toLowerCase()) return false;
  return form.storeId === null || item.storeId === null || item.storeId === form.storeId;
}));

watch(() => props.modelValue, (open) => {
  if (!open) return;
  if (props.plan) {
    Object.assign(form, {
      storeId: props.plan.storeId,
      productId: props.plan.productId,
      name: props.plan.name,
      type: props.plan.type,
      marketplace: props.plan.marketplace,
      startDate: props.plan.startDate,
      endDate: props.plan.endDate,
      status: props.plan.status,
      targetPrice: props.plan.targetPrice,
      budget: props.plan.budget,
      inventoryTarget: props.plan.inventoryTarget,
      notes: props.plan.notes ?? ""
    });
    return;
  }
  const startDate = props.date;
  const end = new Date(`${startDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  Object.assign(form, {
    storeId: null,
    productId: null,
    name: "",
    type: "custom",
    marketplace: "US",
    startDate,
    endDate: end.toISOString().slice(0, 10),
    status: "planned",
    targetPrice: null,
    budget: null,
    inventoryTarget: null,
    notes: ""
  });
}, { immediate: true });

watch(() => form.marketplace, () => {
  if (!matchingStores.value.some((item) => item.id === form.storeId)) form.storeId = null;
  if (!matchingProducts.value.some((item) => item.id === form.productId)) form.productId = null;
});

watch(() => form.storeId, () => {
  if (!matchingProducts.value.some((item) => item.id === form.productId)) form.productId = null;
});

function submit(): void {
  emit("save", {
    storeId: form.storeId,
    productId: form.productId,
    name: form.name.trim(),
    type: form.type,
    marketplace: form.marketplace,
    startDate: form.startDate,
    endDate: form.endDate,
    status: form.status,
    targetPrice: form.targetPrice,
    budget: form.budget,
    inventoryTarget: form.inventoryTarget,
    notes: form.notes.trim() || null
  });
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="plan ? '编辑活动计划' : '新增活动计划'"
    width="min(680px, calc(100vw - 24px))"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="promotion-form">
      <label class="wide"><span>活动名称</span><ElInput v-model="form.name" placeholder="US Prime Day · Ice Maker" /></label>
      <label><span>活动类型</span><ElSelect v-model="form.type"><ElOption v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" /></ElSelect></label>
      <label><span>站点</span><ElSelect v-model="form.marketplace"><ElOption v-for="item in ['US', 'UK', 'DE', 'JP']" :key="item" :label="item" :value="item" /></ElSelect></label>
      <label><span>店铺</span><ElSelect v-model="form.storeId" clearable placeholder="全店/暂不指定"><ElOption v-for="item in matchingStores" :key="item.id" :label="item.name" :value="item.id" /></ElSelect></label>
      <label><span>SKU</span><ElSelect v-model="form.productId" clearable filterable placeholder="全店活动"><ElOption v-for="item in matchingProducts" :key="item.id" :label="`${item.sku} · ${item.asin}`" :value="item.id" /></ElSelect></label>
      <label><span>开始日期</span><ElDatePicker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" /></label>
      <label><span>结束日期</span><ElDatePicker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" /></label>
      <label><span>目标活动价</span><ElInputNumber v-model="form.targetPrice" :min="0" :precision="2" controls-position="right" /></label>
      <label><span>活动预算</span><ElInputNumber v-model="form.budget" :min="0" :precision="2" controls-position="right" /></label>
      <label><span>备货目标</span><ElInputNumber v-model="form.inventoryTarget" :min="0" :precision="0" controls-position="right" /></label>
      <label><span>计划状态</span><ElSelect v-model="form.status"><ElOption label="计划中" value="planned" /><ElOption label="准备就绪" value="ready" /><ElOption label="已完成" value="completed" /><ElOption label="已取消" value="cancelled" /></ElSelect></label>
      <label class="wide"><span>运营备注</span><ElInput v-model="form.notes" type="textarea" :rows="3" placeholder="价格、库存、广告、素材或审批说明" /></label>
    </div>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
      <ElButton type="primary" :loading="saving" :disabled="!form.name || !form.startDate || !form.endDate" @click="submit">保存计划</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.promotion-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.promotion-form label { display: grid; gap: 6px; min-width: 0; }
.promotion-form label > span { color: var(--color-text-secondary); font-size: 12px; font-weight: 650; }
.promotion-form .wide { grid-column: 1 / -1; }
.promotion-form :deep(.el-select), .promotion-form :deep(.el-date-editor), .promotion-form :deep(.el-input-number) { width: 100%; }
@media (max-width: 560px) { .promotion-form { grid-template-columns: 1fr; } .promotion-form .wide { grid-column: auto; } }
</style>
