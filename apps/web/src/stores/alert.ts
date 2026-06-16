import { defineStore } from "pinia";
import type { AlertLog, DailyChange } from "@amazon-monitor/shared";
import { alertApi } from "../api-alerts";

export const useAlertStore = defineStore("alert", {
  state: () => ({
    alerts: [] as AlertLog[],
    changes: [] as DailyChange[],
  }),
  getters: {
    pendingAlerts: (state) => state.alerts.filter((item) => item.status === "pending"),
    highAlerts: (state) => state.alerts.filter((item) => ["critical", "high"].includes(item.alertLevel)),
  },
  actions: {
    async loadAlerts(date: string) {
      this.alerts = await alertApi.alerts(date);
    },
    async loadChanges(date: string) {
      this.changes = await alertApi.changes(date);
    },
    async updateAlert(alert: AlertLog, status: AlertLog["status"], date: string) {
      if (!alert.id) return;
      await alertApi.updateAlertStatus(alert.id, status);
      await this.loadAlerts(date);
    }
  }
});
