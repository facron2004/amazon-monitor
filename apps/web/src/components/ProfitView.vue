<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { BadgeDollarSign, RefreshCw, Save, Settings, ShieldCheck } from "@lucide/vue";
import type { ProductProfitPlan, ProductProfitScenario, ProfitPlanLevel } from "@amazon-monitor/shared";
import { useProfitStore } from "../stores/profit";

const props = defineProps<{ date: string }>();

const store = useProfitStore();
const { plans, selectedProductId, selectedPlan, loading, saving, error, query, level } = storeToRefs(store);

const settingDialogOpen = ref(false);
const settingForm = reactive({
  productId: 0,
  purchaseCost: null as number | string | null,
  inboundFreight: null as number | string | null,
  fbaFee: null as number | string | null,
  referralFeeRate: 0.15 as number | string,
  storageFee: null as number | string | null,
  returnLossRate: 0.03 as number | string,
  targetMarginRate: 0.3 as number | string,
  minimumMarginRate: 0.2 as number | string,
  dealFee: null as number | string | null
});

const riskCount = computed(() => plans.value.filter((plan) => plan.level === "risk").length);
const watchCount = computed(() => plans.value.filter((plan) => plan.level === "watch").length);
const dataGapCount = computed(() => plans.value.filter((plan) => plan.level === "data_gap").length);
const projectedProfit = computed(() =>
  plans.value.reduce((sum, plan) => {
    const current = currentScenario(plan);
    if (current?.profitPerUnit === null || current?.profitPerUnit === undefined || plan.unitsSold === null) return sum;
    return sum + current.profitPerUnit * plan.unitsSold;
  }, 0)
);

watch(() => props.date, async (date) => {
  await store.fetchPlans(date);
});

onMounted(async () => {
  await store.fetchPlans(props.date);
});

function selectPlan(plan: ProductProfitPlan): void {
  store.selectProduct(plan.productId);
}

function openSettingDialog(plan?: ProductProfitPlan | null): void {
  const target = plan ?? selectedPlan.value;
  if (!target) return;
  settingForm.productId = target.productId;
  settingForm.purchaseCost = target.setting?.purchaseCost ?? null;
  settingForm.inboundFreight = target.setting?.inboundFreight ?? null;
  settingForm.fbaFee = target.setting?.fbaFee ?? null;
  settingForm.referralFeeRate = target.setting?.referralFeeRate ?? 0.15;
  settingForm.storageFee = target.setting?.storageFee ?? null;
  settingForm.returnLossRate = target.setting?.returnLossRate ?? 0.03;
  settingForm.targetMarginRate = target.setting?.targetMarginRate ?? target.targetMarginRate;
  settingForm.minimumMarginRate = target.setting?.minimumMarginRate ?? target.minimumMarginRate;
  settingForm.dealFee = target.setting?.dealFee ?? null;
  settingDialogOpen.value = true;
}

async function submitSetting(): Promise<void> {
  if (settingForm.productId <= 0) {
    ElMessage.warning("Select a SKU before saving profit settings.");
    return;
  }
  try {
    await store.saveSetting(settingForm.productId, {
      purchaseCost: cleanNumber(settingForm.purchaseCost),
      inboundFreight: cleanNumber(settingForm.inboundFreight),
      fbaFee: cleanNumber(settingForm.fbaFee),
      referralFeeRate: cleanNumber(settingForm.referralFeeRate),
      storageFee: cleanNumber(settingForm.storageFee),
      returnLossRate: cleanNumber(settingForm.returnLossRate),
      targetMarginRate: cleanNumber(settingForm.targetMarginRate),
      minimumMarginRate: cleanNumber(settingForm.minimumMarginRate),
      dealFee: cleanNumber(settingForm.dealFee),
      dataSource: "manual",
      syncStatus: "manual"
    }, props.date);
    settingDialogOpen.value = false;
    ElMessage.success("Profit settings saved.");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function currentScenario(plan: ProductProfitPlan): ProductProfitScenario | null {
  return plan.scenarios.find((scenario) => scenario.kind === "current") ?? null;
}

function levelType(value: ProfitPlanLevel): "success" | "warning" | "danger" | "info" {
  if (value === "healthy") return "success";
  if (value === "risk") return "danger";
  if (value === "data_gap") return "info";
  return "warning";
}

function levelLabel(value: ProfitPlanLevel): string {
  if (value === "risk") return "Risk";
  if (value === "watch") return "Watch";
  if (value === "data_gap") return "Data gap";
  return "Healthy";
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return "-";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${Math.round(value * 1000) / 10}%`;
}

function cleanNumber(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
</script>

<template>
  <section class="view profit-view">
    <header class="profit-toolbar panel">
      <div>
        <p class="eyebrow">Profit Safety Line</p>
        <h2>Profit planning</h2>
      </div>
      <div class="profit-toolbar__actions">
        <ElInput v-model="query" clearable placeholder="Search SKU / ASIN / title" style="width: 260px" @keyup.enter="store.fetchPlans(props.date)" />
        <ElSelect v-model="level" clearable placeholder="Level" style="width: 150px" @change="store.fetchPlans(props.date)">
          <ElOption label="Risk" value="risk" />
          <ElOption label="Watch" value="watch" />
          <ElOption label="Data gap" value="data_gap" />
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

    <div class="metrics profit-metrics">
      <article class="metric">
        <span>Planned SKUs</span>
        <strong>{{ plans.length }}</strong>
      </article>
      <article class="metric hot">
        <span>Margin risk</span>
        <strong>{{ riskCount }}</strong>
      </article>
      <article class="metric">
        <span>Watch / data gaps</span>
        <strong>{{ watchCount }} / {{ dataGapCount }}</strong>
      </article>
      <article class="metric review-metric">
        <span>Current profit</span>
        <strong>{{ formatMoney(projectedProfit) }}</strong>
      </article>
    </div>

    <p v-if="error" class="profit-error">{{ error }}</p>

    <div class="profit-layout">
      <section class="panel profit-list-panel">
        <div class="panel-head">
          <div>
            <h2>Price guardrails</h2>
            <span>Evidence date {{ props.date }}</span>
          </div>
        </div>

        <div v-if="loading && plans.length === 0" class="empty-state compact-empty">
          <RefreshCw :size="22" class="spinning" />
          <p>Loading profit plans</p>
        </div>

        <div v-else-if="plans.length === 0" class="empty-state">
          <BadgeDollarSign :size="28" />
          <p>No profit plans match the current filters.</p>
        </div>

        <div v-else class="table-wrap compact-scroll profit-table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Price</th>
                <th>Current margin</th>
                <th>Minimum safe</th>
                <th>Target line</th>
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
                <td class="profit-product-cell">
                  <strong>{{ plan.sku }}</strong>
                  <span>{{ plan.asin }} · {{ plan.marketplace }} · {{ plan.brand || "Unknown brand" }}</span>
                  <small>{{ plan.productTitle }}</small>
                </td>
                <td>
                  <strong>{{ formatMoney(plan.averageSellingPrice) }}</strong>
                  <small>{{ plan.unitsSold ?? "-" }} units</small>
                </td>
                <td>
                  <strong>{{ formatPercent(currentScenario(plan)?.marginRate) }}</strong>
                  <small>{{ formatMoney(currentScenario(plan)?.profitPerUnit) }} / unit</small>
                </td>
                <td><strong>{{ formatMoney(plan.minimumSafePrice) }}</strong></td>
                <td><strong>{{ formatMoney(plan.targetMarginPrice) }}</strong></td>
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

      <aside class="panel profit-detail-panel">
        <div v-if="!selectedPlan" class="empty-state">
          <ShieldCheck :size="28" />
          <p>Select a SKU to review price safety lines.</p>
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

          <section class="profit-detail-grid">
            <div><span>Average price</span><strong>{{ formatMoney(selectedPlan.averageSellingPrice) }}</strong></div>
            <div><span>Ad cost / unit</span><strong>{{ formatMoney(selectedPlan.adCostPerUnit) }}</strong></div>
            <div><span>Minimum safe</span><strong>{{ formatMoney(selectedPlan.minimumSafePrice) }}</strong></div>
            <div><span>Target margin line</span><strong>{{ formatMoney(selectedPlan.targetMarginPrice) }}</strong></div>
          </section>

          <section class="profit-section">
            <h3>Scenarios</h3>
            <div class="profit-scenario-grid">
              <article v-for="scenario in selectedPlan.scenarios" :key="scenario.kind">
                <span>{{ scenario.label }}</span>
                <strong>{{ formatMoney(scenario.price) }}</strong>
                <small>{{ formatPercent(scenario.marginRate) }} · {{ formatMoney(scenario.profitPerUnit) }}/unit</small>
              </article>
            </div>
          </section>

          <section class="profit-section">
            <h3>Cost assumptions</h3>
            <div class="profit-costs">
              <span>Purchase cost</span><strong>{{ formatMoney(selectedPlan.setting?.purchaseCost) }}</strong>
              <span>Inbound freight</span><strong>{{ formatMoney(selectedPlan.setting?.inboundFreight) }}</strong>
              <span>FBA fee</span><strong>{{ formatMoney(selectedPlan.setting?.fbaFee) }}</strong>
              <span>Referral fee</span><strong>{{ formatPercent(selectedPlan.setting?.referralFeeRate) }}</strong>
              <span>Return loss</span><strong>{{ formatPercent(selectedPlan.setting?.returnLossRate) }}</strong>
              <span>Minimum margin</span><strong>{{ formatPercent(selectedPlan.minimumMarginRate) }}</strong>
            </div>
          </section>

          <section class="profit-section">
            <h3>Signals</h3>
            <div v-if="selectedPlan.issues.length === 0" class="profit-ok">Current price and standard promotion scenarios stay inside configured guardrails.</div>
            <article v-for="issue in selectedPlan.issues" :key="issue.type" class="profit-issue">
              <ElTag :type="issue.priority === 'P0' ? 'danger' : 'warning'" size="small">{{ issue.priority }}</ElTag>
              <div>
                <strong>{{ issue.label }}</strong>
                <p>{{ issue.message }}</p>
                <small>{{ issue.suggestion }}</small>
              </div>
            </article>
          </section>
        </template>
      </aside>
    </div>

    <ElDialog v-model="settingDialogOpen" title="Profit settings" width="680px">
      <div class="profit-setting-form">
        <ElInput v-model.number="settingForm.purchaseCost" placeholder="Purchase cost" />
        <ElInput v-model.number="settingForm.inboundFreight" placeholder="Inbound freight" />
        <ElInput v-model.number="settingForm.fbaFee" placeholder="FBA fee" />
        <ElInput v-model.number="settingForm.storageFee" placeholder="Storage fee" />
        <ElInput v-model.number="settingForm.referralFeeRate" placeholder="Referral fee rate, e.g. 0.15" />
        <ElInput v-model.number="settingForm.returnLossRate" placeholder="Return loss rate, e.g. 0.03" />
        <ElInput v-model.number="settingForm.targetMarginRate" placeholder="Target margin rate, e.g. 0.30" />
        <ElInput v-model.number="settingForm.minimumMarginRate" placeholder="Minimum margin rate, e.g. 0.20" />
        <ElInput v-model.number="settingForm.dealFee" class="wide" placeholder="Deal fee" />
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

<style scoped src="../styles/profit.css"></style>
