<script setup lang="ts">
import { Database, RefreshCw } from "@lucide/vue";
import { ElTag } from "element-plus";
import {
  dataSourceStatusLabels,
  dataSourceTypeLabels,
  type DataSourceConfig
} from "@amazon-monitor/shared";
import { dataSourceStatusType, dataSourceTimeText } from "./data-source-display";

defineProps<{
  sources: DataSourceConfig[];
  selectedId: number | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  (event: "select", source: DataSourceConfig): void;
}>();
</script>

<template>
  <section class="panel data-sources-list">
    <div v-if="loading && sources.length === 0" class="empty-state compact-empty">
      <RefreshCw :size="22" class="spinning" />
      <p>Loading data sources</p>
    </div>
    <div v-else-if="sources.length === 0" class="empty-state">
      <Database :size="28" />
      <p>No data source configured yet. Add one to make freshness ownership explicit.</p>
    </div>
    <template v-else>
      <article
        v-for="source in sources"
        :key="source.id"
        :class="['data-source-row', { selected: selectedId === source.id }]"
        @click="emit('select', source)"
      >
        <div>
          <strong>{{ source.name }}</strong>
          <p>{{ dataSourceTypeLabels[source.sourceType] }} · {{ source.marketplace || "Global" }}</p>
        </div>
        <div class="data-source-row__meta">
          <ElTag size="small" :type="dataSourceStatusType(source.status)">{{ dataSourceStatusLabels[source.status] }}</ElTag>
          <span>{{ dataSourceTimeText(source.lastSyncedAt) }}</span>
        </div>
      </article>
    </template>
  </section>
</template>
