import { defineStore } from "pinia";
import type { AsinWatchLevel, AsinWatchState, CompetitorFolder, CompetitorPoolItem, ProductActivityCalendar } from "@amazon-monitor/shared";
import { competitorApi } from "../api-competitors";
import { insightEventApi } from "../api-insight-events";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";
import {
  buildCompetitorInsightSuggestion,
  buildCompetitorKpis,
  filterVisibleCompetitors,
  findSelectedCompetitor,
  type CompetitorInsightSuggestion,
  type CompetitorKpi,
  type KpiDelta
} from "../utils/competitor-pool";
import { competitorWatchReason, findCompetitorWatchState } from "../utils/competitorWatchState";
import { toErrorMessage } from "../utils/error-message";

export const useCompetitorStore = defineStore("competitor", {
  state: () => ({
    competitorFolders: [] as CompetitorFolder[],
    competitors: [] as CompetitorPoolItem[],
    competitorQuery: "",
    competitorSourceFilter: "all" as CompetitorSourceFilter,
    competitorTierFilter: "all" as CompetitorTierFilter,
    watchStates: [] as AsinWatchState[],
    watchStateUpdatingAsin: null as string | null,
    selectedCompetitorAsin: null as string | null,
    selectedCompetitorKeywordId: null as number | null,
    productActivityCalendar: null as ProductActivityCalendar | null,
    // "较昨日"差值:后端尚未提供 yesterdayComparison 端点,先用 null 占位。
    // TODO(后端):在 /api/competitors 响应里追加 yesterdayKpiSnapshot,前端 store 做并发加载。
    yesterdayKpiDelta: {
      total: null,
      core: null,
      new: null,
      priceActive: null,
      key: null
    } as KpiDelta
  }),
  getters: {
    visibleCompetitors: (state) =>
      filterVisibleCompetitors({
        competitors: state.competitors,
        competitorQuery: state.competitorQuery,
        competitorSourceFilter: state.competitorSourceFilter,
        competitorTierFilter: state.competitorTierFilter,
        watchStates: state.watchStates
      }),
    selectedCompetitor: (state) => findSelectedCompetitor(state.competitors, state.selectedCompetitorAsin),
    competitorKpis: (state): CompetitorKpi[] =>
      buildCompetitorKpis(state.competitors, state.yesterdayKpiDelta, undefined, state.watchStates),
    competitorInsightSuggestion: (state): CompetitorInsightSuggestion =>
      buildCompetitorInsightSuggestion(state.competitors, undefined, state.watchStates)
  },
  actions: {
    async loadCompetitors() {
      const [folderData, competitorData, watchStateData] = await Promise.all([
        competitorApi.competitorFolders(),
        competitorApi.competitors({
          keywordId: this.selectedCompetitorKeywordId,
          sourceType: this.competitorSourceFilter === "hybrid" ? "hybrid" : "all",
          tier: this.competitorTierFilter
        }),
        insightEventApi.fetchAsinWatchStates()
      ]);

      this.competitorFolders = folderData;
      this.competitors = competitorData;
      this.watchStates = watchStateData;

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
    async setWatchState(item: CompetitorPoolItem, watchLevel: AsinWatchLevel, setError: (message: string) => void) {
      const existing = findCompetitorWatchState(this.watchStates, item.asin);
      this.watchStateUpdatingAsin = item.asin;
      try {
        const updated = await insightEventApi.updateAsinWatchState(item.asin, {
          watchLevel,
          watchReason: existing?.watchReason ?? competitorWatchReason(item),
          firstWatchDate: existing?.firstWatchDate,
          lastEventDate: existing?.lastEventDate ?? null,
          note: existing?.note ?? null
        });
        this.watchStates = [
          updated,
          ...this.watchStates.filter((state) => state.asin !== updated.asin)
        ];
      } catch (error) {
        setError(toErrorMessage(error));
      } finally {
        this.watchStateUpdatingAsin = null;
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
