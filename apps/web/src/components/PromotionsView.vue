<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { watchDebounced } from "@vueuse/core";
import { ElButton, ElInput, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { CalendarDays, CheckCircle2, ClipboardPlus, Pencil, Plus, RefreshCw } from "@lucide/vue";
import type { PromotionMonitorState, PromotionPlanView, PromotionTaskKind } from "@amazon-monitor/shared";
import { useWriteAccess } from "../composables/useWriteAccess";
import { usePromotionStore } from "../stores/promotions";
import PromotionPlanDialog from "./promotions/PromotionPlanDialog.vue";

const props = defineProps<{ date: string }>();
const promotionStore = usePromotionStore();
const { plans, visiblePlans, stores, loading, saving, error, query, storeId, monitorState } = storeToRefs(promotionStore);
const { canWrite } = useWriteAccess("manage_workflow");
const dialogOpen = ref(false);
const editingPlan = ref<PromotionPlanView | null>(null);

const stateLabels: Record<PromotionMonitorState, string> = {
  preparation_due: "临期准备",
  upcoming: "待开始",
  active: "进行中",
  review_due: "待复盘",
  completed: "已完成",
  cancelled: "已取消"
};

const stateTypes: Record<PromotionMonitorState, "danger" | "warning" | "primary" | "success" | "info"> = {
  preparation_due: "warning",
  upcoming: "info",
  active: "primary",
  review_due: "danger",
  completed: "success",
  cancelled: "info"
};

const summary = computed(() => ({
  preparation: plans.value.filter((item) => item.monitorState === "preparation_due").length,
  active: plans.value.filter((item) => item.monitorState === "active").length,
  review: plans.value.filter((item) => item.monitorState === "review_due").length,
  upcoming: plans.value.filter((item) => item.monitorState === "upcoming").length
}));

watchDebounced([query, storeId], () => promotionStore.fetchWorkspace(props.date), { debounce: 300 });

function openCreate(): void {
  editingPlan.value = null;
  dialogOpen.value = true;
}

function openEdit(plan: PromotionPlanView): void {
  editingPlan.value = plan;
  dialogOpen.value = true;
}

async function savePlan(payload: Parameters<typeof promotionStore.createPlan>[0]): Promise<void> {
  try {
    if (editingPlan.value) await promotionStore.updatePlan(editingPlan.value.id, payload, props.date);
    else await promotionStore.createPlan(payload, props.date);
    dialogOpen.value = false;
    ElMessage.success(editingPlan.value ? "活动计划已更新" : "活动计划已创建");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function updateStatus(plan: PromotionPlanView, status: "ready" | "completed"): Promise<void> {
  try {
    await promotionStore.updatePlan(plan.id, { status }, props.date);
    ElMessage.success(status === "ready" ? "活动已标记为准备就绪" : "活动已完成");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function createTask(plan: PromotionPlanView, kind: PromotionTaskKind): Promise<void> {
  try {
    const created = await promotionStore.createTask(plan.id, kind, props.date);
    ElMessage.success(created ? "任务已创建" : "该任务已存在");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function subject(plan: PromotionPlanView): string {
  return [plan.storeName, plan.sku, plan.asin].filter(Boolean).join(" · ") || `${plan.marketplace} 全店`;
}

function money(value: number | null): string {
  return value === null ? "-" : `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
</script>

<template>
  <section class="view promotions-view">
    <header class="promotions-header panel">
      <div>
        <p class="eyebrow">Campaign Calendar</p>
        <h2>活动排期</h2>
        <span>把价格、库存、广告和复盘动作放进同一条活动时间线。</span>
      </div>
      <div class="promotions-header__actions">
        <ElButton circle :loading="loading" title="刷新活动" @click="promotionStore.fetchWorkspace(date)"><RefreshCw :size="15" /></ElButton>
        <ElButton v-if="canWrite" type="primary" @click="openCreate"><template #icon><Plus :size="15" /></template>新增活动</ElButton>
      </div>
    </header>

    <div class="promotion-summary">
      <article><span>临期准备</span><strong>{{ summary.preparation }}</strong><small>7 天内未就绪</small></article>
      <article><span>进行中</span><strong>{{ summary.active }}</strong><small>关注价格与库存</small></article>
      <article><span>待复盘</span><strong>{{ summary.review }}</strong><small>活动结束未归档</small></article>
      <article><span>后续活动</span><strong>{{ summary.upcoming }}</strong><small>提前安排资源</small></article>
    </div>

    <section class="promotion-workspace">
      <div class="promotion-filters">
        <ElInput v-model="query" clearable placeholder="搜索活动、SKU、ASIN 或品牌" />
        <ElSelect v-model="storeId" clearable placeholder="全部店铺">
          <ElOption v-for="item in stores" :key="item.id" :label="`${item.name} · ${item.marketplace}`" :value="item.id" />
        </ElSelect>
        <ElSelect v-model="monitorState" placeholder="全部状态">
          <ElOption label="全部状态" value="all" />
          <ElOption v-for="(label, value) in stateLabels" :key="value" :label="label" :value="value" />
        </ElSelect>
      </div>

      <p v-if="error" class="promotion-error">{{ error }}</p>
      <div v-if="!loading && visiblePlans.length === 0" class="promotion-empty">
        <CalendarDays :size="30" />
        <strong>当前筛选下没有活动计划</strong>
        <span>新增活动后，系统会自动识别临期准备、进行中和待复盘状态。</span>
      </div>

      <div v-else class="promotion-list">
        <article v-for="plan in visiblePlans" :key="plan.id" class="promotion-row">
          <div class="promotion-dates">
            <strong>{{ plan.startDate.slice(5) }}</strong>
            <span>至</span>
            <strong>{{ plan.endDate.slice(5) }}</strong>
          </div>
          <div class="promotion-main">
            <div class="promotion-title">
              <div><h3>{{ plan.name }}</h3><span>{{ subject(plan) }}</span></div>
              <ElTag :type="stateTypes[plan.monitorState]" effect="light">{{ stateLabels[plan.monitorState] }}</ElTag>
            </div>
            <div class="promotion-facts">
              <span>活动价 <strong>{{ money(plan.targetPrice) }}</strong></span>
              <span>预算 <strong>{{ money(plan.budget) }}</strong></span>
              <span>备货 <strong>{{ plan.inventoryTarget ?? "-" }}</strong></span>
              <span>{{ plan.marketplace }} · {{ plan.type.replaceAll("_", " ") }}</span>
            </div>
            <p v-if="plan.notes">{{ plan.notes }}</p>
          </div>
          <div class="promotion-actions">
            <ElButton v-if="canWrite" circle title="编辑活动" @click="openEdit(plan)"><Pencil :size="14" /></ElButton>
            <ElButton v-if="canWrite && plan.status === 'planned'" size="small" @click="updateStatus(plan, 'ready')"><CheckCircle2 :size="14" /><span>准备就绪</span></ElButton>
            <ElButton v-if="canWrite && !plan.preparationTaskId && ['preparation_due', 'upcoming'].includes(plan.monitorState)" size="small" @click="createTask(plan, 'preparation')"><ClipboardPlus :size="14" /><span>准备任务</span></ElButton>
            <ElTag v-else-if="plan.preparationTaskId" type="info" effect="plain">准备 #{{ plan.preparationTaskId }}</ElTag>
            <ElButton v-if="canWrite && !plan.reviewTaskId && ['active', 'review_due'].includes(plan.monitorState)" size="small" type="primary" plain @click="createTask(plan, 'review')"><ClipboardPlus :size="14" /><span>复盘任务</span></ElButton>
            <ElTag v-else-if="plan.reviewTaskId" type="info" effect="plain">复盘 #{{ plan.reviewTaskId }}</ElTag>
            <ElButton v-if="canWrite && plan.monitorState === 'review_due'" size="small" type="success" plain @click="updateStatus(plan, 'completed')">完成活动</ElButton>
          </div>
        </article>
      </div>
    </section>

    <PromotionPlanDialog v-model="dialogOpen" :plan="editingPlan" :saving="saving" :date="date" @save="savePlan" />
  </section>
</template>

<style scoped>
.promotions-view { gap: 12px; }
.promotions-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; }
.promotions-header h2 { margin: 2px 0 4px; }
.promotions-header span { color: var(--color-text-secondary); font-size: 13px; }
.promotions-header__actions { display: flex; gap: 8px; align-items: center; }
.promotion-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.promotion-summary article { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; padding: 14px 16px; background: var(--color-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.promotion-summary span, .promotion-summary small { color: var(--color-text-secondary); font-size: 12px; }
.promotion-summary strong { grid-row: 1 / 3; grid-column: 2; align-self: center; font-size: 25px; }
.promotion-workspace { min-height: 0; overflow: auto; padding: 2px; }
.promotion-filters { display: grid; grid-template-columns: minmax(240px, 1fr) 220px 180px; gap: 8px; margin-bottom: 10px; }
.promotion-list { display: grid; gap: 8px; }
.promotion-row { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 15px 16px; background: var(--color-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.promotion-dates { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 5px; color: var(--color-text-secondary); font-size: 11px; }
.promotion-dates strong { color: var(--color-text-primary); font-size: 14px; }
.promotion-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.promotion-title h3 { margin: 0 0 3px; font-size: 15px; }
.promotion-title span, .promotion-main p { color: var(--color-text-secondary); font-size: 12px; }
.promotion-facts { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 12px; color: var(--color-text-secondary); }
.promotion-facts strong { color: var(--color-text-primary); }
.promotion-main p { margin: 8px 0 0; }
.promotion-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; max-width: 330px; }
.promotion-actions :deep(.el-button + .el-button) { margin-left: 0; }
.promotion-error { color: var(--color-danger); font-size: 13px; }
.promotion-empty { display: grid; place-items: center; gap: 8px; min-height: 260px; color: var(--color-text-secondary); text-align: center; }
.promotion-empty strong { color: var(--color-text-primary); }
@media (max-width: 980px) { .promotion-summary { grid-template-columns: repeat(2, 1fr); } .promotion-row { grid-template-columns: 80px 1fr; } .promotion-actions { grid-column: 2; justify-content: flex-start; max-width: none; } }
@media (max-width: 640px) { .promotions-header { align-items: flex-start; } .promotions-header__actions { flex-shrink: 0; } .promotion-filters, .promotion-summary { grid-template-columns: 1fr; } .promotion-row { grid-template-columns: 1fr; gap: 10px; } .promotion-dates { width: 100px; } .promotion-actions { grid-column: 1; justify-content: flex-start; } }
</style>
