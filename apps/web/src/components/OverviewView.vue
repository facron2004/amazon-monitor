<script setup lang="ts">
import { computed } from "vue";
import { BellRing, SearchCheck, ShieldAlert } from "@lucide/vue";
import type {
  AiActionFeedbackValue,
  AiDailyBriefResponse,
  AlertLog,
  DashboardOverviewResponse,
  InsightEvent,
  KeywordMonitor
} from "@amazon-monitor/shared";
import OverviewAlertsPanel from "./OverviewAlertsPanel.vue";
import OverviewKeywordHealthPanel from "./OverviewKeywordHealthPanel.vue";
import OverviewTopActionsPanel from "./OverviewTopActionsPanel.vue";
import OverviewOperationsPanel from "./OverviewOperationsPanel.vue";
import OverviewActivityFeed from "./OverviewActivityFeed.vue";

interface Props {
  keywords: KeywordMonitor[];
  highAlerts: AlertLog[];
  pendingAlertsCount: number;
  topSummary: InsightEvent[];
  topSummaryLoading: boolean;
  dailyBrief: AiDailyBriefResponse | null;
  dailyBriefLoading: boolean;
  dailyBriefFeedbackLoadingKey: string | null;
  summary: DashboardOverviewResponse | null;
  eventBusyId: string | null;
  dailyReportGenerating: boolean;
  dailyReportReady: boolean;
}

interface Emits {
  (e: "update-alert", alert: AlertLog, status: AlertLog["status"]): void;
  (e: "select-keyword", keywordId: number): void;
  (e: "open-action-center", event: InsightEvent): void;
  (e: "convert-event-to-task", event: InsightEvent): void;
  (e: "update-event-status", event: InsightEvent, status: "FOLLOWED" | "IGNORED"): void;
  (e: "generate-daily-brief"): void;
  (e: "daily-brief-feedback", actionIndex: number, value: AiActionFeedbackValue): void;
  (e: "generate-daily-report"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const majorEventCount = computed(() => props.topSummary.filter((event) => event.eventLevel === "P0" || event.eventLevel === "P1").length);

function handleUpdateAlert(alert: AlertLog, status: AlertLog["status"]) {
  emit("update-alert", alert, status);
}

function handleSelectKeyword(keywordId: number) {
  emit("select-keyword", keywordId);
}

function handleOpenActionCenter(event: InsightEvent) {
  emit("open-action-center", event);
}

function handleGenerateDailyBrief() {
  emit("generate-daily-brief");
}

function handleConvertEventToTask(event: InsightEvent) {
  emit("convert-event-to-task", event);
}

function handleUpdateEventStatus(event: InsightEvent, status: "FOLLOWED" | "IGNORED") {
  emit("update-event-status", event, status);
}
</script>

<template>
  <section class="overview-shell">
    <section class="overview-hero panel">
      <div class="overview-hero-copy">
        <span class="overview-kicker">运营总览</span>
        <h1>今日运营态势</h1>
        <p><span aria-hidden="true"></span>实时汇总经营指标、风险与待办动作</p>
      </div>

      <div class="overview-hero-metrics" aria-label="今日运营脉冲">
        <div class="hero-metric">
          <BellRing :size="15" />
          <div>
            <span>关注事件</span>
            <strong>{{ topSummary.length }}</strong>
            <small>优先级事件</small>
          </div>
        </div>
        <div class="hero-metric">
          <ShieldAlert :size="15" />
          <div>
            <span>待处理预警</span>
            <strong>{{ pendingAlertsCount }}</strong>
            <small>需要确认</small>
          </div>
        </div>
        <div class="hero-metric">
          <SearchCheck :size="15" />
          <div>
            <span>监控关键词</span>
            <strong>{{ keywords.length }}</strong>
            <small>持续监控</small>
          </div>
        </div>
      </div>
    </section>

    <OverviewOperationsPanel :summary="summary?.operations ?? null" :major-event-count="majorEventCount" />

    <div class="overview-command-grid">
      <OverviewTopActionsPanel
        :events="topSummary"
        :loading="topSummaryLoading"
        :daily-brief="dailyBrief"
        :daily-brief-loading="dailyBriefLoading"
        :daily-brief-feedback-loading-key="dailyBriefFeedbackLoadingKey"
        :event-busy-id="eventBusyId"
        :daily-report-generating="dailyReportGenerating"
        :daily-report-ready="dailyReportReady"
        @open-asin="handleOpenActionCenter"
        @convert-to-task="handleConvertEventToTask"
        @status="handleUpdateEventStatus"
        @generate-daily-brief="handleGenerateDailyBrief"
        @daily-brief-feedback="(actionIndex, value) => emit('daily-brief-feedback', actionIndex, value)"
        @generate-daily-report="emit('generate-daily-report')"
      />

      <aside class="overview-context-rail" aria-label="运营风险上下文">
        <OverviewAlertsPanel :high-alerts="highAlerts" :pending-alerts-count="pendingAlertsCount" @update-alert="handleUpdateAlert" />
        <OverviewKeywordHealthPanel :keywords="keywords" @select-keyword="handleSelectKeyword" />
      </aside>
    </div>

    <OverviewActivityFeed @open-event="handleOpenActionCenter" />
  </section>
</template>
