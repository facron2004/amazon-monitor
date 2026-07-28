<script setup lang="ts">
import { defineAsyncComponent, onMounted } from "vue";
import Toast from "./components/Toast.vue";
import AuthModal from "./components/AuthModal.vue";
import AppSidebar from "./components/AppSidebar.vue";
import AppTopbar from "./components/AppTopbar.vue";
import AppViewState from "./components/AppViewState.vue";
import { useAppController } from "./composables/useAppController";
import { useSessionStore } from "./stores/session";

const viewModules = {
  overview: () => import("./components/OverviewView.vue"),
  categories: () => import("./components/CategoriesView.vue"),
  keywords: () => import("./components/KeywordsView.vue"),
  competitors: () => import("./components/CompetitorsView.vue"),
  products: () => import("./components/ProductsView.vue"),
  inventory: () => import("./components/InventoryView.vue"),
  profit: () => import("./components/ProfitView.vue"),
  "listing-health": () => import("./components/ListingHealthView.vue"),
  ads: () => import("./components/AdsView.vue"),
  "review-voc": () => import("./components/ReviewVocView.vue"),
  "action-center": () => import("./components/ActionCenterPanel.vue"),
  "ai-agents": () => import("./components/AiAgentsView.vue"),
  tasks: () => import("./components/TasksView.vue"),
  promotions: () => import("./components/PromotionsView.vue"),
  sops: () => import("./components/SopsView.vue"),
  rules: () => import("./components/RulesView.vue"),
  "data-sources": () => import("./components/DataSourcesView.vue"),
  alerts: () => import("./components/AlertsView.vue"),
  reports: () => import("./components/ReportsView.vue"),
  notifications: () => import("./components/NotificationsView.vue"),
  logs: () => import("./components/CollectorsView.vue")
} as const;

const OverviewView = defineAsyncComponent(viewModules.overview);
const CategoriesView = defineAsyncComponent(viewModules.categories);
const KeywordsView = defineAsyncComponent(viewModules.keywords);
const CompetitorsView = defineAsyncComponent(viewModules.competitors);
const ProductsView = defineAsyncComponent(viewModules.products);
const InventoryView = defineAsyncComponent(viewModules.inventory);
const ProfitView = defineAsyncComponent(viewModules.profit);
const ListingHealthView = defineAsyncComponent(viewModules["listing-health"]);
const AdsView = defineAsyncComponent(viewModules.ads);
const ReviewVocView = defineAsyncComponent(viewModules["review-voc"]);
const ActionCenterPanel = defineAsyncComponent(viewModules["action-center"]);
const AiAgentsView = defineAsyncComponent(viewModules["ai-agents"]);
const TasksView = defineAsyncComponent(viewModules.tasks);
const PromotionsView = defineAsyncComponent(viewModules.promotions);
const SopsView = defineAsyncComponent(viewModules.sops);
const RulesView = defineAsyncComponent(viewModules.rules);
const DataSourcesView = defineAsyncComponent(viewModules["data-sources"]);
const AlertsView = defineAsyncComponent(viewModules.alerts);
const ReportsView = defineAsyncComponent(viewModules.reports);
const NotificationsView = defineAsyncComponent(viewModules.notifications);
const CollectorsView = defineAsyncComponent(viewModules.logs);

function preloadFeatureViews() {
  const idle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline), 1200));
  idle(() => {
    void Promise.allSettled(Object.values(viewModules).map((load) => load()));
  });
}

const session = useSessionStore();

const app = useAppController();

const {
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
  loadWorkerStatus,
  restartWorker,
  summary,
  topSummary,
  topSummaryLoading,
  dailyBrief,
  dailyBriefLoading,
  dailyBriefFeedbackLoadingKey,
  overviewEventBusyId,
  dailyReportGenerating,
  dailyReportReady,
  generateDailyBrief,
  setDailyBriefActionFeedback,
  updateOverviewEventStatus,
  convertOverviewEventToTask,
  generateDailyReportFromOverview,
  activeTabLabel,
  alerts,
  loadPeriodInsightReport,
  setReportPeriod,
  pendingAlerts,
  highAlerts,
  updateAlert,
  categories,
  runCategoryCollection,
  createCategory,
  toggleCategory,
  competitorFolders,
  competitors,
  competitorQuery,
  competitorSourceFilter,
  competitorTierFilter,
  watchStates,
  watchStateUpdatingAsin,
  selectedCompetitorKeywordId,
  productActivityCalendar,
  visibleCompetitors,
  selectedCompetitor,
  competitorKpis,
  competitorInsightSuggestion,
  toggleKeyCompetitor,
  setWatchState,
  selectCompetitorFolder,
  openCompetitorDrawer,
  closeCompetitorDrawer,
  openProductActivityCalendar,
  openAmazon,
  keywords,
  selectedKeywordId,
  keywordForm,
  selectedKeyword,
  topSnapshots,
  runCollection,
  createKeyword,
  toggleKeyword,
  updateKeywordPriority,
  deleteKeyword,
  notificationSchedules,
  notificationLogs,
  notificationForm,
  sendingScheduleId,
  createNotification,
  toggleNotification,
  removeNotification,
  sendNotificationNow,
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
  switchMode,
  openActionCenterForEvent,
  openCompetitorInsights
} = app;

onMounted(async () => {
  preloadFeatureViews();
  await session.refreshMe();
  if (session.isAuthenticated) {
    await loadAll();
  }
});
</script>

<template>
  <Toast />
  <div v-if="!session.isAuthenticated" class="auth-screen">
    <AuthModal
      :visible="true"
      :mode="mode"
      :username-input="usernameInput"
      :password-input="passwordInput"
      :auth-error="authError"
      :loading="session.loading"
      @update:username-input="usernameInput = $event"
      @update:password-input="passwordInput = $event"
      @submit="handleAuthSubmit"
      @switch-mode="switchMode"
    />
  </div>

  <div v-else class="shell">
    <button
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航"
      @click="closeSidebar"
    ></button>

    <AppSidebar
      v-model:active-tab="activeTab"
      :is-open="sidebarOpen"
      @close="closeSidebar"
    />

    <main class="main">
      <AppTopbar
        :loading="loading"
        :collecting="collecting"
        :active-tab-label="activeTabLabel"
        :selected-date="date"
        :freshness="freshness"
        :queue-stats="queueStats"
        :worker-status="workerStatus"
        @toggle-sidebar="toggleSidebar"
        @update:selected-date="date = $event"
        @collect="runCollection()"
        @refresh="loadAll"
        @poll-worker-status="loadWorkerStatus"
        @restart-worker="restartWorker"
        @navigate="activeTab = $event"
      />

      <AppViewState
        :loading="activeViewLoading"
        :error="viewErrorMessage"
        :label="activeTabLabel"
        @retry="retryCurrentView"
      >
      <OverviewView
        v-if="activeTab === 'overview'"
        :summary="summary"
        :keywords="keywords"
        :high-alerts="highAlerts"
        :pending-alerts-count="pendingAlerts.length"
        :top-summary="topSummary"
        :top-summary-loading="topSummaryLoading"
        :daily-brief="dailyBrief"
        :daily-brief-loading="dailyBriefLoading"
        :daily-brief-feedback-loading-key="dailyBriefFeedbackLoadingKey"
        :event-busy-id="overviewEventBusyId"
        :daily-report-generating="dailyReportGenerating"
        :daily-report-ready="dailyReportReady"
        @update-alert="updateAlert"
        @select-keyword="handleOverviewSelectKeyword"
        @open-action-center="openActionCenterForEvent"
        @convert-event-to-task="convertOverviewEventToTask"
        @update-event-status="updateOverviewEventStatus"
        @generate-daily-brief="generateDailyBrief"
        @daily-brief-feedback="setDailyBriefActionFeedback"
        @generate-daily-report="generateDailyReportFromOverview"
      />
      <CategoriesView v-if="activeTab === 'categories'" :date="date" :collecting="collecting" @run-category-collection="runCategoryCollection" @toggle-category="toggleCategory" @create-category="createCategory" />
      <KeywordsView v-if="activeTab === 'keywords'" :keywords="keywords" :selected-keyword="selectedKeyword" :selected-keyword-id="selectedKeywordId" :top-snapshots="topSnapshots" :keyword-form="keywordForm" :collecting="collecting" @chart-ready="handleKeywordChartReady" @update:selected-keyword-id="selectedKeywordId = $event" @run-collection="runCollection" @create-keyword="createKeyword" @toggle-keyword="toggleKeyword" @update-keyword-priority="updateKeywordPriority" @delete-keyword="deleteKeyword" />
      <CompetitorsView v-if="activeTab === 'competitors'" :competitor-folders="competitorFolders" :visible-competitors="visibleCompetitors" :total-competitors="competitors.length" :competitor-query="competitorQuery" :competitor-source-filter="competitorSourceFilter" :competitor-tier-filter="competitorTierFilter" :watch-states="watchStates" :watch-state-updating-asin="watchStateUpdatingAsin" :selected-competitor-keyword-id="selectedCompetitorKeywordId" :selected-competitor="selectedCompetitor" :product-activity-calendar="productActivityCalendar" :competitor-kpis="competitorKpis" :competitor-insight-suggestion="competitorInsightSuggestion" @update:competitor-query="competitorQuery = $event" @update:competitor-source-filter="competitorSourceFilter = $event" @update:competitor-tier-filter="competitorTierFilter = $event" @select-competitor-folder="selectCompetitorFolder" @open-competitor-drawer="openCompetitorDrawer" @close-competitor-drawer="closeCompetitorDrawer" @toggle-key-competitor="toggleKeyCompetitor" @set-watch-state="setWatchState" @open-product-activity-calendar="openProductActivityCalendar" @open-amazon="openAmazon" @open-competitor-insights="openCompetitorInsights" />
      <ProductsView v-if="activeTab === 'products'" :date="date" @navigate="activeTab = $event" />
      <InventoryView v-if="activeTab === 'inventory'" :date="date" />
      <ProfitView v-if="activeTab === 'profit'" :date="date" />
      <ListingHealthView v-if="activeTab === 'listing-health'" :date="date" />
      <AdsView v-if="activeTab === 'ads'" :date="date" />
      <ReviewVocView v-if="activeTab === 'review-voc'" :date="date" />
      <ActionCenterPanel v-if="activeTab === 'action-center'" :date="date" />
      <AiAgentsView v-if="activeTab === 'ai-agents'" />
      <TasksView v-if="activeTab === 'tasks'" />
      <PromotionsView v-if="activeTab === 'promotions'" :date="date" />
      <SopsView v-if="activeTab === 'sops'" />
      <RulesView v-if="activeTab === 'rules'" :date="date" />
      <DataSourcesView v-if="activeTab === 'data-sources'" />
      <AlertsView v-if="activeTab === 'alerts'" :alerts="alerts" @update-alert="updateAlert" />
      <ReportsView
        v-if="activeTab === 'reports'"
        :date="date"
        :period="reportPeriod"
        @update:period="setReportPeriod"
        @request-ai-summary="loadPeriodInsightReport(true)"
        @navigate="activeTab = $event"
      />
      <NotificationsView v-if="activeTab === 'notifications'" :notification-schedules="notificationSchedules" :notification-logs="notificationLogs" :notification-form="notificationForm" :sending-schedule-id="sendingScheduleId" @create-notification="createNotification" @toggle-notification="toggleNotification" @remove-notification="removeNotification" @send-notification-now="sendNotificationNow" />
      <CollectorsView v-if="activeTab === 'logs'" :date="date" />
      </AppViewState>
    </main>
  </div>
</template>
