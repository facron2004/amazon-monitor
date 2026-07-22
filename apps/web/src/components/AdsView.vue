<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { BarChart3, Megaphone, Plus, RefreshCw, Sparkles } from "@lucide/vue";
import type { AdsWorkflowItem, AdsWorkflowLevel } from "@amazon-monitor/shared";
import { useAdsStore } from "../stores/ads";
import { useWriteAccess } from "../composables/useWriteAccess";
import AgentActionTaskButton from "./AgentActionTaskButton.vue";
import AdsOptimizationArtifactPanel from "./ads/AdsOptimizationArtifactPanel.vue";

const props = defineProps<{ date: string }>();

const store = useAdsStore();
const { canWrite: canViewDetails } = useWriteAccess("view_ads_details");
const { canWrite: canManageAds } = useWriteAccess("manage_ads");
const { summary, items, selectedItem, selectedMetricId, aiAnalysis, loading, saving, analyzing, error, query, level } = storeToRefs(store);

const metricDialogOpen = ref(false);
const metricForm = reactive({
  date: props.date,
  productId: null as number | string | null,
  campaignId: "",
  campaignName: "",
  adGroupName: "",
  targetText: "",
  searchTerm: "",
  matchType: "",
  impressions: null as number | string | null,
  clicks: null as number | string | null,
  spend: null as number | string | null,
  sales: null as number | string | null,
  orders: null as number | string | null,
  unitsSold: null as number | string | null,
  acos: null as number | string | null,
  budget: null as number | string | null,
  budgetUsageRate: null as number | string | null
});

watch(() => props.date, async (date) => {
  metricForm.date = date;
  await store.fetchSummary(date);
});

onMounted(async () => {
  await store.fetchSummary(props.date);
});

function selectItem(item: AdsWorkflowItem): void {
  store.selectMetric(item.metric.id);
}

function openMetricDialog(item?: AdsWorkflowItem): void {
  metricForm.date = props.date;
  metricForm.productId = item?.metric.productId ?? null;
  metricForm.campaignId = item?.metric.campaignId ?? "";
  metricForm.campaignName = item?.metric.campaignName ?? "";
  metricForm.adGroupName = item?.metric.adGroupName ?? "";
  metricForm.targetText = item?.metric.targetText ?? "";
  metricForm.searchTerm = item?.metric.searchTerm ?? "";
  metricForm.matchType = item?.metric.matchType ?? "";
  metricForm.impressions = item?.metric.impressions ?? null;
  metricForm.clicks = item?.metric.clicks ?? null;
  metricForm.spend = item?.metric.spend ?? null;
  metricForm.sales = item?.metric.sales ?? null;
  metricForm.orders = item?.metric.orders ?? null;
  metricForm.unitsSold = item?.metric.unitsSold ?? null;
  metricForm.acos = percentFromRatio(item?.metric.acos);
  metricForm.budget = item?.metric.budget ?? null;
  metricForm.budgetUsageRate = percentFromRatio(item?.metric.budgetUsageRate);
  metricDialogOpen.value = true;
}

async function submitMetric(): Promise<void> {
  if (!metricForm.campaignId.trim() || !metricForm.campaignName.trim()) {
    ElMessage.warning("Campaign ID and name are required.");
    return;
  }
  try {
    await store.saveMetric({
      productId: cleanNumber(metricForm.productId),
      date: metricForm.date,
      campaignId: metricForm.campaignId.trim(),
      campaignName: metricForm.campaignName.trim(),
      adGroupName: emptyToNull(metricForm.adGroupName),
      targetText: emptyToNull(metricForm.targetText),
      searchTerm: emptyToNull(metricForm.searchTerm),
      matchType: emptyToNull(metricForm.matchType),
      impressions: cleanNumber(metricForm.impressions),
      clicks: cleanNumber(metricForm.clicks),
      spend: cleanNumber(metricForm.spend),
      sales: cleanNumber(metricForm.sales),
      orders: cleanNumber(metricForm.orders),
      unitsSold: cleanNumber(metricForm.unitsSold),
      acos: ratioFromPercent(metricForm.acos),
      budget: cleanNumber(metricForm.budget),
      budgetUsageRate: ratioFromPercent(metricForm.budgetUsageRate),
      syncStatus: "manual",
      dataSource: "manual"
    }, props.date);
    metricDialogOpen.value = false;
    ElMessage.success("Ads metric saved.");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function analyzeAds(): Promise<void> {
  try {
    await store.analyze(props.date);
    ElMessage.success("Ads analysis generated.");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function levelType(value: AdsWorkflowLevel): "success" | "warning" | "danger" | "info" {
  if (value === "healthy") return "success";
  if (value === "risk") return "danger";
  if (value === "scale") return "info";
  return "warning";
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return "-";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

function cleanNumber(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function ratioFromPercent(value: number | string | null): number | null {
  const numberValue = cleanNumber(value);
  return numberValue === null ? null : numberValue / 100;
}

function percentFromRatio(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value * 1000) / 10;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
</script>

<template>
  <section class="view ads-view">
    <header class="ads-toolbar panel">
      <div>
        <p class="eyebrow">Ads Workflow</p>
        <h2>Amazon Ads 诊断</h2>
      </div>
      <div class="ads-toolbar__actions">
        <ElInput v-model="query" clearable placeholder="Search campaign / SKU / target" style="width: 260px" @keyup.enter="store.fetchSummary(props.date)" />
        <ElSelect v-model="level" clearable placeholder="Level" style="width: 140px" @change="store.fetchSummary(props.date)">
          <ElOption label="Risk" value="risk" />
          <ElOption label="Scale" value="scale" />
          <ElOption label="Watch" value="watch" />
          <ElOption label="Healthy" value="healthy" />
        </ElSelect>
        <ElButton :loading="loading" @click="store.fetchSummary(props.date)">
          <template #icon><RefreshCw :size="14" /></template>
          Refresh
        </ElButton>
        <ElButton v-if="canManageAds" type="primary" @click="openMetricDialog()">
          <template #icon><Plus :size="14" /></template>
          Metric
        </ElButton>
      </div>
    </header>

    <p v-if="!canViewDetails" class="ads-access-note">
      当前角色可查看广告效率与风险信号；Campaign、关键词、花费、销售和转化明细已隐藏。
    </p>

    <div class="metrics ads-metrics">
      <article class="metric">
        <span>Spend</span>
        <strong>{{ formatMoney(summary?.totalSpend) }}</strong>
      </article>
      <article class="metric">
        <span>Sales</span>
        <strong>{{ formatMoney(summary?.totalSales) }}</strong>
      </article>
      <article class="metric hot">
        <span>Avg ACOS</span>
        <strong>{{ formatPercent(summary?.averageAcos) }}</strong>
      </article>
      <article class="metric review-metric">
        <span>Risk / Scale</span>
        <strong>{{ summary?.riskCount ?? 0 }} / {{ summary?.scaleCount ?? 0 }}</strong>
      </article>
    </div>

    <p v-if="error" class="ads-error">{{ error }}</p>

    <div class="ads-layout">
      <section class="panel ads-list-panel">
        <div class="panel-head">
          <div>
            <h2>Campaign targets</h2>
            <span>Evidence date {{ props.date }}</span>
          </div>
        </div>

        <div v-if="loading && items.length === 0" class="empty-state compact-empty">
          <RefreshCw :size="22" class="spinning" />
          <p>Loading Ads metrics</p>
        </div>

        <div v-else-if="items.length === 0" class="empty-state">
          <Megaphone :size="28" />
          <p>No Ads metrics for this date.</p>
        </div>

        <div v-else :class="['table-wrap', 'compact-scroll', 'ads-table-wrap', { 'ads-table-wrap--summary': !canViewDetails }]">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th v-if="canViewDetails">Spend</th>
                <th v-if="canViewDetails">Sales</th>
                <th>ACOS</th>
                <th>Level</th>
                <th>Top signal</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in items"
                :key="item.metric.id"
                :class="{ selected: selectedMetricId === item.metric.id }"
                @click="selectItem(item)"
              >
                <td class="ads-campaign-cell">
                  <strong>{{ canViewDetails ? item.metric.campaignName : `Campaign signal #${item.metric.id}` }}</strong>
                  <span>{{ item.metric.targetText || item.metric.searchTerm || item.metric.adGroupName || "Campaign total" }}</span>
                  <small>{{ item.productSku || item.productAsin || "Unlinked SKU" }}</small>
                </td>
                <td v-if="canViewDetails">{{ formatMoney(item.metric.spend) }}</td>
                <td v-if="canViewDetails">{{ formatMoney(item.metric.sales) }}</td>
                <td><strong>{{ formatPercent(item.metric.acos) }}</strong></td>
                <td><ElTag :type="levelType(item.level)" size="small">{{ item.level }}</ElTag></td>
                <td>
                  <strong>{{ item.insights[0]?.label ?? "Stable" }}</strong>
                  <small>{{ item.insights[0]?.priority ?? "P2" }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel ads-detail-panel">
        <div v-if="!selectedItem" class="empty-state">
          <BarChart3 :size="28" />
          <p>Select a campaign target.</p>
        </div>
        <template v-else>
          <div class="panel-head">
            <div>
              <h2>{{ canViewDetails ? selectedItem.metric.campaignName : `Campaign signal #${selectedItem.metric.id}` }}</h2>
              <span>{{ selectedItem.metric.targetText || selectedItem.metric.searchTerm || selectedItem.metric.campaignId }}</span>
            </div>
            <div v-if="canManageAds" class="ads-detail-actions">
              <ElButton size="small" @click="openMetricDialog(selectedItem)">
                <template #icon><Plus :size="12" /></template>
                Metric
              </ElButton>
              <ElButton size="small" type="primary" :loading="analyzing" @click="analyzeAds">
                <template #icon><Sparkles :size="12" /></template>
                Analyze
              </ElButton>
            </div>
          </div>

          <section v-if="canViewDetails" class="ads-detail-grid">
            <div><span>Spend</span><strong>{{ formatMoney(selectedItem.metric.spend) }}</strong></div>
            <div><span>Sales</span><strong>{{ formatMoney(selectedItem.metric.sales) }}</strong></div>
            <div><span>Orders</span><strong>{{ selectedItem.metric.orders ?? "-" }}</strong></div>
            <div><span>Budget use</span><strong>{{ formatPercent(selectedItem.metric.budgetUsageRate) }}</strong></div>
          </section>

          <section class="ads-section">
            <h3>Signals</h3>
            <div v-if="selectedItem.insights.length === 0" class="ads-ok">No blocking Ads signal from current evidence.</div>
            <article v-for="insight in selectedItem.insights" :key="insight.type" class="ads-insight">
              <ElTag :type="insight.priority === 'P0' ? 'danger' : 'warning'" size="small">{{ insight.priority }}</ElTag>
              <div>
                <strong>{{ insight.label }}</strong>
                <p>{{ insight.message }}</p>
                <small>{{ insight.suggestion }}</small>
              </div>
            </article>
          </section>

          <section v-if="aiAnalysis" class="ads-section agent-output">
            <h3>Ads Analyst Agent</h3>
            <strong>{{ aiAnalysis.output.summary }}</strong>
            <p>{{ aiAnalysis.output.impact }}</p>
            <AdsOptimizationArtifactPanel
              v-if="aiAnalysis.output.artifacts?.adsOptimization"
              :artifact="aiAnalysis.output.artifacts.adsOptimization"
            />
            <ol>
              <li v-for="action in aiAnalysis.output.recommended_actions" :key="action.action">
                <span>{{ action.priority }}</span>
                <div>
                  <strong>{{ action.action }}</strong>
                  <small>{{ action.reason }}</small>
                  <AgentActionTaskButton
                    :run-id="aiAnalysis.run.id"
                    agent-type="ads_analyst"
                    :output="aiAnalysis.output"
                    :action="action"
                    :related-asin="selectedItem?.productAsin"
                  />
                </div>
              </li>
            </ol>
          </section>
        </template>
      </aside>
    </div>

    <ElDialog v-if="canManageAds" v-model="metricDialogOpen" title="Ads metric" width="720px">
      <div class="ads-metric-form">
        <ElInput v-model="metricForm.date" placeholder="Date" />
        <ElInput v-model.number="metricForm.productId" placeholder="Product ID" />
        <ElInput v-model="metricForm.campaignId" placeholder="Campaign ID" />
        <ElInput v-model="metricForm.campaignName" placeholder="Campaign name" />
        <ElInput v-model="metricForm.adGroupName" placeholder="Ad group" />
        <ElInput v-model="metricForm.matchType" placeholder="Match type" />
        <ElInput v-model="metricForm.targetText" placeholder="Target / keyword" />
        <ElInput v-model="metricForm.searchTerm" placeholder="Search term" />
        <ElInput v-model.number="metricForm.impressions" placeholder="Impressions" />
        <ElInput v-model.number="metricForm.clicks" placeholder="Clicks" />
        <ElInput v-model.number="metricForm.spend" placeholder="Spend" />
        <ElInput v-model.number="metricForm.sales" placeholder="Sales" />
        <ElInput v-model.number="metricForm.orders" placeholder="Orders" />
        <ElInput v-model.number="metricForm.unitsSold" placeholder="Units sold" />
        <ElInput v-model.number="metricForm.acos" placeholder="ACOS %" />
        <ElInput v-model.number="metricForm.budgetUsageRate" placeholder="Budget use %" />
        <ElInput v-model.number="metricForm.budget" class="wide" placeholder="Daily budget" />
      </div>
      <template #footer>
        <ElButton @click="metricDialogOpen = false">Cancel</ElButton>
        <ElButton type="primary" :loading="saving" @click="submitMetric">Save metric</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped src="../styles/ads.css"></style>
