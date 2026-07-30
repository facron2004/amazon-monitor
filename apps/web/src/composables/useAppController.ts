import { computed, onUnmounted, ref, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { isoDate } from "@amazon-monitor/shared";
import type { CollectionFreshness, InsightEvent, QueueStats, WorkerStatus } from "@amazon-monitor/shared";
import { categoryApi } from "../api-categories";
import { collectApi } from "../api-collect";
import { useCategoryStore } from "../stores/category";
import { useInsightEventsStore } from "../stores/insightEvents";
import { loadAppView, clearViewCache, type AppViewLoaders } from "./app-view-loader";
import { useAuthGuard } from "./useAuthGuard";
import { useAppViewEffects } from "./useAppViewEffects";
import { useCategoryIntelligence } from "./useCategoryIntelligence";
import { useCompetitors } from "./useCompetitors";
import { useKeywords } from "./useKeywords";
import { useStatusMessages } from "./useStatusMessages";
import { useToast } from "./useToast";
import { useKeywordChart } from "./useKeywordChart";
import { useNotifications } from "./useNotifications";
import { useDashboardData } from "./useDashboardData";
import { useReportsStore } from "../stores/reports";
import { useSessionStore } from "../stores/session";
import { tabs, type TabKey } from "../constants/tabs";
import type { InsightReportPeriod } from "../api-types";
import { toErrorMessage } from "../utils/error-message";
import { useOverviewWorkflowActions } from "./useOverviewWorkflowActions";
import { useOverviewActivityStore } from "../stores/overviewActivity";
import { registerSessionBoundaryListener } from "../session-boundary";
import { createNotificationForm } from "../types/notification";

export function useAppController() {
  const session = useSessionStore();
  const { showToast } = useToast();
  const { setChartElement, renderKeywordChart, resizeKeywordChart, disposeKeywordChart } = useKeywordChart();

  const activeTab = ref<TabKey>("overview");
  const sidebarOpen = ref(false);
  const date = ref(isoDate());
  const reportPeriod = ref<InsightReportPeriod>("weekly");

  // Per-domain loading states — each tab has its own loading ref
  const overviewLoading = ref(false);
  const categoriesLoading = ref(false);
  const keywordsLoading = ref(false);
  const competitorsLoading = ref(false);
  const productsLoading = ref(false);
  const inventoryLoading = ref(false);
  const profitLoading = ref(false);
  const listingHealthLoading = ref(false);
  const adsLoading = ref(false);
  const reviewVocLoading = ref(false);
  const actionCenterLoading = ref(false);
  const aiAgentsLoading = ref(false);
  const tasksLoading = ref(false);
  const promotionsLoading = ref(false);
  const sopsLoading = ref(false);
  const rulesLoading = ref(false);
  const dataSourcesLoading = ref(false);
  const alertsLoading = ref(false);
  const reportsLoading = ref(false);
  const notificationsLoading = ref(false);
  const logsLoading = ref(false);
  const collecting = ref(false);
  const freshness = ref<CollectionFreshness[]>([]);
  const queueStats = ref<QueueStats | null>(null);
  const workerStatus = ref<WorkerStatus | null>(null);

  const loadingMap: Record<TabKey, Ref<boolean>> = {
    overview: overviewLoading,
    categories: categoriesLoading,
    keywords: keywordsLoading,
    competitors: competitorsLoading,
    products: productsLoading,
    inventory: inventoryLoading,
    profit: profitLoading,
    "listing-health": listingHealthLoading,
    ads: adsLoading,
    "review-voc": reviewVocLoading,
    "action-center": actionCenterLoading,
    "ai-agents": aiAgentsLoading,
    tasks: tasksLoading,
    promotions: promotionsLoading,
    sops: sopsLoading,
    rules: rulesLoading,
    "data-sources": dataSourcesLoading,
    alerts: alertsLoading,
    reports: reportsLoading,
    notifications: notificationsLoading,
    logs: logsLoading,
  };

  const activeViewLoading = computed(() => loadingMap[activeTab.value].value);
  const viewErrorMessage = ref("");

  const loading = computed(() =>
    overviewLoading.value || categoriesLoading.value || keywordsLoading.value ||
    competitorsLoading.value || productsLoading.value || inventoryLoading.value || profitLoading.value || listingHealthLoading.value || adsLoading.value || reviewVocLoading.value || actionCenterLoading.value || aiAgentsLoading.value || promotionsLoading.value || rulesLoading.value || dataSourcesLoading.value || alertsLoading.value || reportsLoading.value ||
    notificationsLoading.value || logsLoading.value || collecting.value
  );

  const { actionMessage, errorMessage, setAction, setError, clearMessages } = useStatusMessages({ showToast });
  const activeTabLabel = computed(() => tabs.find((tab) => tab.key === activeTab.value)?.label ?? "总览");

  const dashboard = useDashboardData(date);
  const overviewWorkflow = useOverviewWorkflowActions({
    date,
    loadSummary: dashboard.loadSummary,
    setAction,
    setError
  });
  const reportsStore = useReportsStore();
  const reports = storeToRefs(reportsStore);
  const categoryStore = useCategoryStore();
  const insightEventsStore = useInsightEventsStore();
  const overviewActivityStore = useOverviewActivityStore();
  const insightEventRefs = storeToRefs(insightEventsStore);
  const { categories: categoryMonitors, selectedCategoryId } = storeToRefs(categoryStore);

  const category = useCategoryIntelligence({
    date,
    collecting,
    categoryReport: reports.categoryReport,
    setAction,
    setError,
    refreshCollectionStatus
  });

  const competitors = useCompetitors({ date, setError });

  const keywords = useKeywords({
    date,
    collecting,
    setAction,
    setError,
    renderKeywordChart,
    loadCurrentView,
    collectAllCategories: () => categoryApi.collectAllCategories({ date: date.value }),
    refreshCollectionStatus
  });

  const notifications = useNotifications({ date, clearMessages, setAction, setError });

  const appViewLoaders: AppViewLoaders = {
    overview: async (signal?: AbortSignal) => {
      await Promise.all([
        keywords.setKeywords(await dashboard.loadOverview()),
        insightEventsStore.loadTopSummary(date.value, signal),
        overviewActivityStore.load(date.value, signal),
        reportsStore.loadArchive(date.value, signal)
      ]);
    },
    categories: category.loadCategories,
    keywords: keywords.loadKeywords,
    competitors: competitors.loadCompetitors,
    products: async () => {
      const { useProductStore } = await import("../stores/products.js");
      await useProductStore().fetchProducts(date.value);
    },
    inventory: async () => {
      const { useInventoryStore } = await import("../stores/inventory.js");
      await useInventoryStore().fetchPlans(date.value);
    },
    profit: async () => {
      const { useProfitStore } = await import("../stores/profit.js");
      await useProfitStore().fetchPlans(date.value);
    },
    "listing-health": async () => {
      const { useListingHealthStore } = await import("../stores/listingHealth.js");
      await useListingHealthStore().fetchItems(date.value);
    },
    ads: async () => {
      const { useAdsStore } = await import("../stores/ads.js");
      await useAdsStore().fetchSummary(date.value);
    },
    "review-voc": async () => {
      const { useReviewVocStore } = await import("../stores/reviewVoc.js");
      await useReviewVocStore().fetchSummaries(date.value);
    },
    "action-center": async (signal?: AbortSignal) => {
      await Promise.all([
        insightEventsStore.loadEvents(date.value, signal),
        insightEventsStore.loadReviewDueEvents(date.value, signal),
        insightEventsStore.loadWatchStates(signal)
      ]);
    },
    "ai-agents": async () => {
      const [{ useAiRunsStore }, { useAgentWorkspaceStore }] = await Promise.all([
        import("../stores/aiRuns.js"),
        import("../stores/agentWorkspace.js"),
      ]);
      await Promise.all([
        useAiRunsStore().fetchRuns(),
        useAgentWorkspaceStore().fetchWorkspace(),
      ]);
    },
    tasks: async () => {
      const { useTaskStore } = await import("../stores/tasks.js");
      await useTaskStore().fetchTasks();
    },
    promotions: async (signal?: AbortSignal) => {
      const { usePromotionStore } = await import("../stores/promotions.js");
      await usePromotionStore().fetchWorkspace(date.value, signal);
    },
    sops: async () => {
      const { useSopStore } = await import("../stores/sops.js");
      await useSopStore().fetchSops();
    },
    rules: async () => {
      const { useRulesStore } = await import("../stores/rules.js");
      await useRulesStore().fetchRules();
    },
    "data-sources": async () => {
      const { useDataSourcesStore } = await import("../stores/dataSources.js");
      await useDataSourcesStore().fetchSources();
    },
    alerts: dashboard.loadAlerts,
    reports: (signal?: AbortSignal) => reportsStore.loadWorkspace(date.value, reportPeriod.value, signal),
    notifications: notifications.loadNotifications,
    logs: async () => {
      const { useCollectorsStore } = await import("../stores/collectors.js");
      await useCollectorsStore().fetchCenter();
    }
  };

  async function loadAll() {
    clearViewCache();
    await loadCurrentView(true);
  }

  /**
   * Per-load AbortController. We replace this on every `loadCurrentView`
   * call, aborting any in-flight request left over from the previous tab or
   * date. Stores / loaders receive the new `signal` and forward it to fetch
   * so cancelled requests don't write stale state when they eventually return.
   *
   * `acquireLoadSignal` is exposed to `useAppViewEffects` so non-tab-change
   * triggers (selectedKeywordId, filter changes, polling) reuse the same
   * lifecycle — picking up the same signal that the next `loadCurrentView`
   * call will abort.
   */
  let loadSignalController: AbortController | null = null;

  const unregisterSessionBoundary = registerSessionBoundaryListener(() => {
    loadSignalController?.abort();
    loadSignalController = null;
    for (const viewLoading of Object.values(loadingMap)) {
      viewLoading.value = false;
    }
    collecting.value = false;
    freshness.value = [];
    queueStats.value = null;
    workerStatus.value = null;
    viewErrorMessage.value = "";
    notifications.notificationSchedules.value = [];
    notifications.notificationLogs.value = [];
    notifications.notificationForm.value = createNotificationForm();
    notifications.sendingScheduleId.value = null;
    clearMessages();
  });

  onUnmounted(unregisterSessionBoundary);

  function acquireLoadSignal(): AbortSignal | undefined {
    if (loadSignalController?.signal.aborted) return undefined;
    return loadSignalController?.signal;
  }

  async function loadCurrentView(force = false) {
    loadSignalController?.abort();
    const controller = new AbortController();
    loadSignalController = controller;
    for (const viewLoading of Object.values(loadingMap)) {
      viewLoading.value = false;
    }
    const tabLoading = loadingMap[activeTab.value];
    tabLoading.value = true;
    errorMessage.value = "";
    viewErrorMessage.value = "";

    try {
      await Promise.all([
        loadAppView(activeTab.value, appViewLoaders, date.value, force, controller.signal),
        loadFreshness(),
        loadQueueStats(),
        loadWorkerStatus()
      ]);
    } catch (error) {
      // Swallow AbortError — the next load supersedes this one intentionally.
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = toErrorMessage(error);
      errorMessage.value = message;
      viewErrorMessage.value = message;
    } finally {
      if (loadSignalController === controller) {
        tabLoading.value = false;
      }
    }
  }

  function retryCurrentView(): Promise<void> {
    return loadCurrentView(true);
  }

  /**
   * Switch to Action Center and open the drawer for the given event's ASIN.
   * Used by Overview's "今日必看" panel.
   */
  async function openActionCenterForEvent(event: InsightEvent) {
    insightEventsStore.$patch({ selectedEvent: null });
    activeTab.value = "action-center";
    await insightEventsStore.loadEventDetail(event.id);
  }

  function openCompetitorInsights(asin?: string) {
    insightEventsStore.focusCompetitorInsights(date.value, asin);
    activeTab.value = "action-center";
  }

  async function generateDailyBrief() {
    try {
      await insightEventsStore.generateDailyBrief(date.value);
      setAction("AI Agent brief generated.");
    } catch (error) {
      setError(toErrorMessage(error));
    }
  }

  async function setReportPeriod(period: InsightReportPeriod) {
    if (reportPeriod.value === period) return;
    reportPeriod.value = period;
    if (activeTab.value !== "reports") return;

    reportsLoading.value = true;
    errorMessage.value = "";
    viewErrorMessage.value = "";
    try {
      await reportsStore.loadPeriodWorkspace(date.value, reportPeriod.value);
    } catch (error) {
      const message = toErrorMessage(error);
      errorMessage.value = message;
      viewErrorMessage.value = message;
    } finally {
      reportsLoading.value = false;
    }
  }

  /**
   * Fetch the latest collection queue snapshot for the dashboard freshness badge.
   * Independent of the active tab — the badge should always reflect reality,
   * even before the user lands on a data tab. Errors are swallowed so a flaky
   * queue doesn't block the rest of the dashboard.
   */
  async function loadFreshness() {
    try {
      freshness.value = await collectApi.fetchFreshness();
    } catch {
      // Keep previous value; badge will simply not refresh this round.
    }
  }

  /**
   * Queue health snapshot for the topbar "pending/processing/oldest" badge.
   * Runs alongside `loadFreshness` on `loadAll` and silently no-ops on error
   * so a stalled queue can't break the rest of the UI.
   */
  async function loadQueueStats() {
    try {
      queueStats.value = await collectApi.fetchQueueStats();
    } catch {
      // Keep previous value.
    }
  }

  /**
   * Background Worker health snapshot — last heart-beat, uptime, current
   * job. Drives the topbar "online / stale / offline" dot. Like
   * `loadQueueStats`, this is unconditional on tab so a dead Worker is
   * visible from any view the moment the user opens the dashboard.
   */
  async function loadWorkerStatus() {
    try {
      workerStatus.value = await collectApi.fetchWorkerStatus();
    } catch {
      // Keep previous value.
    }
  }

  async function restartWorker() {
    try {
      await collectApi.restartWorker();
      await loadWorkerStatus();
    } catch (error) {
      setError(toErrorMessage(error));
    }
  }

  async function refreshCollectionStatus() {
    await Promise.all([loadQueueStats(), loadWorkerStatus()]);
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
  }

  function closeSidebar() {
    sidebarOpen.value = false;
  }

  function handleOverviewSelectKeyword(id: number) {
    keywords.selectedKeywordId.value = id;
    activeTab.value = "keywords";
  }

  function handleKeywordChartReady(element: HTMLDivElement | null) {
    setChartElement(element);
    if (element) {
      keywords.renderCurrentKeywordChart().catch((error) => {
        errorMessage.value = toErrorMessage(error);
      });
    }
  }

  const { showAuthModal, mode, usernameInput, passwordInput, authError, handleUnauthorized, handleAuthSubmit, switchMode } = useAuthGuard(loadCurrentView);

  useAppViewEffects({
    canLoad: () => session.isAuthenticated,
    activeTab,
    date,
    categoriesLoading,
    selectedKeywordId: keywords.selectedKeywordId,
    selectedCategoryId,
    competitorSourceFilter: competitors.competitorSourceFilter,
    competitorTierFilter: competitors.competitorTierFilter,
    acquireLoadSignal,
    loadCurrentView,
    loadKeywordDetail: keywords.loadDetail,
    loadCategoryDetail: category.loadCategoryDetail,
    loadCompetitors: competitors.loadCompetitors,
    loadCategories: category.loadCategories,
    resizeKeywordChart,
    disposeKeywordChart,
    handleUnauthorized,
    setError,
    setErrorMessage: (message) => {
      errorMessage.value = message;
    }
  });

  return {
    activeTab,
    sidebarOpen,
    date,
    reportPeriod,
    loading,
    activeViewLoading,
    viewErrorMessage,
    collecting,
    freshness,
    queueStats,
    workerStatus,
    loadFreshness,
    loadQueueStats,
    loadWorkerStatus,
    restartWorker,
    actionMessage,
    errorMessage,
    activeTabLabel,
    ...dashboard,
    loadPeriodInsightReport: (includeAiSummary = false) =>
      reportsStore.loadPeriodInsightReport(date.value, reportPeriod.value, includeAiSummary),
    setReportPeriod,
    topSummary: insightEventRefs.topSummary,
    topSummaryLoading: insightEventRefs.topSummaryLoading,
    dailyBrief: insightEventRefs.dailyBrief,
    dailyBriefLoading: insightEventRefs.dailyBriefLoading,
    ...overviewWorkflow,
    generateDailyBrief,
    openActionCenterForEvent,
    openCompetitorInsights,
    categories: categoryMonitors,
    loadCategories: category.loadCategories,
    loadCategoryDetail: category.loadCategoryDetail,
    runCategoryCollection: category.runCategoryCollection,
    createCategory: category.createCategory,
    toggleCategory: category.toggleCategory,
    ...competitors,
    ...keywords,
    ...notifications,
    loadAll,
    retryCurrentView,
    toggleSidebar,
    closeSidebar,
    handleOverviewSelectKeyword,
    handleKeywordChartReady,
    showAuthModal,
    mode,
    usernameInput,
    passwordInput,
    authError,
    handleAuthSubmit,
    switchMode
  };
}
