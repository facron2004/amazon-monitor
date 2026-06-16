import type { CompetitorPoolItem } from "@amazon-monitor/shared";
import { storeToRefs } from "pinia";
import type { Ref } from "vue";
import { useCompetitorStore } from "../stores/competitor";

interface UseCompetitorsOptions {
  date: Ref<string>;
  setError(message: string): void;
}

export function useCompetitors(options: UseCompetitorsOptions) {
  const store = useCompetitorStore();

  const {
    competitorFolders,
    competitors,
    competitorQuery,
    competitorSourceFilter,
    competitorTierFilter,
    selectedCompetitorKeywordId,
    productActivityCalendar,
    visibleCompetitors,
    selectedCompetitor
  } = storeToRefs(store);

  const loadCompetitors = () => store.loadCompetitors();
  const toggleKeyCompetitor = (item: CompetitorPoolItem) => store.toggleKeyCompetitor(item, options.setError);
  const selectCompetitorFolder = (keywordId: number | null) => store.selectCompetitorFolder(keywordId);
  const openCompetitorDrawer = (item: CompetitorPoolItem) => store.openCompetitorDrawer(item);
  const closeCompetitorDrawer = () => store.closeCompetitorDrawer();
  const openProductActivityCalendar = (item: CompetitorPoolItem) => store.openProductActivityCalendar(item, options.date.value);
  const openAmazon = (item: CompetitorPoolItem) => store.openAmazon(item);

  return {
    competitorFolders,
    competitors,
    competitorQuery,
    competitorSourceFilter,
    competitorTierFilter,
    selectedCompetitorKeywordId,
    productActivityCalendar,
    visibleCompetitors,
    selectedCompetitor,
    loadCompetitors,
    toggleKeyCompetitor,
    selectCompetitorFolder,
    openCompetitorDrawer,
    closeCompetitorDrawer,
    openProductActivityCalendar,
    openAmazon
  };
}
