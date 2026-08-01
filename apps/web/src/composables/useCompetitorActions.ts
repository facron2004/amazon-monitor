import type { Ref } from "vue";
import type { CompetitorFolder, CompetitorPoolItem, ProductActivityCalendar } from "@amazon-monitor/shared";
import { competitorApi } from "../api-competitors";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";
import { toErrorMessage } from "../utils/error-message";

interface UseCompetitorActionsOptions {
  date: Ref<string>;
  competitorFolders: Ref<CompetitorFolder[]>;
  competitors: Ref<CompetitorPoolItem[]>;
  competitorSourceFilter: Ref<CompetitorSourceFilter>;
  competitorTierFilter: Ref<CompetitorTierFilter>;
  selectedCompetitorAsin: Ref<string | null>;
  selectedCompetitorKeywordId: Ref<number | null>;
  productActivityCalendar: Ref<ProductActivityCalendar | null>;
  setError(message: string): void;
}

export function useCompetitorActions(options: UseCompetitorActionsOptions) {
  async function loadCompetitors() {
    const [folderData, competitorData] = await Promise.all([
      competitorApi.competitorFolders(),
      competitorApi.competitors({
        keywordId: options.selectedCompetitorKeywordId.value,
        sourceType: options.competitorSourceFilter.value === "hybrid" ? "hybrid" : "all",
        tier: options.competitorTierFilter.value
      })
    ]);

    options.competitorFolders.value = folderData;
    options.competitors.value = competitorData;

    if (options.selectedCompetitorAsin.value && !competitorData.some((item) => item.asin === options.selectedCompetitorAsin.value)) {
      options.selectedCompetitorAsin.value = null;
      options.productActivityCalendar.value = null;
    }
  }

  async function toggleKeyCompetitor(item: CompetitorPoolItem) {
    try {
      await competitorApi.setKeyCompetitor(item.asin, !item.isKeyCompetitor);
      await loadCompetitors();
    } catch (error) {
      options.setError(toErrorMessage(error));
    }
  }

  async function selectCompetitorFolder(keywordId: number | null) {
    options.selectedCompetitorKeywordId.value = keywordId;
    await loadCompetitors();
  }

  function openCompetitorDrawer(item: CompetitorPoolItem) {
    options.selectedCompetitorAsin.value = item.asin;
  }

  function closeCompetitorDrawer() {
    options.selectedCompetitorAsin.value = null;
  }

  async function openProductActivityCalendar(item: CompetitorPoolItem) {
    options.selectedCompetitorAsin.value = item.asin;
    options.productActivityCalendar.value = await competitorApi.competitorTimeline(item.id, {
      date: options.date.value,
      limitDays: 90
    });
  }

  async function openAmazon(item: CompetitorPoolItem) {
    const query = options.selectedCompetitorKeywordId.value ? `?keywordId=${options.selectedCompetitorKeywordId.value}` : "";
    const base = import.meta.env.VITE_API_BASE?.trim() || "/api";
    try {
      const res = await fetch(`${base}/competitors/${encodeURIComponent(item.asin)}/link${query}`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { url?: string };
        if (data.url) {
          window.open(data.url, "_blank", "noopener,noreferrer");
          return;
        }
      }
    } catch {
      // Fallback
    }
    const fallbackUrl = item.latestProductUrl || `https://www.amazon.com/dp/${encodeURIComponent(item.asin)}`;
    window.open(fallbackUrl, "_blank", "noopener,noreferrer");
  }

  return {
    loadCompetitors,
    toggleKeyCompetitor,
    selectCompetitorFolder,
    openCompetitorDrawer,
    closeCompetitorDrawer,
    openProductActivityCalendar,
    openAmazon
  };
}
