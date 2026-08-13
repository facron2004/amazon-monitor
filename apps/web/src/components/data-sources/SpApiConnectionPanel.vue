<script setup lang="ts">
import { computed, onMounted, reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  ElButton,
  ElDatePicker,
  ElInput,
  ElOption,
  ElSelect,
  ElTag
} from "element-plus";
import { CheckCircle2, RefreshCw, Send, ShieldCheck, TriangleAlert } from "@lucide/vue";
import type { DataSourceConfig, SpApiConnectionHealthStatus, SpApiRegion } from "@amazon-monitor/shared";
import { useCommerceStoresStore } from "../../stores/commerceStores";
import { useDataSourcesStore } from "../../stores/dataSources";

const props = defineProps<{
  source: DataSourceConfig;
  canManageDataSources: boolean;
  canManageCollection: boolean;
}>();

const dataSources = useDataSourcesStore();
const commerceStores = useCommerceStoresStore();
const {
  mappingIssues,
  mappingIssuesSourceId,
  spApiError,
  spApiHealth,
  spApiHealthSourceId,
  spApiLoading,
  spApiSaving,
  spApiSyncing
} = storeToRefs(dataSources);
const { stores } = storeToRefs(commerceStores);
const form = reactive({
  region: "NA" as SpApiRegion,
  commerceStoreIds: [] as number[],
  lwaClientId: "",
  lwaClientSecret: "",
  lwaRefreshToken: "",
  backfillFromDate: "",
  backfillToDate: ""
});

const health = computed(() => spApiHealthSourceId.value === props.source.id ? spApiHealth.value : null);
const connectorEnabled = computed(() => health.value?.connectorEnabled ?? true);
const issues = computed(() => mappingIssuesSourceId.value === props.source.id ? mappingIssues.value : []);
const selectedStoreIds = computed(() => health.value?.linkedStoreIds.length ? health.value.linkedStoreIds : form.commerceStoreIds);
const marketplaces = computed(() => stores.value
  .filter((item) => selectedStoreIds.value.includes(item.id))
  .map((item) => marketplaceCode(item.marketplace))
  .filter((item): item is string => Boolean(item)));

onMounted(() => {
  if (!stores.value.length) void commerceStores.fetchStores();
});

watch(() => props.source.id, (id) => {
  form.lwaClientId = "";
  form.lwaClientSecret = "";
  form.lwaRefreshToken = "";
  void dataSources.fetchSpApiState(id);
}, { immediate: true });

watch(health, (value) => {
  if (!value) return;
  if (value.region) form.region = value.region;
  if (value.linkedStoreIds.length) form.commerceStoreIds = [...value.linkedStoreIds];
}, { immediate: true });

async function saveCredentials(): Promise<void> {
  if (!form.commerceStoreIds.length || !form.lwaClientId || !form.lwaClientSecret || !form.lwaRefreshToken) return;
  await dataSources.saveSpApiCredentials(props.source.id, {
    region: form.region,
    commerceStoreIds: form.commerceStoreIds,
    lwaClientId: form.lwaClientId.trim(),
    lwaClientSecret: form.lwaClientSecret,
    lwaRefreshToken: form.lwaRefreshToken
  });
  form.lwaClientId = "";
  form.lwaClientSecret = "";
  form.lwaRefreshToken = "";
}

async function testConnection(): Promise<void> {
  await dataSources.testSpApiConnection(props.source.id);
}

async function queueSync(domain: "sales_traffic" | "fba_inventory", mode: "incremental" | "full"): Promise<void> {
  await dataSources.syncSpApi(props.source.id, { domains: [domain], mode, marketplaces: marketplaces.value });
}

async function queueBackfill(): Promise<void> {
  if (!form.backfillFromDate || !form.backfillToDate) return;
  await dataSources.syncSpApi(props.source.id, {
    domains: ["sales_traffic"],
    mode: "backfill",
    marketplaces: marketplaces.value,
    fromDate: form.backfillFromDate,
    toDate: form.backfillToDate
  });
}

function healthType(status: SpApiConnectionHealthStatus | undefined): "success" | "warning" | "danger" | "info" {
  if (status === "healthy") return "success";
  if (status === "attention" || status === "revoked") return "danger";
  if (status === "degraded" || status === "disabled") return "warning";
  return "info";
}

function domainType(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "success") return "success";
  if (status === "partial" || status === "stale") return "warning";
  if (status === "failed") return "danger";
  return "info";
}

function marketplaceCode(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/^www\./, "");
  if (normalized === "us" || normalized === "amazon.com") return "US";
  if (normalized === "uk" || normalized === "gb" || normalized === "amazon.co.uk") return "UK";
  if (normalized === "de" || normalized === "amazon.de") return "DE";
  if (normalized === "jp" || normalized === "amazon.co.jp") return "JP";
  return null;
}
</script>

<template>
  <section class="data-source-section sp-api-panel">
    <header class="sp-api-panel__head">
      <div>
        <h3>SP-API 只读连接</h3>
        <p>凭据仅在服务端加密保存；浏览器不会回显 refresh token 或 client secret。</p>
      </div>
      <ElButton circle text title="刷新连接状态" :loading="spApiLoading" @click="dataSources.fetchSpApiState(source.id)">
        <RefreshCw :size="14" />
      </ElButton>
    </header>

    <p v-if="spApiError" class="sp-api-panel__error"><TriangleAlert :size="14" />{{ spApiError }}</p>

    <div class="sp-api-panel__health">
      <div>
        <span>连接状态</span>
        <ElTag size="small" :type="healthType(health?.status)">{{ health?.status ?? "not_configured" }}</ElTag>
      </div>
      <div><span>连接器开关</span><ElTag size="small" :type="connectorEnabled ? 'success' : 'warning'">{{ connectorEnabled ? "已启用" : "已关闭" }}</ElTag></div>
      <div><span>已绑定店铺</span><strong>{{ selectedStoreIds.length }}</strong></div>
      <div><span>待映射</span><strong>{{ health?.mappingIssueCount ?? 0 }}</strong></div>
      <div><span>最近验证</span><strong>{{ health?.lastTestedAt?.slice(0, 16).replace("T", " ") ?? "未验证" }}</strong></div>
    </div>

    <p v-if="health && !connectorEnabled" class="sp-api-panel__notice"><TriangleAlert :size="14" />SP-API 连接器当前已关闭；保存凭据、连接测试和同步操作都会被阻止。</p>

    <div class="sp-api-panel__steps">
      <div class="sp-api-panel__step">
        <span class="sp-api-panel__step-index">1</span>
        <div>
          <strong>保存或轮换凭据</strong>
          <p>连接一个同 Seller ID、同区域的 Amazon 店铺集合。</p>
        </div>
      </div>
      <div class="sp-api-panel__form">
        <label><span>Region</span><ElSelect v-model="form.region" :disabled="!canManageDataSources"><ElOption label="North America" value="NA" /><ElOption label="Europe" value="EU" /><ElOption label="Far East" value="FE" /></ElSelect></label>
        <label><span>Commerce stores</span><ElSelect v-model="form.commerceStoreIds" multiple collapse-tags :disabled="!canManageDataSources"><ElOption v-for="item in stores" :key="item.id" :label="`${item.name} · ${item.marketplace}`" :value="item.id" /></ElSelect></label>
        <label><span>LWA client ID</span><ElInput v-model="form.lwaClientId" autocomplete="off" :disabled="!canManageDataSources" /></label>
        <label><span>LWA client secret</span><ElInput v-model="form.lwaClientSecret" type="password" show-password autocomplete="new-password" :disabled="!canManageDataSources" /></label>
        <label class="sp-api-panel__wide"><span>LWA refresh token</span><ElInput v-model="form.lwaRefreshToken" type="password" show-password autocomplete="new-password" :disabled="!canManageDataSources" /></label>
      </div>
      <div class="sp-api-panel__actions">
        <ElButton type="primary" :disabled="!connectorEnabled || !canManageDataSources || !form.commerceStoreIds.length || !form.lwaClientId || !form.lwaClientSecret || !form.lwaRefreshToken" :loading="spApiSaving" @click="saveCredentials"><ShieldCheck :size="14" />保存凭据</ElButton>
        <ElButton :disabled="!connectorEnabled || !canManageDataSources || !health?.credentialsConfigured" :loading="spApiSaving" @click="testConnection"><CheckCircle2 :size="14" />测试连接</ElButton>
      </div>
    </div>

    <div class="sp-api-panel__steps">
      <div class="sp-api-panel__step">
        <span class="sp-api-panel__step-index">2</span>
        <div><strong>按数据域同步</strong><p>Sales D-1 和 FBA Inventory 的运行、健康与失败彼此独立。</p></div>
      </div>
      <div class="sp-api-panel__actions">
        <ElButton type="primary" plain :disabled="!connectorEnabled || !canManageCollection || !health?.credentialsConfigured || !marketplaces.length" :loading="spApiSyncing" @click="queueSync('sales_traffic', 'incremental')"><Send :size="14" />同步 Sales D-1</ElButton>
        <ElButton plain :disabled="!connectorEnabled || !canManageCollection || !health?.credentialsConfigured || !marketplaces.length" :loading="spApiSyncing" @click="queueSync('fba_inventory', 'incremental')">同步 FBA 增量</ElButton>
        <ElButton plain :disabled="!connectorEnabled || !canManageCollection || !health?.credentialsConfigured || !marketplaces.length" :loading="spApiSyncing" @click="queueSync('fba_inventory', 'full')">FBA 全量对账</ElButton>
      </div>
      <div class="sp-api-panel__backfill">
        <span>Sales 回补（最多 90 日）</span>
        <ElDatePicker v-model="form.backfillFromDate" type="date" value-format="YYYY-MM-DD" placeholder="开始日" :disabled="!canManageCollection" />
        <ElDatePicker v-model="form.backfillToDate" type="date" value-format="YYYY-MM-DD" placeholder="结束日" :disabled="!canManageCollection" />
        <ElButton :disabled="!connectorEnabled || !canManageCollection || !health?.credentialsConfigured || !marketplaces.length || !form.backfillFromDate || !form.backfillToDate" :loading="spApiSyncing" @click="queueBackfill">排队回补</ElButton>
      </div>
    </div>

    <div v-if="health?.domains.length" class="sp-api-panel__domains">
      <article v-for="domain in health.domains" :key="`${domain.commerceStoreId}-${domain.marketplace}-${domain.domain}`">
        <div><strong>{{ domain.marketplace }} · {{ domain.domain === 'sales_traffic' ? 'Sales & Traffic' : 'FBA Inventory' }}</strong><span>最近成功 {{ domain.lastSuccessAt?.slice(0, 16).replace('T', ' ') ?? '—' }}</span></div>
        <ElTag size="small" :type="domainType(domain.status)">{{ domain.status }}</ElTag>
        <p v-if="domain.errorMessage">{{ domain.errorMessage }}</p>
      </article>
    </div>

    <div v-if="issues.length" class="sp-api-panel__issues">
      <h4>商品映射问题（{{ issues.length }}）</h4>
      <article v-for="issue in issues" :key="issue.id">
        <strong>{{ issue.marketplace }} · {{ issue.domain }}</strong>
        <span>{{ issue.issueType }} · SKU {{ issue.sellerSku ?? '—' }} · ASIN {{ issue.sourceAsin ?? '—' }}</span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.sp-api-panel__head, .sp-api-panel__step, .sp-api-panel__actions, .sp-api-panel__backfill, .sp-api-panel__domains article, .sp-api-panel__issues article, .sp-api-panel__error { display: flex; align-items: center; }
.sp-api-panel__head { justify-content: space-between; gap: 12px; }
.sp-api-panel__head h3, .sp-api-panel__head p, .sp-api-panel__step p, .sp-api-panel__domains p, .sp-api-panel__issues h4 { margin: 0; }
.sp-api-panel__head p, .sp-api-panel__step p { color: var(--muted); font-size: 12px; margin-top: 4px; }
.sp-api-panel__health { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.sp-api-panel__health > div { border: 1px solid var(--border); border-radius: 6px; display: grid; gap: 5px; min-width: 0; padding: 9px; }
.sp-api-panel__health span, .sp-api-panel__health strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-api-panel__health span { color: var(--muted); font-size: 11px; }
.sp-api-panel__health strong { font-size: 12px; }
.sp-api-panel__steps { border-top: 1px solid var(--border); margin-top: 16px; padding-top: 14px; }
.sp-api-panel__step { align-items: flex-start; gap: 9px; }
.sp-api-panel__step-index { align-items: center; background: #eff8ff; border-radius: 50%; color: #175cd3; display: inline-flex; font-size: 12px; font-weight: 700; height: 20px; justify-content: center; width: 20px; }
.sp-api-panel__form { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; }
.sp-api-panel__form label { display: grid; gap: 5px; }
.sp-api-panel__form label > span, .sp-api-panel__backfill > span { color: var(--muted); font-size: 11px; font-weight: 600; }
.sp-api-panel__wide { grid-column: 1 / -1; }
.sp-api-panel__actions, .sp-api-panel__backfill { flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.sp-api-panel__domains, .sp-api-panel__issues { display: grid; gap: 7px; margin-top: 14px; }
.sp-api-panel__domains article, .sp-api-panel__issues article { border: 1px solid var(--border); border-radius: 6px; gap: 9px; justify-content: space-between; padding: 9px; }
.sp-api-panel__domains article > div { display: grid; gap: 3px; min-width: 0; }
.sp-api-panel__domains span, .sp-api-panel__issues span { color: var(--muted); font-size: 11px; }
.sp-api-panel__domains p { color: var(--el-color-danger); font-size: 11px; margin-left: auto; max-width: 45%; }
.sp-api-panel__issues article { align-items: flex-start; flex-direction: column; gap: 3px; }
.sp-api-panel__error, .sp-api-panel__notice { color: var(--el-color-danger); gap: 5px; margin: 10px 0 0; font-size: 12px; }
.sp-api-panel__notice { align-items: center; color: var(--el-color-warning); display: flex; }
@media (max-width: 680px) { .sp-api-panel__health, .sp-api-panel__form { grid-template-columns: 1fr; } .sp-api-panel__wide { grid-column: auto; } .sp-api-panel__backfill { align-items: stretch; flex-direction: column; } }
</style>
