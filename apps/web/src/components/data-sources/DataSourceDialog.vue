<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { ElButton, ElDialog, ElInput, ElMessage, ElOption, ElSelect } from "element-plus";
import { Save } from "@lucide/vue";
import {
  dataSourceStatusLabels,
  dataSourceStatuses,
  dataSourceSyncStatuses,
  dataSourceTypeLabels,
  dataSourceTypes,
  type DataSourceConfig,
  type DataSourceStatus,
  type DataSourceSyncStatus,
  type DataSourceType
} from "@amazon-monitor/shared";
import type { CreateDataSourcePayload } from "../../api-data-sources";

export type DataSourceDialogPayload = CreateDataSourcePayload;

const props = defineProps<{
  visible: boolean;
  source: DataSourceConfig | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  (event: "update:visible", value: boolean): void;
  (event: "submit", payload: DataSourceDialogPayload): void;
}>();

const form = reactive({
  name: "",
  sourceType: "amazon_sp_api" as DataSourceType,
  marketplace: "US",
  status: "not_connected" as DataSourceStatus,
  syncStatus: "manual" as DataSourceSyncStatus,
  lastSyncedAt: "",
  lastSuccessAt: "",
  syncError: "",
  notes: ""
});

const title = computed(() => (props.source ? "Edit data source" : "Add data source"));

watch(
  () => [props.visible, props.source] as const,
  () => {
    if (!props.visible) return;
    const source = props.source;
    Object.assign(form, {
      name: source?.name ?? "",
      sourceType: source?.sourceType ?? "amazon_sp_api",
      marketplace: source?.marketplace ?? "US",
      status: source?.status ?? "not_connected",
      syncStatus: source?.syncStatus ?? "manual",
      lastSyncedAt: source?.lastSyncedAt ?? "",
      lastSuccessAt: source?.lastSuccessAt ?? "",
      syncError: source?.syncError ?? "",
      notes: source?.notes ?? ""
    });
  },
  { immediate: true }
);

function submit(): void {
  const payload = {
    name: form.name.trim(),
    sourceType: form.sourceType,
    marketplace: form.marketplace.trim() || null,
    status: form.status,
    syncStatus: form.syncStatus,
    lastSyncedAt: form.lastSyncedAt.trim() || null,
    lastSuccessAt: form.lastSuccessAt.trim() || null,
    syncError: form.syncError.trim() || null,
    notes: form.notes.trim() || null
  };
  if (!payload.name) {
    ElMessage.warning("Data source name is required.");
    return;
  }
  emit("submit", payload);
}
</script>

<template>
  <ElDialog :model-value="visible" :title="title" width="680px" @update:model-value="emit('update:visible', $event)">
    <div class="data-source-form">
      <label>
        <span>Name</span>
        <ElInput v-model="form.name" placeholder="Amazon US SP-API" />
      </label>
      <label>
        <span>Type</span>
        <ElSelect v-model="form.sourceType">
          <ElOption v-for="type in dataSourceTypes" :key="type" :label="dataSourceTypeLabels[type]" :value="type" />
        </ElSelect>
      </label>
      <label>
        <span>Marketplace</span>
        <ElInput v-model="form.marketplace" placeholder="US / UK / JP / Global" />
      </label>
      <label>
        <span>Status</span>
        <ElSelect v-model="form.status">
          <ElOption v-for="item in dataSourceStatuses" :key="item" :label="dataSourceStatusLabels[item]" :value="item" />
        </ElSelect>
      </label>
      <label>
        <span>Sync status</span>
        <ElSelect v-model="form.syncStatus">
          <ElOption v-for="item in dataSourceSyncStatuses" :key="item" :label="item" :value="item" />
        </ElSelect>
      </label>
      <label>
        <span>Last synced</span>
        <ElInput v-model="form.lastSyncedAt" placeholder="2026-07-09T09:00:00.000Z" />
      </label>
      <label>
        <span>Last success</span>
        <ElInput v-model="form.lastSuccessAt" placeholder="2026-07-09T09:00:00.000Z" />
      </label>
      <label class="wide">
        <span>Sync error</span>
        <ElInput v-model="form.syncError" placeholder="Optional latest error" />
      </label>
      <label class="wide">
        <span>Notes</span>
        <ElInput v-model="form.notes" type="textarea" :rows="3" placeholder="Ownership, refresh cadence, import SOP" />
      </label>
    </div>
    <template #footer>
      <ElButton @click="emit('update:visible', false)">Cancel</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">
        <template #icon><Save :size="14" /></template>
        Save source
      </ElButton>
    </template>
  </ElDialog>
</template>
