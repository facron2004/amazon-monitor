<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { CircleDollarSign, FileSpreadsheet, Upload, Warehouse } from "@lucide/vue";
import { ElButton } from "element-plus";
import type { DataSourceConfig, DataSourceImportPayload } from "@amazon-monitor/shared";
import { useDataSourcesStore } from "../../stores/dataSources";

const props = defineProps<{
  source: DataSourceConfig;
  canRun?: boolean;
}>();

const store = useDataSourcesStore();
const { importingKind, lastImportKind, importResult, adsImportResult, costImportResult, inventoryImportResult, error } = storeToRefs(store);
const productInput = ref<HTMLInputElement | null>(null);
const adsInput = ref<HTMLInputElement | null>(null);
const costInput = ref<HTMLInputElement | null>(null);
const inventoryInput = ref<HTMLInputElement | null>(null);
const fileError = ref<string | null>(null);

type ImportKind = "products" | "ads" | "costs" | "inventory";

const result = computed(() => {
  if (lastImportKind.value === "products" && importResult.value?.source.id === props.source.id) {
    return {
      totalRows: importResult.value.totalRows,
      importedRows: importResult.value.importedRows,
      failedRows: importResult.value.failedRows,
      createdRows: importResult.value.createdProducts,
      updatedRows: importResult.value.updatedProducts,
      errors: importResult.value.errors
    };
  }
  if (lastImportKind.value === "ads" && adsImportResult.value?.source.id === props.source.id) {
    return {
      totalRows: adsImportResult.value.totalRows,
      importedRows: adsImportResult.value.importedRows,
      failedRows: adsImportResult.value.failedRows,
      createdRows: adsImportResult.value.createdMetrics,
      updatedRows: adsImportResult.value.updatedMetrics,
      errors: adsImportResult.value.errors
    };
  }
  if (lastImportKind.value === "costs" && costImportResult.value?.source.id === props.source.id) {
    return {
      totalRows: costImportResult.value.totalRows,
      importedRows: costImportResult.value.importedRows,
      failedRows: costImportResult.value.failedRows,
      createdRows: costImportResult.value.createdSettings,
      updatedRows: costImportResult.value.updatedSettings,
      errors: costImportResult.value.errors
    };
  }
  if (lastImportKind.value === "inventory" && inventoryImportResult.value?.source.id === props.source.id) {
    return {
      totalRows: inventoryImportResult.value.totalRows,
      importedRows: inventoryImportResult.value.importedRows,
      failedRows: inventoryImportResult.value.failedRows,
      createdRows: inventoryImportResult.value.createdSettings,
      updatedRows: inventoryImportResult.value.updatedSettings,
      errors: inventoryImportResult.value.errors
    };
  }
  return null;
});

function chooseFile(kind: ImportKind): void {
  const inputs = { products: productInput, ads: adsInput, costs: costInput, inventory: inventoryInput };
  inputs[kind].value?.click();
}

async function handleFile(event: Event, kind: ImportKind): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) return;
  fileError.value = null;
  let payload: DataSourceImportPayload;
  try {
    payload = await filePayload(file);
  } catch (err) {
    fileError.value = (err as Error).message;
    return;
  }
  const operations = {
    products: () => store.importProductsFile(props.source.id, payload),
    ads: () => store.importAdsFile(props.source.id, payload),
    costs: () => store.importCostsFile(props.source.id, payload),
    inventory: () => store.importInventoryFile(props.source.id, payload)
  };
  const operation = operations[kind]();
  await operation.catch(() => undefined);
}

async function filePayload(file: File): Promise<DataSourceImportPayload> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Import files must not exceed 5 MB");
  if (file.name.toLowerCase().endsWith(".csv")) {
    return { format: "csv", content: await file.text() };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return { format: "xlsx", contentBase64: btoa(binary), fileName: file.name };
}
</script>

<template>
  <section class="data-source-section data-source-import">
    <div class="data-source-import-title">
      <h3>File imports</h3>
      <p>Route source reports into the matching operations workflow.</p>
    </div>

    <article class="data-source-import-option">
      <div>
        <strong>Product operations</strong>
        <p>Owned SKU identity, sales, traffic, inventory, and daily health metrics.</p>
        <span>CSV/XLSX required: sku, asin, title, date<span v-if="!source.marketplace">, marketplace</span></span>
      </div>
      <ElButton
        type="primary"
        :loading="importingKind === 'products'"
        :disabled="!canRun || importingKind !== null"
        @click="chooseFile('products')"
      >
        <template #icon><Upload :size="14" /></template>
        Import products
      </ElButton>
      <input
        ref="productInput"
        class="data-source-file-input"
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="handleFile($event, 'products')"
      />
    </article>

    <article class="data-source-import-option">
      <div>
        <strong>Inventory & purchasing</strong>
        <p>Production and inbound lead times, in-transit stock, local stock, MOQ, and expected arrival.</p>
        <span>CSV/XLSX required: sku<span v-if="!source.marketplace">, marketplace</span>, plus at least one planning field.</span>
      </div>
      <ElButton
        :loading="importingKind === 'inventory'"
        :disabled="!canRun || importingKind !== null"
        @click="chooseFile('inventory')"
      >
        <template #icon><Warehouse :size="14" /></template>
        Import inventory
      </ElButton>
      <input
        ref="inventoryInput"
        class="data-source-file-input"
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="handleFile($event, 'inventory')"
      />
    </article>

    <article class="data-source-import-option">
      <div>
        <strong>Cost assumptions</strong>
        <p>Purchase, inbound, FBA, storage, return-loss, Deal fee, and margin guardrails.</p>
        <span>CSV/XLSX required: sku<span v-if="!source.marketplace">, marketplace</span>, plus at least one cost field.</span>
      </div>
      <ElButton
        :loading="importingKind === 'costs'"
        :disabled="!canRun || importingKind !== null"
        @click="chooseFile('costs')"
      >
        <template #icon><CircleDollarSign :size="14" /></template>
        Import costs
      </ElButton>
      <input
        ref="costInput"
        class="data-source-file-input"
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="handleFile($event, 'costs')"
      />
    </article>

    <article class="data-source-import-option">
      <div>
        <strong>Ads performance</strong>
        <p>Campaign, targeting, traffic, spend, sales, conversion, and efficiency metrics.</p>
        <span>CSV/XLSX required: date, campaignId, campaignName. Optional: sku, marketplace.</span>
      </div>
      <ElButton
        :loading="importingKind === 'ads'"
        :disabled="!canRun || importingKind !== null"
        @click="chooseFile('ads')"
      >
        <template #icon><FileSpreadsheet :size="14" /></template>
        Import Ads
      </ElButton>
      <input
        ref="adsInput"
        class="data-source-file-input"
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="handleFile($event, 'ads')"
      />
    </article>

    <div v-if="result" class="data-source-import-result">
      <div><span>Rows</span><strong>{{ result.totalRows }}</strong></div>
      <div><span>Imported</span><strong>{{ result.importedRows }}</strong></div>
      <div><span>Created</span><strong>{{ result.createdRows }}</strong></div>
      <div><span>Updated</span><strong>{{ result.updatedRows }}</strong></div>
      <div><span>Failed</span><strong>{{ result.failedRows }}</strong></div>
    </div>
    <ul v-if="result?.errors.length" class="data-source-import-errors">
      <li v-for="item in result.errors" :key="`${item.row}-${item.message}`">
        Row {{ item.row }}: {{ item.message }}
      </li>
    </ul>
    <p v-else-if="fileError || error" class="data-source-import-error">{{ fileError || error }}</p>
  </section>
</template>
