<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElInput, ElMessage, ElOption, ElSelect } from "element-plus";
import { Plus, RefreshCw } from "@lucide/vue";
import {
  dataSourceStatusLabels,
  dataSourceStatuses,
  dataSourceTypeLabels,
  dataSourceTypes,
  type DataSourceConfig
} from "@amazon-monitor/shared";
import DataSourceDetail from "./data-sources/DataSourceDetail.vue";
import DataSourceDialog, { type DataSourceDialogPayload } from "./data-sources/DataSourceDialog.vue";
import DataSourceList from "./data-sources/DataSourceList.vue";
import { useDataSourcesStore } from "../stores/dataSources";
import { useWriteAccess } from "../composables/useWriteAccess";
import ReadOnlyNotice from "./ReadOnlyNotice.vue";
import StoreAccountsPanel from "./data-sources/StoreAccountsPanel.vue";

const store = useDataSourcesStore();
const { canWrite } = useWriteAccess("manage_data_sources");
const { canWrite: canCollect } = useWriteAccess("manage_collection");
const { sources, selectedSource, selectedId, sourceType, status, query, loading, saving, error } = storeToRefs(store);

const dialogOpen = ref(false);
const editingSource = ref<DataSourceConfig | null>(null);

const connectedCount = computed(() => sources.value.filter((item) => item.status === "connected").length);
const attentionCount = computed(() => sources.value.filter((item) => item.status === "attention" || item.syncStatus === "failed").length);
const apiCount = computed(() => sources.value.filter((item) => item.sourceType === "amazon_sp_api" || item.sourceType === "amazon_ads_api").length);

onMounted(async () => {
  await store.fetchSources();
});

async function refresh(): Promise<void> {
  await store.fetchSources();
}

function openCreate(): void {
  if (!canWrite.value) return;
  editingSource.value = null;
  dialogOpen.value = true;
}

function openEdit(source: DataSourceConfig): void {
  if (!canWrite.value) return;
  editingSource.value = source;
  dialogOpen.value = true;
}

async function saveSource(payload: DataSourceDialogPayload): Promise<void> {
  if (!canWrite.value) return;
  try {
    if (editingSource.value) {
      await store.updateSource(editingSource.value.id, payload);
      ElMessage.success("Data source updated.");
    } else {
      await store.createSource(payload);
      ElMessage.success("Data source created.");
    }
    dialogOpen.value = false;
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}
</script>

<template>
  <section class="view data-sources-view">
    <header class="panel data-sources-toolbar">
      <div>
        <p class="eyebrow">Data Sources</p>
        <h2>数据源中心</h2>
        <span>集中管理 SP-API、Ads API、公开采集、CSV/XLSX 和 ERP/WMS 的连接与同步状态。</span>
      </div>
      <div class="data-sources-actions">
        <ElInput v-model="query" clearable placeholder="Search source" style="width: 220px" @keyup.enter="refresh" />
        <ElSelect v-model="sourceType" placeholder="Type" style="width: 170px" @change="refresh">
          <ElOption label="All types" value="all" />
          <ElOption v-for="type in dataSourceTypes" :key="type" :label="dataSourceTypeLabels[type]" :value="type" />
        </ElSelect>
        <ElSelect v-model="status" placeholder="Status" style="width: 150px" @change="refresh">
          <ElOption label="All status" value="all" />
          <ElOption v-for="item in dataSourceStatuses" :key="item" :label="dataSourceStatusLabels[item]" :value="item" />
        </ElSelect>
        <ElButton :loading="loading" @click="refresh">
          <template #icon><RefreshCw :size="14" /></template>
          Refresh
        </ElButton>
        <ElButton type="primary" :disabled="!canWrite" @click="openCreate">
          <template #icon><Plus :size="14" /></template>
          Add
        </ElButton>
      </div>
    </header>

    <ReadOnlyNotice v-if="!canWrite" />

    <StoreAccountsPanel />

    <div class="metrics data-source-metrics">
      <article class="metric">
        <span>Sources</span>
        <strong>{{ sources.length }}</strong>
      </article>
      <article class="metric review-metric">
        <span>Connected</span>
        <strong>{{ connectedCount }}</strong>
      </article>
      <article class="metric hot">
        <span>Attention</span>
        <strong>{{ attentionCount }}</strong>
      </article>
      <article class="metric">
        <span>API connectors</span>
        <strong>{{ apiCount }}</strong>
      </article>
    </div>

    <p v-if="error" class="data-sources-error">{{ error }}</p>

    <div class="data-sources-layout">
      <DataSourceList
        :sources="sources"
        :selected-id="selectedId"
        :loading="loading"
        @select="store.selectSource($event.id)"
      />
      <DataSourceDetail :source="selectedSource" :can-edit="canWrite" :can-collect="canCollect" @edit="openEdit" />
    </div>

    <DataSourceDialog
      v-model:visible="dialogOpen"
      :source="editingSource"
      :saving="saving"
      @submit="saveSource"
    />
  </section>
</template>

<style src="../styles/data-sources.css"></style>
