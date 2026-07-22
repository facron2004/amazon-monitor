import type { Ref } from "vue";
import { storeToRefs } from "pinia";
import type { AlertLog, KeywordMonitor } from "@amazon-monitor/shared";
import { keywordApi } from "../api-keywords";
import { useDashboardStore } from "../stores/dashboard";
import { useAlertStore } from "../stores/alert";

export function useDashboardData(date: Ref<string>) {
  const dashboardStore = useDashboardStore();
  const alertStore = useAlertStore();

  const { summary } = storeToRefs(dashboardStore);
  const { alerts, pendingAlerts, highAlerts } = storeToRefs(alertStore);

  async function loadOverview(): Promise<KeywordMonitor[]> {
    const [keywordData] = await Promise.all([
      keywordApi.keywords(),
      dashboardStore.loadSummary(date.value),
      alertStore.loadAlerts(date.value)
    ]);
    return keywordData;
  }

  function loadAlerts() {
    return alertStore.loadAlerts(date.value);
  }

  function loadSummary() {
    return dashboardStore.loadSummary(date.value);
  }

  function updateAlert(alert: AlertLog, status: AlertLog["status"]) {
    return alertStore.updateAlert(alert, status, date.value);
  }

  return {
    summary,
    alerts,
    pendingAlerts,
    highAlerts,
    loadOverview,
    loadSummary,
    loadAlerts,
    updateAlert
  };
}
