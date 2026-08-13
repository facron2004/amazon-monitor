<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { RefreshCw } from "@lucide/vue";
import { ElButton, ElTag } from "element-plus";
import type { DataSourceOverrideField } from "@amazon-monitor/shared";
import { useDataSourcesStore } from "../../stores/dataSources";
import { dataSourceTimeText } from "./data-source-display";

const props = defineProps<{ sourceId: number }>();
const store = useDataSourcesStore();
const { overrideAudits, overrideAuditsSourceId } = storeToRefs(store);
const audits = computed(() => overrideAuditsSourceId.value === props.sourceId ? overrideAudits.value : []);

const fieldLabels: Record<DataSourceOverrideField, string> = {
  sessions: "Sessions",
  pageViews: "Page views",
  orders: "Orders",
  unitsSold: "Units sold",
  salesAmount: "Sales amount",
  buyBoxPercentage: "Buy box %",
  conversionRate: "Conversion rate"
};

watch(() => props.sourceId, (id) => void store.fetchOverrideAudits(id), { immediate: true });
</script>

<template>
  <section class="data-source-section data-source-overrides">
    <div class="data-source-runs__head">
      <div>
        <h3>Source override audit</h3>
        <p>Field-level replacements of fresh SP-API sales facts.</p>
      </div>
      <ElButton circle text title="Refresh override audit" @click="store.fetchOverrideAudits(sourceId)">
        <RefreshCw :size="14" />
      </ElButton>
    </div>
    <p v-if="!audits.length" class="data-source-runs__empty">No explicit SP-API overrides recorded.</p>
    <div v-else class="data-source-runs__list">
      <article v-for="audit in audits" :key="audit.id" class="data-source-run">
        <div class="data-source-run__top">
          <div>
            <strong>{{ fieldLabels[audit.fieldName] }} · {{ audit.effectiveDate }}</strong>
            <span>{{ dataSourceTimeText(audit.createdAt) }} · {{ audit.overriddenByName }}</span>
          </div>
          <ElTag size="small" type="warning">Override</ElTag>
        </div>
        <div class="data-source-run__metrics">
          <span>{{ audit.previousDataSourceName }}: {{ audit.previousValue ?? "—" }}</span>
          <span>→ {{ audit.dataSourceName }}: {{ audit.newValue ?? "—" }}</span>
          <span>Automatic SP-API restore: {{ audit.restoreOnSpApiSuccess ? "Enabled" : "Not enabled" }}</span>
        </div>
        <p class="data-source-run__error">{{ audit.reason }}</p>
      </article>
    </div>
  </section>
</template>
