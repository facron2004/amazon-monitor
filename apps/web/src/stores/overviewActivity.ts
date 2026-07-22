import { defineStore } from "pinia";
import type { InsightEvent } from "@amazon-monitor/shared";
import { insightEventApi } from "../api-insight-events";
import { prepareOverviewActivityEvents } from "../utils/overview-activity";

export const useOverviewActivityStore = defineStore("overviewActivity", {
  state: () => ({
    events: [] as InsightEvent[],
    loading: false,
    error: ""
  }),
  actions: {
    async load(date: string, signal?: AbortSignal) {
      this.loading = true;
      this.error = "";
      try {
        const [p0Events, p1Events] = await Promise.all([
          insightEventApi.fetchInsightEvents({ date, level: "P0", sortBy: "createdAt", limit: 50 }, { signal }),
          insightEventApi.fetchInsightEvents({ date, level: "P1", sortBy: "createdAt", limit: 50 }, { signal })
        ]);
        if (signal?.aborted) return;
        this.events = prepareOverviewActivityEvents([...p0Events, ...p1Events]);
      } catch (error) {
        if (signal?.aborted) return;
        this.events = [];
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (!signal?.aborted) {
          this.loading = false;
        }
      }
    }
  }
});
