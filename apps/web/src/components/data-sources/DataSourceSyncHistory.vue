<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { RefreshCw } from "@lucide/vue";
import { ElButton, ElTag } from "element-plus";
import type { DataSourceSyncOperation, DataSourceSyncRunStatus } from "@amazon-monitor/shared";
import { useDataSourcesStore } from "../../stores/dataSources";
import { dataSourceSyncType, dataSourceTimeText } from "./data-source-display";

const props = defineProps<{ sourceId: number }>();
const store = useDataSourcesStore();
const { syncRuns, syncRunsSourceId, runsLoading, runsError } = storeToRefs(store);

const runs = computed(() => syncRunsSourceId.value === props.sourceId ? syncRuns.value : []);

const operationLabels: Record<DataSourceSyncOperation, string> = {
  product_csv_import: "Product CSV",
  product_excel_import: "Product Excel",
  ads_csv_import: "Ads CSV",
  ads_excel_import: "Ads Excel",
  cost_csv_import: "Cost CSV",
  cost_excel_import: "Cost Excel",
  inventory_csv_import: "Inventory CSV",
  inventory_excel_import: "Inventory Excel"
};

const statusLabels: Record<DataSourceSyncRunStatus, string> = {
  pending: "Running",
  success: "Success",
  partial: "Partial",
  failed: "Failed"
};

watch(() => props.sourceId, (id) => void store.fetchSyncRuns(id), { immediate: true });
</script>

<template>
  <section class="data-source-section data-source-runs">
    <div class="data-source-runs__head">
      <div>
        <h3>Sync history</h3>
        <p>Recent ingestion outcomes and row-level impact.</p>
      </div>
      <ElButton circle text title="Refresh sync history" :loading="runsLoading" @click="store.fetchSyncRuns(sourceId)">
        <RefreshCw :size="14" />
      </ElButton>
    </div>

    <p v-if="runsError" class="data-source-runs__error">{{ runsError }}</p>
    <p v-else-if="!runsLoading && !runs.length" class="data-source-runs__empty">
      No sync runs yet. Use an import action above to create the first record.
    </p>
    <div v-else class="data-source-runs__list">
      <article v-for="run in runs" :key="run.id" class="data-source-run">
        <div class="data-source-run__top">
          <div>
            <strong>{{ operationLabels[run.operation] }}</strong>
            <span>{{ dataSourceTimeText(run.finishedAt || run.startedAt) }} · {{ run.initiatedByName || "System" }}</span>
          </div>
          <ElTag size="small" :type="dataSourceSyncType(run.status)">{{ statusLabels[run.status] }}</ElTag>
        </div>
        <div class="data-source-run__metrics">
          <span>{{ run.importedRows }}/{{ run.totalRows }} imported</span>
          <span>{{ run.createdRecords }} created</span>
          <span>{{ run.updatedRecords }} updated</span>
          <span v-if="run.failedRows">{{ run.failedRows }} failed</span>
        </div>
        <p v-if="run.errorSummary" class="data-source-run__error">{{ run.errorSummary }}</p>
        <p v-if="run.status === 'failed' || run.status === 'partial'" class="data-source-run__retry">
          Use the matching import action above to retry.
        </p>
      </article>
    </div>
  </section>
</template>
