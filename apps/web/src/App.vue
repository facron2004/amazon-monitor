<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import Toast from "./components/Toast.vue";
import AuthModal from "./components/AuthModal.vue";
import AppSidebar from "./components/AppSidebar.vue";
import AppTopbar from "./components/AppTopbar.vue";
import OverviewChangesStrip from "./components/OverviewChangesStrip.vue";
import { useAppController } from "./composables/useAppController";

const OverviewView = defineAsyncComponent(() => import("./components/OverviewView.vue"));
const CategoriesView = defineAsyncComponent(() => import("./components/CategoriesView.vue"));
const KeywordsView = defineAsyncComponent(() => import("./components/KeywordsView.vue"));
const CompetitorsView = defineAsyncComponent(() => import("./components/CompetitorsView.vue"));
const ActionCenterPanel = defineAsyncComponent(() => import("./components/ActionCenterPanel.vue"));
const AlertsView = defineAsyncComponent(() => import("./components/AlertsView.vue"));
const ReportsView = defineAsyncComponent(() => import("./components/ReportsView.vue"));
const NotificationsView = defineAsyncComponent(() => import("./components/NotificationsView.vue"));
const LogsView = defineAsyncComponent(() => import("./components/LogsView.vue"));
const {
  activeTab,
  sidebarOpen,
  date,
  reportPeriod,
  loading,
  collecting,
  freshness,
  queueStats,
  workerStatus,
  topSummary,
  topSummaryLoading,
  actionMessage,
  errorMessage,
  activeTabLabel,
  alerts,
  changes,
  logs,
  collectJobs,
  report,
  categoryReport,
  periodInsightReport,
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
  selectedCompetitorKeywordId,
  productActivityCalendar,
  visibleCompetitors,
  selectedCompetitor,
  competitorKpis,
  competitorInsightSuggestion,
  toggleKeyCompetitor,
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
  toggleSidebar,
  closeSidebar,
  handleOverviewSelectKeyword,
  handleKeywordChartReady,
  showAuthModal,
  passwordInput,
  authError,
  handleAuthSubmit,
  openActionCenterForEvent
} = useAppController();
</script>

<template>
  <Toast />
  <div class="shell">
    <button
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航"
      @click="closeSidebar"
    ></button>

    <AppSidebar
      v-model:active-tab="activeTab"
      v-model:date="date"
      :is-open="sidebarOpen"
      :loading="loading"
      @close="closeSidebar"
      @collect="runCollection()"
      @refresh="loadAll"
    />

    <main class="main">
      <AppTopbar
        :loading="loading"
        :active-tab-label="activeTabLabel"
        :selected-date="date"
        :freshness="freshness"
        :queue-stats="queueStats"
        :worker-status="workerStatus"
        @toggle-sidebar="toggleSidebar"
      />

      <OverviewView
        v-if="activeTab === 'overview'"
        :keywords="keywords"
        :high-alerts="highAlerts"
        :pending-alerts-count="pendingAlerts.length"
        :top-summary="topSummary"
        :top-summary-loading="topSummaryLoading"
        @update-alert="updateAlert"
        @select-keyword="handleOverviewSelectKeyword"
        @open-action-center="openActionCenterForEvent"
      />

      <CategoriesView
        v-if="activeTab === 'categories'"
        :date="date"
        :collecting="collecting"
        @run-category-collection="runCategoryCollection"
        @toggle-category="toggleCategory"
        @create-category="createCategory"
      />

      <KeywordsView
        v-if="activeTab === 'keywords'"
        :keywords="keywords"
        :selected-keyword="selectedKeyword"
        :selected-keyword-id="selectedKeywordId"
        :top-snapshots="topSnapshots"
        :keyword-form="keywordForm"
        :collecting="collecting"
        @chart-ready="handleKeywordChartReady"
        @update:selected-keyword-id="selectedKeywordId = $event"
        @run-collection="runCollection"
        @create-keyword="createKeyword"
        @toggle-keyword="toggleKeyword"
        @delete-keyword="deleteKeyword"
      />

      <CompetitorsView
        v-if="activeTab === 'competitors'"
        :competitor-folders="competitorFolders"
        :visible-competitors="visibleCompetitors"
        :total-competitors="competitors.length"
        :competitor-query="competitorQuery"
        :competitor-source-filter="competitorSourceFilter"
        :competitor-tier-filter="competitorTierFilter"
        :selected-competitor-keyword-id="selectedCompetitorKeywordId"
        :selected-competitor="selectedCompetitor"
        :product-activity-calendar="productActivityCalendar"
        :competitor-kpis="competitorKpis"
        :competitor-insight-suggestion="competitorInsightSuggestion"
        @update:competitor-query="competitorQuery = $event"
        @update:competitor-source-filter="competitorSourceFilter = $event"
        @update:competitor-tier-filter="competitorTierFilter = $event"
        @select-competitor-folder="selectCompetitorFolder"
        @open-competitor-drawer="openCompetitorDrawer"
        @close-competitor-drawer="closeCompetitorDrawer"
        @toggle-key-competitor="toggleKeyCompetitor"
        @open-product-activity-calendar="openProductActivityCalendar"
        @open-amazon="openAmazon"
      />

      <ActionCenterPanel v-if="activeTab === 'action-center'" :date="date" />

      <AlertsView v-if="activeTab === 'alerts'" :alerts="alerts" @update-alert="updateAlert" />

      <ReportsView
        v-if="activeTab === 'reports'"
        :report="report"
        :category-report="categoryReport"
        :period-insight-report="periodInsightReport"
        :period="reportPeriod"
        @update:period="setReportPeriod"
        @request-ai-summary="loadPeriodInsightReport(true)"
      />

      <NotificationsView
        v-if="activeTab === 'notifications'"
        :notification-schedules="notificationSchedules"
        :notification-logs="notificationLogs"
        :notification-form="notificationForm"
        :sending-schedule-id="sendingScheduleId"
        @create-notification="createNotification"
        @toggle-notification="toggleNotification"
        @remove-notification="removeNotification"
        @send-notification-now="sendNotificationNow"
      />

      <LogsView v-if="activeTab === 'logs'" :logs="logs" :jobs="collectJobs" />

      <OverviewChangesStrip v-if="activeTab === 'overview'" :changes="changes" />
    </main>
  </div>

  <AuthModal
    :visible="showAuthModal"
    :password-input="passwordInput"
    :auth-error="authError"
    @update:password-input="passwordInput = $event"
    @submit="handleAuthSubmit"
  />
</template>
