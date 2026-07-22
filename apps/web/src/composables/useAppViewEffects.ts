import { onMounted, onUnmounted, watch, type Ref } from "vue";
import { watchDebounced } from "@vueuse/core";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";
import type { TabKey } from "../constants/tabs";
import { toErrorMessage } from "../utils/error-message";

interface UseAppViewEffectsOptions {
  canLoad(): boolean;
  activeTab: Ref<TabKey>;
  date: Ref<string>;
  categoriesLoading: Ref<boolean>;
  selectedKeywordId: Ref<number | null>;
  selectedCategoryId: Ref<number | null>;
  competitorSourceFilter: Ref<CompetitorSourceFilter>;
  competitorTierFilter: Ref<CompetitorTierFilter>;
  /**
   * Issue a fresh AbortSignal that gets aborted automatically when the next
   * effect (tab switch, filter change, refresh, etc.) runs. The caller
   * receives the signal so it can forward it to API calls.
   */
  acquireLoadSignal(): AbortSignal | undefined;
  loadCurrentView(): Promise<void>;
  loadKeywordDetail(signal?: AbortSignal): Promise<void>;
  loadCategoryDetail(signal?: AbortSignal): Promise<void>;
  loadCompetitors(signal?: AbortSignal): Promise<void>;
  loadCategories(signal?: AbortSignal): Promise<void>;
  resizeKeywordChart(): void;
  disposeKeywordChart(): void;
  handleUnauthorized(): void;
  setError(message: string): void;
  setErrorMessage(message: string): void;
}

export function useAppViewEffects(options: UseAppViewEffectsOptions) {
  let categoryRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let resizeHandler: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;

  function setInlineError(error: unknown) {
    // Silently ignore aborted requests
    if (error instanceof DOMException && error.name === "AbortError") return;
    options.setErrorMessage(toErrorMessage(error));
  }

  watchDebounced(options.activeTab, () => {
    if (!options.canLoad()) return;
    options.loadCurrentView().catch(setInlineError);
  }, { debounce: 200 });

  watch(options.selectedKeywordId, () => {
    if (!options.canLoad() || options.activeTab.value !== "keywords") {
      return;
    }

    options.loadKeywordDetail(options.acquireLoadSignal()).catch(setInlineError);
  });

  watch(options.selectedCategoryId, () => {
    if (!options.canLoad() || options.activeTab.value !== "categories") {
      return;
    }

    options.loadCategoryDetail(options.acquireLoadSignal()).catch(setInlineError);
  });

  watchDebounced([options.competitorSourceFilter, options.competitorTierFilter], () => {
    if (!options.canLoad() || options.activeTab.value !== "competitors") {
      return;
    }

    options.loadCompetitors(options.acquireLoadSignal()).catch(setInlineError);
  }, { debounce: 300 });

  watchDebounced(options.date, () => {
    if (!options.canLoad()) return;
    options.loadCurrentView().catch(setInlineError);
  }, { debounce: 300 });

  function startCategoryRefresh() {
    stopCategoryRefresh();
    categoryRefreshTimer = setInterval(() => {
      if (!options.canLoad() || options.activeTab.value !== "categories" || options.categoriesLoading.value) {
        return;
      }
      // Skip refresh when page is not visible
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      options.loadCategories(options.acquireLoadSignal()).catch(setInlineError);
    }, 60_000);
  }

  function stopCategoryRefresh() {
    if (categoryRefreshTimer) {
      clearInterval(categoryRefreshTimer);
      categoryRefreshTimer = null;
    }
  }

  onMounted(() => {
    startCategoryRefresh();

    // Pause/resume polling based on page visibility
    visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        stopCategoryRefresh();
      } else {
        startCategoryRefresh();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    resizeHandler = options.resizeKeywordChart;
    window.addEventListener("resize", resizeHandler);
    window.addEventListener("amazon-monitor-unauthorized", options.handleUnauthorized);
  });

  onUnmounted(() => {
    stopCategoryRefresh();

    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
    }

    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
    }

    window.removeEventListener("amazon-monitor-unauthorized", options.handleUnauthorized);
    options.disposeKeywordChart();
  });
}
