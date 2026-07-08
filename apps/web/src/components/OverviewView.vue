<script setup lang="ts">
import type { AiDailyBriefResponse, AlertLog, InsightEvent, KeywordMonitor } from "@amazon-monitor/shared";
import OverviewAlertsPanel from "./OverviewAlertsPanel.vue";
import OverviewKeywordHealthPanel from "./OverviewKeywordHealthPanel.vue";
import OverviewTopActionsPanel from "./OverviewTopActionsPanel.vue";

interface Props {
  keywords: KeywordMonitor[];
  highAlerts: AlertLog[];
  pendingAlertsCount: number;
  topSummary: InsightEvent[];
  topSummaryLoading: boolean;
  dailyBrief: AiDailyBriefResponse | null;
  dailyBriefLoading: boolean;
}

interface Emits {
  (e: "update-alert", alert: AlertLog, status: AlertLog["status"]): void;
  (e: "select-keyword", keywordId: number): void;
  (e: "open-action-center", event: InsightEvent): void;
  (e: "generate-daily-brief"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function handleUpdateAlert(alert: AlertLog, status: AlertLog["status"]) {
  emit("update-alert", alert, status);
}

function handleSelectKeyword(keywordId: number) {
  emit("select-keyword", keywordId);
}

function handleOpenActionCenter(event: InsightEvent) {
  emit("open-action-center", event);
}

function handleGenerateDailyBrief() {
  emit("generate-daily-brief");
}
</script>

<template>
  <section class="view">
    <OverviewTopActionsPanel
      :events="topSummary"
      :loading="topSummaryLoading"
      :daily-brief="dailyBrief"
      :daily-brief-loading="dailyBriefLoading"
      @open-asin="handleOpenActionCenter"
      @generate-daily-brief="handleGenerateDailyBrief"
    />
    <div class="split">
      <OverviewAlertsPanel :high-alerts="highAlerts" :pending-alerts-count="pendingAlertsCount" @update-alert="handleUpdateAlert" />

      <OverviewKeywordHealthPanel :keywords="keywords" @select-keyword="handleSelectKeyword" />
    </div>
  </section>
</template>
