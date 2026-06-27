import type { Ref } from "vue";
import { storeToRefs } from "pinia";
import type { AlertLog, KeywordMonitor } from "@amazon-monitor/shared";
import { keywordApi } from "../api-keywords";
import { useDashboardStore } from "../stores/dashboard";
import { useAlertStore } from "../stores/alert";

export function useDashboardData(date: Ref<string>) {
  const dashboardStore = useDashboardStore();
  const alertStore = useAlertStore();

  const { summary, logs, report, categoryReport, periodInsightReport } = storeToRefs(dashboardStore);
  const { alerts, changes, pendingAlerts, highAlerts } = storeToRefs(alertStore);

  async function loadOverview(): Promise<KeywordMonitor[]> {
    const [keywordData] = await Promise.all([
      keywordApi.keywords(),
      dashboardStore.loadSummary(date.value),
      alertStore.loadAlerts(date.value),
      alertStore.loadChanges(date.value)
    ]);
    return keywordData;
  }

  function loadAlerts() {
    return alertStore.loadAlerts(date.value);
  }

  function loadReport(signal?: AbortSignal) {
    return dashboardStore.loadReport(date.value, signal);
  }

  function loadPeriodInsightReport(includeAiSummary = false) {
    return dashboardStore.loadPeriodInsightReport(date.value, includeAiSummary);
  }

  function loadLogs() {
    return dashboardStore.loadLogs();
  }

  function updateAlert(alert: AlertLog, status: AlertLog["status"]) {
    return alertStore.updateAlert(alert, status, date.value);
  }

  return {
    summary,
    alerts,
    changes,
    logs,
    report,
    categoryReport,
    periodInsightReport,
    pendingAlerts,
    highAlerts,
    loadOverview,
    loadAlerts,
    loadReport,
    loadPeriodInsightReport,
    loadLogs,
    updateAlert
  };
}
