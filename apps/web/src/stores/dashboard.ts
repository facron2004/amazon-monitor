import { defineStore } from "pinia";
import type { DashboardOverviewResponse } from "@amazon-monitor/shared";
import { dashboardApi } from "../api-dashboard";

export const useDashboardStore = defineStore("dashboard", {
  state: () => ({
    summary: null as DashboardOverviewResponse | null
  }),
  actions: {
    async loadSummary(date: string) {
      this.summary = await dashboardApi.summary(date);
    }
  }
});
