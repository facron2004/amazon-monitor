import { computed, ref, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { isoDate } from "@amazon-monitor/shared";
import { categoryApi } from "../api-categories";
import { useCategoryStore } from "../stores/category";
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
import { tabs, type TabKey } from "../constants/tabs";
import { toErrorMessage } from "../utils/error-message";

export function useAppController() {
  const { showToast } = useToast();
  const { setChartElement, renderKeywordChart, resizeKeywordChart, disposeKeywordChart } = useKeywordChart();

  const activeTab = ref<TabKey>("categories");
  const sidebarOpen = ref(false);
  const date = ref(isoDate());

  // Per-domain loading states — each tab has its own loading ref
  const overviewLoading = ref(false);
  const categoriesLoading = ref(false);
  const keywordsLoading = ref(false);
  const competitorsLoading = ref(false);
  const alertsLoading = ref(false);
  const reportsLoading = ref(false);
  const notificationsLoading = ref(false);
  const logsLoading = ref(false);
  const collecting = ref(false);

  const loadingMap: Record<TabKey, Ref<boolean>> = {
    overview: overviewLoading,
    categories: categoriesLoading,
    keywords: keywordsLoading,
    competitors: competitorsLoading,
    alerts: alertsLoading,
    reports: reportsLoading,
    notifications: notificationsLoading,
    logs: logsLoading,
  };

  const loading = computed(() =>
    overviewLoading.value || categoriesLoading.value || keywordsLoading.value ||
    competitorsLoading.value || alertsLoading.value || reportsLoading.value ||
    notificationsLoading.value || logsLoading.value || collecting.value
  );

  const { actionMessage, errorMessage, setAction, setError, clearMessages } = useStatusMessages({ showToast });
  const activeTabLabel = computed(() => tabs.find((tab) => tab.key === activeTab.value)?.label ?? "总览");

  const dashboard = useDashboardData(date);

  const categoryStore = useCategoryStore();
  const { categories: categoryMonitors, selectedCategoryId } = storeToRefs(categoryStore);

  const category = useCategoryIntelligence({
    date,
    collecting,
    categoryReport: dashboard.categoryReport,
    setAction,
    setError
  });

  const competitors = useCompetitors({ date, setError });

  const keywords = useKeywords({
    date,
    collecting,
    setAction,
    setError,
    renderKeywordChart,
    loadCurrentView,
    collectAllCategories: () => categoryApi.collectAllCategories({ date: date.value })
  });

  const notifications = useNotifications({ date, clearMessages, setAction, setError });

  const appViewLoaders: AppViewLoaders = {
    overview: async () => {
      keywords.setKeywords(await dashboard.loadOverview());
    },
    categories: category.loadCategories,
    keywords: keywords.loadKeywords,
    competitors: competitors.loadCompetitors,
    alerts: dashboard.loadAlerts,
    reports: dashboard.loadReport,
    notifications: notifications.loadNotifications,
    logs: dashboard.loadLogs
  };

  async function loadAll() {
    clearViewCache();
    await loadCurrentView(true);
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
  }

  function closeSidebar() {
    sidebarOpen.value = false;
  }

  async function loadCurrentView(force = false) {
    const tabLoading = loadingMap[activeTab.value];
    tabLoading.value = true;
    errorMessage.value = "";

    try {
      await loadAppView(activeTab.value, appViewLoaders, date.value, force);
    } catch (error) {
      errorMessage.value = toErrorMessage(error);
    } finally {
      tabLoading.value = false;
    }
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

  const { showAuthModal, passwordInput, authError, handleUnauthorized, handleAuthSubmit } = useAuthGuard(loadCurrentView);

  useAppViewEffects({
    activeTab,
    date,
    categoriesLoading,
    selectedKeywordId: keywords.selectedKeywordId,
    selectedCategoryId,
    competitorSourceFilter: competitors.competitorSourceFilter,
    competitorTierFilter: competitors.competitorTierFilter,
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
    loading,
    collecting,
    actionMessage,
    errorMessage,
    activeTabLabel,
    ...dashboard,
    categories: categoryMonitors,
    loadCategories: category.loadCategories,
    loadCategoryDetail: category.loadCategoryDetail,
    runCategoryCollection: category.runCategoryCollection,
    ...competitors,
    ...keywords,
    ...notifications,
    loadAll,
    toggleSidebar,
    closeSidebar,
    handleOverviewSelectKeyword,
    handleKeywordChartReady,
    showAuthModal,
    passwordInput,
    authError,
    handleAuthSubmit
  };
}
