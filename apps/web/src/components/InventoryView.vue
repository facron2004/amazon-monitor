<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { AlertTriangle, PackageCheck, RefreshCw, Save, Settings, Warehouse } from "@lucide/vue";
import type { InventoryPlanLevel, InventoryReplenishmentPlan } from "@amazon-monitor/shared";
import { useInventoryStore } from "../stores/inventory";

const props = defineProps<{ date: string }>();

const store = useInventoryStore();
const { plans, selectedProductId, selectedPlan, loading, saving, error, query, level } = storeToRefs(store);

const settingDialogOpen = ref(false);
const settingForm = reactive({
  productId: 0,
  leadTimeDays: 21 as number | string,
  safetyStockDays: 14 as number | string,
  targetStockDays: 60 as number | string,
  minOrderQuantity: null as number | string | null,
  packSize: null as number | string | null,
  supplierName: "",
  reorderPointUnits: null as number | string | null
});

const criticalCount = computed(() => plans.value.filter((plan) => plan.level === "critical").length);
const watchCount = computed(() => plans.value.filter((plan) => plan.level === "watch").length);
const overstockCount = computed(() => plans.value.filter((plan) => plan.level === "overstock").length);
const recommendedUnits = computed(() =>
  plans.value.reduce((sum, plan) => sum + (plan.recommendedOrderQuantity ?? 0), 0)
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
  settingForm.safetyStockDays = target.setting?.safetyStockDays ?? target.safetyStockDays;
  settingForm.targetStockDays = target.setting?.targetStockDays ?? target.targetStockDays;
  settingForm.minOrderQuantity = target.setting?.minOrderQuantity ?? null;
  settingForm.packSize = target.setting?.packSize ?? null;
  settingForm.supplierName = target.setting?.supplierName ?? "";
  settingForm.reorderPointUnits = target.setting?.reorderPointUnits ?? target.reorderPointUnits;
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
      safetyStockDays: cleanNumber(settingForm.safetyStockDays),
      targetStockDays: cleanNumber(settingForm.targetStockDays),
      minOrderQuantity: cleanNumber(settingForm.minOrderQuantity),
      packSize: cleanNumber(settingForm.packSize),
      supplierName: emptyToNull(settingForm.supplierName),
      reorderPointUnits: cleanNumber(settingForm.reorderPointUnits),
      dataSource: "manual",
      syncStatus: "manual"
    }, props.date);
    settingDialogOpen.value = false;
    ElMessage.success("Inventory settings saved.");
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
                <th>Stock</th>
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
                  <strong>{{ formatNumber(plan.inventoryAvailable) }}</strong>
                  <small>{{ formatDays(plan.inventoryDays) }}</small>
                </td>
                <td>
                  <strong>{{ formatNumber(plan.dailySalesVelocity, 1) }}</strong>
                  <small>units/day</small>
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

          <section class="inventory-detail-grid">
            <div><span>Inventory days</span><strong>{{ formatDays(selectedPlan.inventoryDays) }}</strong></div>
            <div><span>Available units</span><strong>{{ formatNumber(selectedPlan.inventoryAvailable) }}</strong></div>
            <div><span>Daily velocity</span><strong>{{ formatNumber(selectedPlan.dailySalesVelocity, 1) }}</strong></div>
            <div><span>Recommended qty</span><strong>{{ formatNumber(selectedPlan.recommendedOrderQuantity) }}</strong></div>
          </section>

          <section class="inventory-section">
            <h3>Thresholds</h3>
            <div class="inventory-thresholds">
              <span>Lead time</span><strong>{{ selectedPlan.leadTimeDays }} days</strong>
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
        <ElInput v-model.number="settingForm.safetyStockDays" placeholder="Safety stock days" />
        <ElInput v-model.number="settingForm.targetStockDays" placeholder="Target stock days" />
        <ElInput v-model.number="settingForm.reorderPointUnits" placeholder="Reorder point units" />
        <ElInput v-model.number="settingForm.minOrderQuantity" placeholder="Minimum order quantity" />
        <ElInput v-model.number="settingForm.packSize" placeholder="Pack size" />
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
