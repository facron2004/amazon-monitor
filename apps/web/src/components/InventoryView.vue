<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { AlertTriangle, ClipboardPlus, PackageCheck, RefreshCw, Save, Settings, ShieldCheck, Warehouse } from "@lucide/vue";
import type { InventoryPlanLevel, InventoryReplenishmentPlan } from "@amazon-monitor/shared";
import { useWriteAccess } from "../composables/useWriteAccess";
import { useInventoryStore } from "../stores/inventory";

const props = defineProps<{ date: string }>();

const store = useInventoryStore();
const {
  plans,
  selectedProductId,
  selectedPlan,
  loading,
  saving,
  creatingTaskProductId,
  taskIdsByProductId,
  error,
  query,
  level
} = storeToRefs(store);
const { canWrite } = useWriteAccess("manage_workflow");

const settingDialogOpen = ref(false);
const settingForm = reactive({
  productId: 0,
  leadTimeDays: 21 as number | string,
  productionLeadTimeDays: null as number | string | null,
  inboundLeadTimeDays: null as number | string | null,
  safetyStockDays: 14 as number | string,
  targetStockDays: 60 as number | string,
  minOrderQuantity: null as number | string | null,
  packSize: null as number | string | null,
  supplierName: "",
  reorderPointUnits: null as number | string | null,
  inTransitUnits: null as number | string | null,
  localWarehouseUnits: null as number | string | null,
  expectedArrivalDate: ""
});

const criticalCount = computed(() => plans.value.filter((plan) => plan.level === "critical").length);
const watchCount = computed(() => plans.value.filter((plan) => plan.level === "watch").length);
const overstockCount = computed(() => plans.value.filter((plan) => plan.level === "overstock").length);
const recommendedUnits = computed(() =>
  plans.value.reduce((sum, plan) => sum + (plan.recommendedOrderQuantity ?? 0), 0)
);
const selectedPlanHasAction = computed(() =>
  selectedPlan.value?.issues.some((issue) => issue.type !== "data_gap") ?? false
);

watch(() => props.date, async (date) => {
  await store.fetchPlans(date);
});

onMounted(async () => {
  await store.fetchPlans(props.date);
});

function selectPlan(plan: InventoryReplenishmentPlan): void {
  store.selectProduct(plan.productId);
}

function openSettingDialog(plan?: InventoryReplenishmentPlan | null): void {
  const target = plan ?? selectedPlan.value;
  if (!target) return;
  settingForm.productId = target.productId;
  settingForm.leadTimeDays = target.setting?.leadTimeDays ?? target.leadTimeDays;
  settingForm.productionLeadTimeDays = target.setting?.productionLeadTimeDays ?? null;
  settingForm.inboundLeadTimeDays = target.setting?.inboundLeadTimeDays ?? null;
  settingForm.safetyStockDays = target.setting?.safetyStockDays ?? target.safetyStockDays;
  settingForm.targetStockDays = target.setting?.targetStockDays ?? target.targetStockDays;
  settingForm.minOrderQuantity = target.setting?.minOrderQuantity ?? null;
  settingForm.packSize = target.setting?.packSize ?? null;
  settingForm.supplierName = target.setting?.supplierName ?? "";
  settingForm.reorderPointUnits = target.setting?.reorderPointUnits ?? target.reorderPointUnits;
  settingForm.inTransitUnits = target.setting?.inTransitUnits ?? null;
  settingForm.localWarehouseUnits = target.setting?.localWarehouseUnits ?? null;
  settingForm.expectedArrivalDate = target.setting?.expectedArrivalDate ?? "";
  settingDialogOpen.value = true;
}

async function submitSetting(): Promise<void> {
  if (settingForm.productId <= 0) {
    ElMessage.warning("Select a SKU before saving inventory settings.");
    return;
  }
  try {
    await store.saveSetting(settingForm.productId, {
      leadTimeDays: cleanNumber(settingForm.leadTimeDays),
      productionLeadTimeDays: cleanNumber(settingForm.productionLeadTimeDays),
      inboundLeadTimeDays: cleanNumber(settingForm.inboundLeadTimeDays),
      safetyStockDays: cleanNumber(settingForm.safetyStockDays),
      targetStockDays: cleanNumber(settingForm.targetStockDays),
      minOrderQuantity: cleanNumber(settingForm.minOrderQuantity),
      packSize: cleanNumber(settingForm.packSize),
      supplierName: emptyToNull(settingForm.supplierName),
      reorderPointUnits: cleanNumber(settingForm.reorderPointUnits),
      inTransitUnits: cleanNumber(settingForm.inTransitUnits),
      localWarehouseUnits: cleanNumber(settingForm.localWarehouseUnits),
      expectedArrivalDate: emptyToNull(settingForm.expectedArrivalDate),
      dataSource: "manual",
      syncStatus: "manual"
    }, props.date);
    settingDialogOpen.value = false;
    ElMessage.success("Inventory settings saved.");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function createReplenishmentTask(): Promise<void> {
  const plan = selectedPlan.value;
  if (!plan) return;
  try {
    const result = await store.createPlanTask(plan.productId, props.date);
    ElMessage.success(result.created ? `库存任务 #${result.taskId} 已创建` : `库存任务 #${result.taskId} 已存在`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function levelType(value: InventoryPlanLevel): "success" | "warning" | "danger" | "info" {
  if (value === "healthy") return "success";
  if (value === "critical") return "danger";
  if (value === "overstock") return "info";
  return "warning";
}

function levelLabel(value: InventoryPlanLevel): string {
  if (value === "critical") return "Critical";
  if (value === "overstock") return "Overstock";
  if (value === "watch") return "Watch";
  return "Healthy";
}

function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatDays(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${formatNumber(value, 1)}d`;
}

function cleanNumber(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
</script>

<template>
  <section class="view inventory-view">
    <header class="inventory-toolbar panel">
      <div>
        <p class="eyebrow">Inventory Replenishment</p>
        <h2>Inventory planning</h2>
      </div>
      <div class="inventory-toolbar__actions">
        <ElInput v-model="query" clearable placeholder="Search SKU / ASIN / title" style="width: 260px" @keyup.enter="store.fetchPlans(props.date)" />
        <ElSelect v-model="level" clearable placeholder="Level" style="width: 150px" @change="store.fetchPlans(props.date)">
          <ElOption label="Critical" value="critical" />
          <ElOption label="Watch" value="watch" />
          <ElOption label="Overstock" value="overstock" />
          <ElOption label="Healthy" value="healthy" />
        </ElSelect>
        <ElButton :loading="loading" @click="store.fetchPlans(props.date)">
          <template #icon><RefreshCw :size="14" /></template>
          Refresh
        </ElButton>
        <ElButton type="primary" :disabled="!selectedPlan" @click="openSettingDialog()">
          <template #icon><Settings :size="14" /></template>
          Settings
        </ElButton>
      </div>
    </header>

    <div class="metrics inventory-metrics">
      <article class="metric">
        <span>Planned SKUs</span>
        <strong>{{ plans.length }}</strong>
      </article>
      <article class="metric hot">
        <span>Critical stockout</span>
        <strong>{{ criticalCount }}</strong>
      </article>
      <article class="metric">
        <span>Reorder watch</span>
        <strong>{{ watchCount }}</strong>
      </article>
      <article class="metric review-metric">
        <span>Recommended units</span>
        <strong>{{ formatNumber(recommendedUnits) }}</strong>
      </article>
    </div>

    <p v-if="error" class="inventory-error">{{ error }}</p>

    <div class="inventory-layout">
      <section class="panel inventory-list-panel">
        <div class="panel-head">
          <div>
            <h2>Replenishment queue</h2>
            <span>Evidence date {{ props.date }} · overstock {{ overstockCount }}</span>
          </div>
        </div>

        <div v-if="loading && plans.length === 0" class="empty-state compact-empty">
          <RefreshCw :size="22" class="spinning" />
          <p>Loading inventory plans</p>
        </div>

        <div v-else-if="plans.length === 0" class="empty-state">
          <Warehouse :size="28" />
          <p>No inventory plans match the current filters.</p>
        </div>

        <div v-else class="table-wrap compact-scroll inventory-table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                 <th>Supply position</th>
                <th>Velocity</th>
                <th>Reorder by</th>
                <th>Order qty</th>
                <th>Level</th>
                <th>Top issue</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="plan in plans"
                :key="plan.productId"
                :class="{ selected: selectedProductId === plan.productId }"
                @click="selectPlan(plan)"
              >
                <td class="inventory-product-cell">
                  <strong>{{ plan.sku }}</strong>
                  <span>{{ plan.asin }} · {{ plan.marketplace }} · {{ plan.brand || "Unknown brand" }}</span>
                  <small>{{ plan.productTitle }}</small>
                </td>
                <td>
                   <strong>{{ formatNumber(plan.supplyPositionUnits) }}</strong>
                   <small>FBA {{ formatNumber(plan.inventoryAvailable) }} · {{ formatDays(plan.inventoryDays) }}</small>
                </td>
                 <td>
                   <strong>{{ formatNumber(plan.salesVelocity7d, 1) }}</strong>
                   <small>7d · 30d {{ formatNumber(plan.salesVelocity30d, 1) }}</small>
                </td>
                <td>
                  <strong>{{ plan.reorderByDate ?? "-" }}</strong>
                  <small>stockout {{ plan.stockoutDate ?? "-" }}</small>
                </td>
                <td><strong>{{ formatNumber(plan.recommendedOrderQuantity) }}</strong></td>
                <td><ElTag :type="levelType(plan.level)" size="small">{{ levelLabel(plan.level) }}</ElTag></td>
                <td>
                  <strong>{{ plan.issues[0]?.label ?? "No blocking issue" }}</strong>
                  <small>{{ plan.issues[0]?.priority ?? "P2" }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel inventory-detail-panel">
        <div v-if="!selectedPlan" class="empty-state">
          <PackageCheck :size="28" />
          <p>Select a SKU to review replenishment thresholds.</p>
        </div>
        <template v-else>
          <div class="panel-head">
            <div>
              <h2>{{ selectedPlan.sku }}</h2>
              <span>{{ selectedPlan.asin }} · {{ selectedPlan.date ?? "No metric date" }}</span>
            </div>
            <ElButton size="small" @click="openSettingDialog(selectedPlan)">
              <template #icon><Settings :size="12" /></template>
              Settings
            </ElButton>
          </div>

           <section class="inventory-detail-grid inventory-supply-grid">
             <div><span>Inventory days</span><strong>{{ formatDays(selectedPlan.inventoryDays) }}</strong></div>
             <div><span>FBA available</span><strong>{{ formatNumber(selectedPlan.inventoryAvailable) }}</strong></div>
             <div><span>In transit</span><strong>{{ formatNumber(selectedPlan.inTransitUnits) }}</strong></div>
             <div><span>Local warehouse</span><strong>{{ formatNumber(selectedPlan.localWarehouseUnits) }}</strong></div>
             <div class="inventory-detail-grid__emphasis"><span>Supply position</span><strong>{{ formatNumber(selectedPlan.supplyPositionUnits) }}</strong></div>
             <div><span>7d daily velocity</span><strong>{{ formatNumber(selectedPlan.salesVelocity7d, 1) }}</strong></div>
             <div><span>30d daily velocity</span><strong>{{ formatNumber(selectedPlan.salesVelocity30d, 1) }}</strong></div>
             <div><span>Recommended qty</span><strong>{{ formatNumber(selectedPlan.recommendedOrderQuantity) }}</strong></div>
             <div><span>Expected arrival</span><strong>{{ selectedPlan.expectedArrivalDate ?? "-" }}</strong></div>
          </section>

          <section v-if="selectedPlanHasAction" class="inventory-section inventory-action">
            <div class="inventory-action__head">
              <div>
                <span>人工确认行动</span>
                <h3>{{ selectedPlan.level === "overstock" ? "库存处置建议" : "补货建议" }}</h3>
              </div>
              <ElTag type="warning" effect="plain">不自动执行</ElTag>
            </div>
            <p v-if="selectedPlan.level === 'overstock'">
              先核对销量趋势、活动计划和在途库存，再决定暂停补货、促销或清仓方案。
            </p>
            <p v-else>
              建议数量 {{ formatNumber(selectedPlan.recommendedOrderQuantity) }} 件。创建任务后仍需核对供应商交期、MOQ、装箱数、在途库存和现金计划。
            </p>
            <div class="inventory-action__boundary">
              <ShieldCheck :size="16" />
              <span>任务只记录建议与证据，不会自动采购、调价或修改广告。</span>
            </div>
            <ElButton
              v-if="canWrite && !taskIdsByProductId[selectedPlan.productId]"
              type="primary"
              :loading="creatingTaskProductId === selectedPlan.productId"
              @click="createReplenishmentTask"
            >
              <template #icon><ClipboardPlus :size="14" /></template>
              {{ selectedPlan.level === "overstock" ? "转库存处置任务" : "转补货任务" }}
            </ElButton>
            <ElTag v-else-if="taskIdsByProductId[selectedPlan.productId]" type="success" effect="plain">
              已创建任务 #{{ taskIdsByProductId[selectedPlan.productId] }}
            </ElTag>
          </section>

          <section class="inventory-section">
            <h3>Thresholds</h3>
            <div class="inventory-thresholds">
               <span>Total lead time</span><strong>{{ selectedPlan.leadTimeDays }} days</strong>
               <span>Production</span><strong>{{ formatDays(selectedPlan.productionLeadTimeDays) }}</strong>
               <span>Inbound</span><strong>{{ formatDays(selectedPlan.inboundLeadTimeDays) }}</strong>
              <span>Safety stock</span><strong>{{ selectedPlan.safetyStockDays }} days</strong>
              <span>Target stock</span><strong>{{ selectedPlan.targetStockDays }} days</strong>
              <span>Reorder point</span><strong>{{ formatNumber(selectedPlan.reorderPointUnits) }} units</strong>
              <span>Supplier</span><strong>{{ selectedPlan.setting?.supplierName ?? "-" }}</strong>
            </div>
          </section>

          <section class="inventory-section">
            <h3>Signals</h3>
            <div v-if="selectedPlan.issues.length === 0" class="inventory-ok">Inventory is outside reorder and overstock thresholds.</div>
            <article v-for="issue in selectedPlan.issues" :key="issue.type" class="inventory-issue">
              <ElTag :type="issue.priority === 'P0' ? 'danger' : 'warning'" size="small">{{ issue.priority }}</ElTag>
              <div>
                <strong>{{ issue.label }}</strong>
                <p>{{ issue.message }}</p>
                <small>{{ issue.suggestion }}</small>
              </div>
            </article>
          </section>

          <section class="inventory-section">
            <h3>Evidence</h3>
            <div class="inventory-evidence">
              <AlertTriangle :size="16" />
              <div>
                <strong>{{ selectedPlan.freshness.syncStatus }}</strong>
                <p>{{ selectedPlan.freshness.dataSource }} · {{ selectedPlan.freshness.lastSyncedAt ?? "not synced" }}</p>
              </div>
            </div>
          </section>
        </template>
      </aside>
    </div>

    <ElDialog v-model="settingDialogOpen" title="Inventory settings" width="640px">
      <div class="inventory-setting-form">
         <ElInput v-model.number="settingForm.leadTimeDays" placeholder="Lead time days" />
         <ElInput v-model.number="settingForm.productionLeadTimeDays" placeholder="Production lead time days" />
         <ElInput v-model.number="settingForm.inboundLeadTimeDays" placeholder="Inbound lead time days" />
        <ElInput v-model.number="settingForm.safetyStockDays" placeholder="Safety stock days" />
        <ElInput v-model.number="settingForm.targetStockDays" placeholder="Target stock days" />
        <ElInput v-model.number="settingForm.reorderPointUnits" placeholder="Reorder point units" />
        <ElInput v-model.number="settingForm.minOrderQuantity" placeholder="Minimum order quantity" />
         <ElInput v-model.number="settingForm.packSize" placeholder="Pack size" />
         <ElInput v-model.number="settingForm.inTransitUnits" placeholder="In-transit units" />
         <ElInput v-model.number="settingForm.localWarehouseUnits" placeholder="Local warehouse units" />
         <ElInput v-model="settingForm.expectedArrivalDate" type="date" placeholder="Expected arrival date" />
         <ElInput v-model="settingForm.supplierName" class="wide" placeholder="Supplier name" />
      </div>
      <template #footer>
        <ElButton @click="settingDialogOpen = false">Cancel</ElButton>
        <ElButton type="primary" :loading="saving" @click="submitSetting">
          <template #icon><Save :size="14" /></template>
          Save settings
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped src="../styles/inventory.css"></style>
