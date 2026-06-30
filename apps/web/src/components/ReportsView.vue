<script setup lang="ts">
import { computed, ref } from "vue";
import { BrainCircuit, CalendarDays, RefreshCw, Sparkles, Target } from "@lucide/vue";
import {
  ElAlert,
  ElButton,
  ElCard,
  ElCol,
  ElEmpty,
  ElProgress,
  ElRow,
  ElScrollbar,
  ElSegmented,
  ElStatistic,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTimeline,
  ElTimelineItem,
  ElTooltip
} from "element-plus";
import type { CategoryReportResponse, DailyReportResponse, InsightReportPeriod, PeriodInsightReportResponse } from "../api-types";
import type { InsightEvent } from "@amazon-monitor/shared";
import ReportChartsPanel from "./reports/ReportChartsPanel.vue";

type ReportPane = "insight" | "ai" | "daily" | "category";
type SegmentValue = string | number | boolean;

interface Props {
  report: DailyReportResponse | null;
  categoryReport: CategoryReportResponse | null;
  periodInsightReport: PeriodInsightReportResponse | null;
  period: InsightReportPeriod;
}

interface KpiItem {
  label: string;
  value: number;
  detail: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  requestAiSummary: [];
  "update:period": [period: InsightReportPeriod];
}>();

const activePane = ref<ReportPane>("insight");
const periodOptions: Array<{ value: InsightReportPeriod; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }
];
const paneOptions: Array<{ value: ReportPane; label: string }> = [
  { value: "insight", label: "Insight" },
  { value: "ai", label: "AI summary" },
  { value: "daily", label: "Daily" },
  { value: "category", label: "Category" }
];

const aiSummary = computed(() => props.periodInsightReport?.aiSummary ?? null);
const hasAiSummaryText = computed(() => Boolean(aiSummary.value?.text));
const reportWindow = computed(() => {
  const report = props.periodInsightReport;
  return report ? `${report.startDate} - ${report.endDate}` : props.report?.date ?? "-";
});
const reportLabel = computed(() => (props.period === "monthly" ? "Monthly" : "Weekly"));
const summary = computed(() => props.periodInsightReport?.summary ?? null);
const topEvents = computed(() => props.periodInsightReport?.topEvents.slice(0, 6) ?? []);
const topBrands = computed(() => props.periodInsightReport?.topBrands.slice(0, 8) ?? []);
const maxBrandEvents = computed(() => Math.max(...topBrands.value.map((brand) => brand.eventCount), 1));

const kpis = computed<KpiItem[]>(() => [
  {
    label: "Insight events",
    value: summary.value?.totalEvents ?? 0,
    detail: `${reportLabel.value.toLowerCase()} signal volume`
  },
  {
    label: "S / A signals",
    value: summary.value?.sLevelCount ?? 0,
    detail: `${summary.value?.aLevelCount ?? 0} A-level opportunities`
  },
  {
    label: "Core risks",
    value: summary.value?.coreRiskCount ?? 0,
    detail: `${summary.value?.newBreakoutCount ?? 0} breakout events`
  },
  {
    label: "Review loop",
    value: summary.value?.reviewDueCount ?? 0,
    detail: `${summary.value?.reviewedCount ?? 0} reviewed, overdue ${summary.value?.overdueReviewDueCount ?? 0}`
  }
]);

const markdown = computed(() => {
  if (activePane.value === "ai") {
    return aiSummary.value?.text ?? aiSummary.value?.error ?? "AI summary has not been generated for this report.";
  }
  if (activePane.value === "daily") {
    return props.report?.markdown ?? "No daily keyword report is available.";
  }
  if (activePane.value === "category") {
    return props.categoryReport?.markdown ?? "No category report is available.";
  }
  return props.periodInsightReport?.markdown ?? `No ${props.period} insight report is available.`;
});

const aiStatus = computed(() => {
  if (aiSummary.value?.status === "generated") {
    return {
      type: "success" as const,
      title: `AI summary generated with ${aiSummary.value.model}`
    };
  }
  if (aiSummary.value?.status === "failed") {
    return {
      type: "error" as const,
      title: `AI summary failed: ${aiSummary.value.error}`
    };
  }
  if (aiSummary.value?.status === "disabled") {
    return {
      type: "info" as const,
      title: `AI summary disabled: ${aiSummary.value.error}`
    };
  }
  return {
    type: "info" as const,
    title: "AI summary has not been requested."
  };
});

function requestAiSummary(): void {
  emit("requestAiSummary");
  activePane.value = "ai";
}

function selectPeriod(value: SegmentValue): void {
  if (value === "weekly" || value === "monthly") {
    emit("update:period", value);
  }
}

function percentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function levelTagType(event: InsightEvent): "danger" | "warning" | "info" {
  if (event.eventLevel === "P0") return "danger";
  if (event.eventLevel === "P1") return "warning";
  return "info";
}

function brandShare(value: number): number {
  return percentage(value, maxBrandEvents.value);
}
</script>

<template>
  <section class="reports-view">
    <header class="reports-head">
      <div>
        <span>Reports</span>
        <h2>Insight report workbench</h2>
      </div>
      <div class="reports-head-actions">
        <ElSegmented
          :model-value="period"
          :options="periodOptions"
          size="large"
          @update:model-value="selectPeriod"
        />
        <ElTag class="window-tag" effect="plain" round>
          <CalendarDays :size="14" />
          <strong>{{ reportWindow }}</strong>
        </ElTag>
      </div>
    </header>

    <ElRow :gutter="12" class="report-kpis">
      <ElCol v-for="item in kpis" :key="item.label" :xs="24" :sm="12" :lg="6">
        <ElCard class="report-kpi" shadow="never">
          <ElStatistic :title="item.label" :value="item.value" />
          <span>{{ item.detail }}</span>
        </ElCard>
      </ElCol>
    </ElRow>

    <section class="report-grid">
      <aside class="report-side">
        <ElCard shadow="never" class="report-card">
          <template #header>
            <div class="panel-title">
              <Target :size="16" />
              <span>Priority feed</span>
              <ElTag size="small" type="danger" effect="light">{{ topEvents.length }}</ElTag>
            </div>
          </template>

          <ElTimeline v-if="topEvents.length" class="event-timeline">
            <ElTimelineItem
              v-for="event in topEvents"
              :key="event.id"
              :type="levelTagType(event)"
              :timestamp="event.eventDate"
              placement="top"
            >
              <div class="event-feed-item">
                <div>
                  <ElTag size="small" :type="levelTagType(event)" effect="dark">{{ event.eventLevel }}</ElTag>
                  <strong>{{ event.brand || event.asin || "Unknown target" }}</strong>
                </div>
                <p>{{ event.eventType }}</p>
                <ElTooltip :content="event.eventTitle" placement="top" :show-after="350">
                  <small>{{ event.eventTitle }}</small>
                </ElTooltip>
                <ElProgress :percentage="Math.min(event.scoreTotal, 100)" :stroke-width="6" :show-text="false" />
              </div>
            </ElTimelineItem>
          </ElTimeline>
          <ElEmpty v-else description="No event evidence for this period." :image-size="72" />
        </ElCard>

        <ElCard shadow="never" class="report-card">
          <template #header>
            <div class="panel-title">
              <Sparkles :size="16" />
              <span>Brand signal board</span>
            </div>
          </template>

          <ElTable v-if="topBrands.length" :data="topBrands" size="small" class="brand-table" height="286">
            <ElTableColumn prop="brand" label="Brand" min-width="118" show-overflow-tooltip />
            <ElTableColumn label="Events" width="112">
              <template #default="{ row }">
                <div class="brand-events">
                  <strong>{{ row.eventCount }}</strong>
                  <ElProgress :percentage="brandShare(row.eventCount)" :stroke-width="5" :show-text="false" />
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="Top" width="64">
              <template #default="{ row }">{{ row.topScore }}</template>
            </ElTableColumn>
          </ElTable>
          <ElEmpty v-else description="No brand signal evidence for this period." :image-size="72" />
        </ElCard>
      </aside>

      <main class="report-main">
        <ReportChartsPanel :report="periodInsightReport" :report-label="reportLabel" />

        <ElCard shadow="never" class="report-card report-reader-card">
          <template #header>
            <div class="report-toolbar">
              <ElSegmented v-model="activePane" :options="paneOptions" />
              <ElButton type="primary" :disabled="!periodInsightReport" @click="requestAiSummary">
                <RefreshCw :size="15" />
                <span>{{ hasAiSummaryText ? "Refresh AI" : "Generate AI" }}</span>
              </ElButton>
            </div>
          </template>

          <ElAlert
            :title="aiStatus.title"
            :type="aiStatus.type"
            :closable="false"
            show-icon
            class="ai-status"
          >
            <template #icon>
              <BrainCircuit :size="16" />
            </template>
          </ElAlert>

          <ElScrollbar class="report-scroll">
            <pre class="report">{{ markdown }}</pre>
          </ElScrollbar>
        </ElCard>
      </main>
    </section>
  </section>
</template>

<style scoped>
.reports-view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 18px;
}

.reports-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.reports-head > div:first-child > span {
  color: #64748b;
  font-size: 12px;
}

.reports-head h2 {
  color: #0f172a;
  font-size: 26px;
  line-height: 1.2;
  margin: 3px 0 0;
}

.reports-head-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.window-tag {
  align-items: center;
  display: inline-flex;
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
}

.report-kpis {
  row-gap: 12px;
}

.report-kpi {
  height: 100%;
}

.report-kpi :deep(.el-card__body) {
  display: grid;
  gap: 8px;
  min-height: 96px;
}

.report-kpi :deep(.el-statistic__content) {
  color: #0f172a;
  font-size: 27px;
  font-weight: 800;
}

.report-kpi span {
  color: #64748b;
  font-size: 12px;
}

.report-grid {
  display: grid;
  flex: 1 1 auto;
  gap: 14px;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  min-height: 0;
}

.report-side,
.report-main {
  display: grid;
  gap: 14px;
  min-height: 0;
}

.report-main {
  grid-template-rows: auto minmax(0, 1fr);
}

.report-card {
  min-width: 0;
}

.panel-title {
  align-items: center;
  color: #0f172a;
  display: flex;
  font-size: 13px;
  font-weight: 800;
  gap: 8px;
  text-transform: uppercase;
}

.event-timeline {
  margin: 0;
  padding-left: 4px;
}

.event-feed-item {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.event-feed-item > div {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.event-feed-item strong,
.event-feed-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-feed-item p {
  color: #475569;
  font-size: 12px;
  margin: 0;
}

.event-feed-item small {
  color: #64748b;
  display: block;
}

.brand-table {
  width: 100%;
}

.brand-events {
  display: grid;
  gap: 5px;
}

.brand-events strong {
  color: #0f172a;
  font-size: 12px;
}

.report-reader-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.report-reader-card :deep(.el-card__body) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.report-toolbar {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.report-toolbar :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.ai-status {
  margin-bottom: 10px;
}

.report-scroll {
  flex: 1 1 auto;
  min-height: 420px;
}

.report {
  min-height: 420px;
}

@media (max-width: 1040px) {
  .report-grid {
    flex: 0 0 auto;
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .report-side,
  .report-main {
    min-height: auto;
  }

  .report-main {
    grid-template-rows: auto auto;
  }
}

@media (max-width: 720px) {
  .reports-view {
    padding: 12px;
  }

  .reports-head,
  .report-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .reports-head-actions {
    justify-content: stretch;
  }

  .window-tag,
  .reports-head-actions :deep(.el-segmented) {
    justify-content: center;
    width: 100%;
  }

}
</style>
