<script setup lang="ts">
import type { AlertLog, DashboardSummary, KeywordMonitor } from "@amazon-monitor/shared";
import OverviewAlertsPanel from "./OverviewAlertsPanel.vue";
import OverviewKeywordHealthPanel from "./OverviewKeywordHealthPanel.vue";
import OverviewMetricsGrid from "./OverviewMetricsGrid.vue";

interface Props {
  summary: DashboardSummary | null;
  keywords: KeywordMonitor[];
  highAlerts: AlertLog[];
  pendingAlertsCount: number;
}

interface Emits {
  (e: "update-alert", alert: AlertLog, status: AlertLog["status"]): void;
  (e: "select-keyword", keywordId: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function handleUpdateAlert(alert: AlertLog, status: AlertLog["status"]) {
  emit("update-alert", alert, status);
}

function handleSelectKeyword(keywordId: number) {
  emit("select-keyword", keywordId);
}
</script>

<template>
  <section class="view">
    <OverviewMetricsGrid :summary="summary" />

    <div class="split">
      <OverviewAlertsPanel :high-alerts="highAlerts" :pending-alerts-count="pendingAlertsCount" @update-alert="handleUpdateAlert" />

      <OverviewKeywordHealthPanel :keywords="keywords" @select-keyword="handleSelectKeyword" />
    </div>
  </section>
</template>
