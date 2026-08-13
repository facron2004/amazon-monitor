<script setup lang="ts">
import { AlertTriangle, Database, Save } from "@lucide/vue";
import { ElButton, ElTag } from "element-plus";
import {
  dataSourceStatusLabels,
  dataSourceTypeLabels,
  type DataSourceConfig
} from "@amazon-monitor/shared";
import { dataSourceSyncType, dataSourceTimeText } from "./data-source-display";
import DataSourceImportPanel from "./DataSourceImportPanel.vue";
import SpApiConnectionPanel from "./SpApiConnectionPanel.vue";
import DataSourceSyncHistory from "./DataSourceSyncHistory.vue";
import DataSourceOverrideHistory from "./DataSourceOverrideHistory.vue";

defineProps<{
  source: DataSourceConfig | null;
  canEdit?: boolean;
  canCollect?: boolean;
}>();

const emit = defineEmits<{
  (event: "edit", source: DataSourceConfig): void;
}>();
</script>

<template>
  <aside class="panel data-source-detail">
    <div v-if="!source" class="empty-state">
      <Database :size="28" />
      <p>Select a data source to review its sync contract.</p>
    </div>
    <template v-else>
      <div class="panel-head">
        <div>
          <h2>{{ source.name }}</h2>
          <span>{{ dataSourceTypeLabels[source.sourceType] }}</span>
        </div>
        <ElButton size="small" type="primary" :disabled="!canEdit" @click="emit('edit', source)">
          <template #icon><Save :size="12" /></template>
          Edit
        </ElButton>
      </div>

      <section class="data-source-detail-grid">
        <div>
          <span>Status</span>
          <strong>{{ dataSourceStatusLabels[source.status] }}</strong>
        </div>
        <div>
          <span>Sync</span>
          <ElTag size="small" :type="dataSourceSyncType(source.syncStatus)">{{ source.syncStatus }}</ElTag>
        </div>
        <div>
          <span>Marketplace</span>
          <strong>{{ source.marketplace || "Global" }}</strong>
        </div>
        <div>
          <span>Owner</span>
          <strong>{{ source.ownerId ?? "Unassigned" }}</strong>
        </div>
      </section>

      <section class="data-source-section">
        <h3>Freshness</h3>
        <ul>
          <li>Last synced: {{ dataSourceTimeText(source.lastSyncedAt) }}</li>
          <li>Last success: {{ dataSourceTimeText(source.lastSuccessAt) }}</li>
          <li>Updated: {{ dataSourceTimeText(source.updatedAt) }}</li>
        </ul>
      </section>

      <section v-if="source.syncError" class="data-source-alert">
        <AlertTriangle :size="16" />
        <p>{{ source.syncError }}</p>
      </section>

      <section class="data-source-section">
        <h3>Operating note</h3>
        <p>{{ source.notes || "No note yet." }}</p>
      </section>

      <DataSourceImportPanel
        v-if="source.sourceType === 'csv_import'"
        :key="source.id"
        :source="source"
        :can-run="canEdit && source.status !== 'disabled'"
      />

      <SpApiConnectionPanel
        v-if="source.sourceType === 'amazon_sp_api'"
        :key="`sp-api-${source.id}`"
        :source="source"
        :can-manage-data-sources="Boolean(canEdit)"
        :can-manage-collection="Boolean(canCollect)"
      />

      <DataSourceSyncHistory :key="`runs-${source.id}`" :source-id="source.id" />

      <DataSourceOverrideHistory
        v-if="source.sourceType === 'csv_import'"
        :key="`overrides-${source.id}`"
        :source-id="source.id"
      />

      <section class="data-source-section">
        <h3>Approval boundary</h3>
        <p>
          CSV imports update product facts, daily metrics, and Ads performance evidence. Pricing,
          budget, Listing, and inventory write actions remain task-based and approval-gated.
        </p>
      </section>
    </template>
  </aside>
</template>
