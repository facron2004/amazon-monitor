import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  DataSourceAdsImportResult,
  DataSourceConfig,
  DataSourceCostImportResult,
  DataSourceImportPayload,
  DataSourceInventoryImportResult,
  DataSourceProductImportResult,
  DataSourceStatus,
  DataSourceSyncRun,
  DataSourceType
} from "@amazon-monitor/shared";
import { dataSourceApi, type CreateDataSourcePayload, type UpdateDataSourcePayload } from "../api-data-sources";
import { clearRequestCache } from "../api-base";

export const useDataSourcesStore = defineStore("dataSources", () => {
  const sources = ref<DataSourceConfig[]>([]);
  const selectedId = ref<number | null>(null);
  const sourceType = ref<DataSourceType | "all">("all");
  const status = ref<DataSourceStatus | "all">("all");
  const query = ref("");
  const loading = ref(false);
  const saving = ref(false);
  const importing = ref(false);
  const importingKind = ref<"products" | "ads" | "costs" | "inventory" | null>(null);
  const lastImportKind = ref<"products" | "ads" | "costs" | "inventory" | null>(null);
  const importResult = ref<DataSourceProductImportResult | null>(null);
  const adsImportResult = ref<DataSourceAdsImportResult | null>(null);
  const costImportResult = ref<DataSourceCostImportResult | null>(null);
  const inventoryImportResult = ref<DataSourceInventoryImportResult | null>(null);
  const syncRuns = ref<DataSourceSyncRun[]>([]);
  const syncRunsSourceId = ref<number | null>(null);
  const runsLoading = ref(false);
  const runsError = ref<string | null>(null);
  const error = ref<string | null>(null);

  const selectedSource = computed(() => sources.value.find((item) => item.id === selectedId.value) ?? sources.value[0] ?? null);

  async function fetchSources(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const cacheKey = `GET /api/data-sources?`;
      clearRequestCache(cacheKey);
      sources.value = await dataSourceApi.listDataSources({
        sourceType: sourceType.value === "all" ? undefined : sourceType.value,
        status: status.value === "all" ? undefined : status.value,
        q: query.value || undefined,
        limit: 200
      });
      if (!selectedSource.value && sources.value[0]) {
        selectedId.value = sources.value[0].id;
      }
      if (selectedId.value && !sources.value.some((item) => item.id === selectedId.value)) {
        selectedId.value = sources.value[0]?.id ?? null;
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function selectSource(id: number): void {
    selectedId.value = id;
  }

  async function createSource(payload: CreateDataSourcePayload): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      const created = await dataSourceApi.createDataSource(payload);
      selectedId.value = created.id;
      await fetchSources();
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function updateSource(id: number, payload: UpdateDataSourcePayload): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await dataSourceApi.updateDataSource(id, payload);
      await fetchSources();
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function fetchSyncRuns(id: number): Promise<void> {
    runsLoading.value = true;
    runsError.value = null;
    try {
      syncRuns.value = await dataSourceApi.listSyncRuns(id, { limit: 20 });
      syncRunsSourceId.value = id;
    } catch (err) {
      syncRuns.value = [];
      syncRunsSourceId.value = id;
      runsError.value = (err as Error).message;
    } finally {
      runsLoading.value = false;
    }
  }

  async function importProductsFile(id: number, payload: DataSourceImportPayload): Promise<DataSourceProductImportResult> {
    importing.value = true;
    importingKind.value = "products";
    lastImportKind.value = "products";
    importResult.value = null;
    adsImportResult.value = null;
    costImportResult.value = null;
    inventoryImportResult.value = null;
    error.value = null;
    try {
      const result = await dataSourceApi.importProductsFile(id, payload);
      importResult.value = result;
      await Promise.all([fetchSources(), fetchSyncRuns(id)]);
      return result;
    } catch (err) {
      await Promise.all([fetchSources(), fetchSyncRuns(id)]);
      error.value = (err as Error).message;
      throw err;
    } finally {
      importing.value = false;
      importingKind.value = null;
    }
  }

  async function importAdsFile(id: number, payload: DataSourceImportPayload): Promise<DataSourceAdsImportResult> {
    importing.value = true;
    importingKind.value = "ads";
    lastImportKind.value = "ads";
    importResult.value = null;
    adsImportResult.value = null;
    costImportResult.value = null;
    inventoryImportResult.value = null;
    error.value = null;
    try {
      const result = await dataSourceApi.importAdsFile(id, payload);
      adsImportResult.value = result;
      await Promise.all([fetchSources(), fetchSyncRuns(id)]);
      return result;
    } catch (err) {
      await Promise.all([fetchSources(), fetchSyncRuns(id)]);
      error.value = (err as Error).message;
      throw err;
    } finally {
      importing.value = false;
      importingKind.value = null;
    }
  }

  async function importCostsFile(id: number, payload: DataSourceImportPayload): Promise<DataSourceCostImportResult> {
    importing.value = true;
    importingKind.value = "costs";
    lastImportKind.value = "costs";
    importResult.value = null;
    adsImportResult.value = null;
    costImportResult.value = null;
    inventoryImportResult.value = null;
    error.value = null;
    try {
      const result = await dataSourceApi.importCostsFile(id, payload);
      costImportResult.value = result;
      await Promise.all([fetchSources(), fetchSyncRuns(id)]);
      return result;
    } catch (err) {
      await Promise.all([fetchSources(), fetchSyncRuns(id)]);
      error.value = (err as Error).message;
      throw err;
    } finally {
      importing.value = false;
      importingKind.value = null;
    }
  }

  async function importInventoryFile(id: number, payload: DataSourceImportPayload): Promise<DataSourceInventoryImportResult> {
    importing.value = true;
    importingKind.value = "inventory";
    lastImportKind.value = "inventory";
    importResult.value = null;
    adsImportResult.value = null;
    costImportResult.value = null;
    inventoryImportResult.value = null;
    error.value = null;
    try {
      const result = await dataSourceApi.importInventoryFile(id, payload);
      inventoryImportResult.value = result;
      await Promise.all([fetchSources(), fetchSyncRuns(id)]);
      return result;
    } catch (err) {
      await Promise.all([fetchSources(), fetchSyncRuns(id)]);
      error.value = (err as Error).message;
      throw err;
    } finally {
      importing.value = false;
      importingKind.value = null;
    }
  }

  return {
    sources,
    selectedId,
    selectedSource,
    sourceType,
    status,
    query,
    loading,
    saving,
    importing,
    importingKind,
    lastImportKind,
    importResult,
    adsImportResult,
    costImportResult,
    inventoryImportResult,
    syncRuns,
    syncRunsSourceId,
    runsLoading,
    runsError,
    error,
    fetchSources,
    selectSource,
    createSource,
    updateSource,
    fetchSyncRuns,
    importProductsFile,
    importAdsFile,
    importCostsFile,
    importInventoryFile
  };
});
