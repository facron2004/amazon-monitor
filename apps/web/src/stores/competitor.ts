import { defineStore } from "pinia";
import type { CompetitorFolder, CompetitorPoolItem, ProductActivityCalendar } from "@amazon-monitor/shared";
import { competitorApi } from "../api-competitors";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";
import { filterVisibleCompetitors, findSelectedCompetitor } from "../utils/competitor-pool";
import { toErrorMessage } from "../utils/error-message";

export const useCompetitorStore = defineStore("competitor", {
  state: () => ({
    competitorFolders: [] as CompetitorFolder[],
    competitors: [] as CompetitorPoolItem[],
    competitorQuery: "",
    competitorSourceFilter: "all" as CompetitorSourceFilter,
    competitorTierFilter: "all" as CompetitorTierFilter,
    selectedCompetitorAsin: null as string | null,
    selectedCompetitorKeywordId: null as number | null,
    productActivityCalendar: null as ProductActivityCalendar | null
  }),
  getters: {
    visibleCompetitors: (state) =>
      filterVisibleCompetitors({
        competitors: state.competitors,
        competitorQuery: state.competitorQuery,
        competitorSourceFilter: state.competitorSourceFilter,
        competitorTierFilter: state.competitorTierFilter
      }),
    selectedCompetitor: (state) => findSelectedCompetitor(state.competitors, state.selectedCompetitorAsin)
  },
  actions: {
    async loadCompetitors() {
      const [folderData, competitorData] = await Promise.all([
        competitorApi.competitorFolders(),
        competitorApi.competitors({
          keywordId: this.selectedCompetitorKeywordId,
          sourceType: this.competitorSourceFilter === "hybrid" ? "hybrid" : "all",
          tier: this.competitorTierFilter
        })
      ]);

      this.competitorFolders = folderData;
      this.competitors = competitorData;

      if (this.selectedCompetitorAsin && !competitorData.some((item) => item.asin === this.selectedCompetitorAsin)) {
        this.selectedCompetitorAsin = null;
        this.productActivityCalendar = null;
      }
    },
    async toggleKeyCompetitor(item: CompetitorPoolItem, setError: (message: string) => void) {
      try {
        await competitorApi.setKeyCompetitor(item.asin, !item.isKeyCompetitor);
        await this.loadCompetitors();
      } catch (error) {
        setError(toErrorMessage(error));
      }
    },
    async selectCompetitorFolder(keywordId: number | null) {
      this.selectedCompetitorKeywordId = keywordId;
      await this.loadCompetitors();
    },
    openCompetitorDrawer(item: CompetitorPoolItem) {
      this.selectedCompetitorAsin = item.asin;
    },
    closeCompetitorDrawer() {
      this.selectedCompetitorAsin = null;
    },
    async openProductActivityCalendar(item: CompetitorPoolItem, date: string) {
      this.selectedCompetitorAsin = item.asin;
      this.productActivityCalendar = await competitorApi.productActivityCalendar(item.asin, {
        date,
        marketplace: item.marketplace,
        limitDays: 90
      });
    },
    openAmazon(item: CompetitorPoolItem) {
      const query = this.selectedCompetitorKeywordId ? `?keywordId=${this.selectedCompetitorKeywordId}` : "";
      window.open(`/api/competitors/${encodeURIComponent(item.asin)}/open${query}`, "_blank", "noopener,noreferrer");
    }
  }
});
