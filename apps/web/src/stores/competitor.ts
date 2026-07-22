import { defineStore } from "pinia";
import type {
  AsinWatchLevel,
  AsinWatchState,
  CompetitorCsvImportResult,
  CompetitorFolder,
  CompetitorPoolItem,
  CreateManualCompetitorInput,
  ProductActivityCalendar,
} from "@amazon-monitor/shared";
import { clearRequestCache } from "../api-base";
import { competitorApi } from "../api-competitors";
import { insightEventApi } from "../api-insight-events";
import type {
  CompetitorSourceFilter,
  CompetitorTierFilter,
} from "../constants/competitors";
import {
  buildCompetitorInsightSuggestion,
  buildCompetitorKpis,
  filterVisibleCompetitors,
  findSelectedCompetitor,
  type CompetitorInsightSuggestion,
  type CompetitorKpi,
  type KpiDelta,
} from "../utils/competitor-pool";
import {
  competitorWatchReason,
  findCompetitorWatchState,
} from "../utils/competitorWatchState";
import { toErrorMessage } from "../utils/error-message";

const COMPETITOR_CACHE_TTL_MS = 15_000;

interface CompetitorCacheEntry {
  loadedAt: number;
  keywordId: number | null;
  sourceFilter: CompetitorSourceFilter;
  tierFilter: CompetitorTierFilter;
  folders: CompetitorFolder[];
  competitors: CompetitorPoolItem[];
  watchStates: AsinWatchState[];
  yesterdayKpiDelta: KpiDelta;
}

let competitorCache: CompetitorCacheEntry | null = null;

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
    yesterdayKpiDelta: {
      total: null,
      core: null,
      new: null,
      priceActive: null,
      key: null,
    } as KpiDelta,
  }),
  getters: {
    visibleCompetitors: (state) =>
      filterVisibleCompetitors({
        competitors: state.competitors,
        competitorQuery: state.competitorQuery,
        competitorSourceFilter: state.competitorSourceFilter,
        competitorTierFilter: state.competitorTierFilter,
        watchStates: state.watchStates,
      }),
    selectedCompetitor: (state) =>
      findSelectedCompetitor(state.competitors, state.selectedCompetitorAsin),
    competitorKpis: (state): CompetitorKpi[] =>
      buildCompetitorKpis(
        state.competitors,
        state.yesterdayKpiDelta,
        undefined,
        state.watchStates,
      ),
    competitorInsightSuggestion: (state): CompetitorInsightSuggestion =>
      buildCompetitorInsightSuggestion(
        state.competitors,
        undefined,
        state.watchStates,
      ),
  },
  actions: {
    async addManualCompetitor(input: CreateManualCompetitorInput) {
      const created = await competitorApi.createManualCompetitor(input);
      competitorCache = null;
      clearRequestCache("/competitors");
      this.selectedCompetitorKeywordId = null;
      await this.loadCompetitors(true);
      this.selectedCompetitorAsin = created.asin;
      return created;
    },
    async importCompetitorCsv(
      source: string,
    ): Promise<CompetitorCsvImportResult> {
      const result = await competitorApi.importCsv(source);
      competitorCache = null;
      clearRequestCache("/competitors");
      this.selectedCompetitorKeywordId = null;
      await this.loadCompetitors(true);
      return result;
    },
    async loadCompetitors(force = false) {
      const now = Date.now();
      const cache = competitorCache;
      const sameQuery =
        cache &&
        cache.keywordId === this.selectedCompetitorKeywordId &&
        cache.sourceFilter === this.competitorSourceFilter &&
        cache.tierFilter === this.competitorTierFilter;

      if (
        !force &&
        sameQuery &&
        now - cache.loadedAt < COMPETITOR_CACHE_TTL_MS
      ) {
        this.competitorFolders = cache.folders;
        this.competitors = cache.competitors;
        this.watchStates = cache.watchStates;
        this.yesterdayKpiDelta = cache.yesterdayKpiDelta;
        return;
      }

      const hasGlobalComparison =
        this.selectedCompetitorKeywordId === null &&
        this.competitorSourceFilter === "all" &&
        this.competitorTierFilter === "all";
      const [folderData, competitorData, kpiComparison] = await Promise.all([
        competitorApi.competitorFolders(),
        competitorApi.competitors({
          keywordId: this.selectedCompetitorKeywordId,
          sourceType:
            this.competitorSourceFilter === "hybrid" ? "hybrid" : "all",
          tier: this.competitorTierFilter,
        }),
        hasGlobalComparison
          ? competitorApi.competitorKpis()
          : Promise.resolve(null),
      ]);

      this.competitorFolders = folderData;
      this.competitors = competitorData;
      this.yesterdayKpiDelta = kpiComparison?.delta ?? emptyKpiDelta();
      competitorCache = {
        loadedAt: now,
        keywordId: this.selectedCompetitorKeywordId,
        sourceFilter: this.competitorSourceFilter,
        tierFilter: this.competitorTierFilter,
        folders: folderData,
        competitors: competitorData,
        watchStates: this.watchStates,
        yesterdayKpiDelta: this.yesterdayKpiDelta,
      };

      void insightEventApi
        .fetchAsinWatchStates()
        .then((watchStateData) => {
          this.watchStates = watchStateData;
          competitorCache = {
            loadedAt: Date.now(),
            keywordId: this.selectedCompetitorKeywordId,
            sourceFilter: this.competitorSourceFilter,
            tierFilter: this.competitorTierFilter,
            folders: this.competitorFolders,
            competitors: this.competitors,
            watchStates: watchStateData,
            yesterdayKpiDelta: this.yesterdayKpiDelta,
          };
        })
        .catch(() => {
          // Keep the faster competitor list visible even if watch states lag.
        });

      if (
        this.selectedCompetitorAsin &&
        !competitorData.some(
          (item) => item.asin === this.selectedCompetitorAsin,
        )
      ) {
        this.selectedCompetitorAsin = null;
        this.productActivityCalendar = null;
      }
    },
    async toggleKeyCompetitor(
      item: CompetitorPoolItem,
      setError: (message: string) => void,
    ) {
      try {
        await competitorApi.setKeyCompetitor(item.asin, !item.isKeyCompetitor);
        competitorCache = null;
        await this.loadCompetitors(true);
      } catch (error) {
        setError(toErrorMessage(error));
      }
    },
    async setWatchState(
      item: CompetitorPoolItem,
      watchLevel: AsinWatchLevel,
      setError: (message: string) => void,
    ) {
      const existing = findCompetitorWatchState(this.watchStates, item.asin);
      this.watchStateUpdatingAsin = item.asin;
      try {
        const updated = await insightEventApi.updateAsinWatchState(item.asin, {
          watchLevel,
          watchReason: existing?.watchReason ?? competitorWatchReason(item),
          firstWatchDate: existing?.firstWatchDate,
          lastEventDate: existing?.lastEventDate ?? null,
          note: existing?.note ?? null,
        });
        this.watchStates = [
          updated,
          ...this.watchStates.filter((state) => state.asin !== updated.asin),
        ];
        if (
          this.selectedCompetitorKeywordId === null &&
          this.competitorSourceFilter === "all" &&
          this.competitorTierFilter === "all"
        ) {
          this.yesterdayKpiDelta = (await competitorApi.competitorKpis()).delta;
          competitorCache = null;
        }
      } catch (error) {
        setError(toErrorMessage(error));
      } finally {
        this.watchStateUpdatingAsin = null;
      }
    },
    async selectCompetitorFolder(keywordId: number | null) {
      if (this.selectedCompetitorKeywordId === keywordId) return;
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
      this.productActivityCalendar = await competitorApi.competitorTimeline(
        item.id,
        {
          date,
          limitDays: 30,
        },
      );
    },
    openAmazon(item: CompetitorPoolItem) {
      const query = this.selectedCompetitorKeywordId
        ? `?keywordId=${this.selectedCompetitorKeywordId}`
        : "";
      window.open(
        `/api/competitors/${encodeURIComponent(item.asin)}/open${query}`,
        "_blank",
        "noopener,noreferrer",
      );
    },
  },
});

function emptyKpiDelta(): KpiDelta {
  return {
    total: null,
    core: null,
    new: null,
    priceActive: null,
    key: null,
  };
}
