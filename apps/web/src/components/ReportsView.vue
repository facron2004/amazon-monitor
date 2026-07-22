<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  ElAlert,
  ElCard,
  ElCol,
  ElRow,
  ElStatistic
} from "element-plus";
import {
  workflowReportPeriodLabels,
  type AiReportWriterResponse
} from "@amazon-monitor/shared";
import type { InsightReportPeriod } from "../api-types";
import { aiApi } from "../api-ai";
import {
  downloadDailyReportExcel,
  downloadDailyReportMarkdown,
  downloadDailyReportPdf,
  downloadPeriodReportMarkdown,
  downloadPeriodReportPdf
} from "../api-reports";
import { useReportsStore } from "../stores/reports";
import { toErrorMessage } from "../utils/error-message";
import DailyReportArchivePanel from "./reports/DailyReportArchivePanel.vue";
import DailyReportReadinessPanel from "./reports/DailyReportReadinessPanel.vue";
import PeriodReportArchivePanel from "./reports/PeriodReportArchivePanel.vue";
import ReportChartsPanel from "./reports/ReportChartsPanel.vue";
import ReportReviewOutcomePanel from "./reports/ReportReviewOutcomePanel.vue";
import ReportReviewQueuePanel from "./reports/ReportReviewQueuePanel.vue";
import ReportReaderCard from "./reports/ReportReaderCard.vue";
import ReportSignalSidebar from "./reports/ReportSignalSidebar.vue";
import ReportWorkspaceHeader from "./reports/ReportWorkspaceHeader.vue";
import { useWriteAccess } from "../composables/useWriteAccess";
import ReadOnlyNotice from "./ReadOnlyNotice.vue";

type ReportPane = "periodArchive" | "archive" | "insight" | "writer" | "ai" | "daily" | "category";
interface Props {
  date: string;
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
  navigate: [target: "data-sources" | "logs"];
}>();

const reportsStore = useReportsStore();
const { canWrite } = useWriteAccess("manage_reports");
const {
  dailyReport: report,
  categoryReport,
  periodInsightReport,
  periodArchive,
  periodHistory,
  periodHistoryTotal,
  archive,
  history,
  historyTotal,
  generating,
  periodGenerating,
  selectingArchive,
  selectingPeriodArchive
} = storeToRefs(reportsStore);

const activePane = ref<ReportPane>("periodArchive");
const dailyExporting = ref(false);
const periodExporting = ref(false);
const exportError = ref("");
const archiveError = ref("");
const reportWriter = ref<AiReportWriterResponse | null>(null);
const reportWriterLoading = ref(false);
const reportWriterError = ref("");
const paneOptions: Array<{ value: ReportPane; label: string }> = [
  { value: "periodArchive", label: "周期归档" },
  { value: "archive", label: "归档日报" },
  { value: "writer", label: "Report Writer" },
  { value: "insight", label: "洞察" },
  { value: "ai", label: "AI 摘要" },
  { value: "daily", label: "日报" },
  { value: "category", label: "类目" }
];
const paneKeys = new Set<ReportPane>(paneOptions.map((option) => option.value));

const aiSummary = computed(() => periodInsightReport.value?.aiSummary ?? null);
const hasAiSummaryText = computed(() => Boolean(aiSummary.value?.text));
const reportWindow = computed(() => {
  if (activePane.value === "periodArchive" && periodArchive.value) {
    return `${periodArchive.value.startDate} - ${periodArchive.value.endDate}`;
  }
  const periodReport = periodInsightReport.value;
  return periodReport ? `${periodReport.startDate} - ${periodReport.endDate}` : report.value?.date ?? props.date;
});
const dailyReportDate = computed(() => props.date || report.value?.date || periodInsightReport.value?.endDate || "");
const reportLabel = computed(() => (props.period === "monthly" ? "月度" : "周度"));
const summary = computed(() => periodInsightReport.value?.summary ?? null);

const kpis = computed<KpiItem[]>(() => [
  {
    label: "洞察事件",
    value: summary.value?.totalEvents ?? 0,
    detail: `${reportLabel.value}信号量`
  },
  {
    label: "S/A 级信号",
    value: summary.value?.sLevelCount ?? 0,
    detail: `${summary.value?.aLevelCount ?? 0} 个 A 级机会`
  },
  {
    label: "核心风险",
    value: summary.value?.coreRiskCount ?? 0,
    detail: `${summary.value?.newBreakoutCount ?? 0} 个突破事件`
  },
  {
    label: "待复盘",
    value: summary.value?.reviewDueCount ?? 0,
    detail: `已复盘 ${summary.value?.reviewedCount ?? 0}，逾期 ${summary.value?.overdueReviewDueCount ?? 0}`
  }
]);

const markdown = computed(() => {
  if (activePane.value === "periodArchive") {
    return periodArchive.value?.markdown
      ?? `尚未生成该窗口的${workflowReportPeriodLabels[props.period]}。`;
  }
  if (activePane.value === "archive") {
    return archive.value?.markdown ?? "尚未生成该日期的归档日报。请点击“生成日报”保存一份可追溯版本。";
  }
  if (activePane.value === "writer") {
    return reportWriter.value?.markdown ?? (reportWriterError.value || "Run Report Writer to create an approval-gated operations report.");
  }
  if (activePane.value === "ai") {
    return aiSummary.value?.text ?? aiSummary.value?.error ?? "尚未为本报告生成 AI 摘要。";
  }
  if (activePane.value === "daily") {
    return report.value?.markdown ?? "暂无关键词日报。";
  }
  if (activePane.value === "category") {
    return categoryReport.value?.markdown ?? "暂无类目报告。";
  }
  return periodInsightReport.value?.markdown ?? `暂无${props.period === "monthly" ? "月" : "周"}度洞察报告。`;
});

const showAiStatus = computed(() => activePane.value === "writer" || activePane.value === "ai");

const aiStatus = computed(() => {
  if (activePane.value === "writer") {
    if (reportWriter.value) {
      return {
        type: "success" as const,
        title: `Report Writer generated (${reportWriter.value.run.model})`
      };
    }
    if (reportWriterError.value) {
      return {
        type: "error" as const,
        title: `Report Writer failed: ${reportWriterError.value}`
      };
    }
    return {
      type: "info" as const,
      title: "Report Writer has not generated a report for this window."
    };
  }
  if (aiSummary.value?.status === "generated") {
    return {
      type: "success" as const,
      title: `AI 摘要已生成（${aiSummary.value.model}）`
    };
  }
  if (aiSummary.value?.status === "failed") {
    return {
      type: "error" as const,
      title: `AI 摘要生成失败：${aiSummary.value.error}`
    };
  }
  if (aiSummary.value?.status === "disabled") {
    return {
      type: "info" as const,
      title: `AI 摘要已禁用：${aiSummary.value.error}`
    };
  }
  return {
    type: "info" as const,
    title: "尚未请求 AI 摘要。"
  };
});

function requestAiSummary(): void {
  if (!canWrite.value) return;
  emit("requestAiSummary");
  activePane.value = "ai";
}

async function requestReportWriter(): Promise<void> {
  if (!canWrite.value) return;
  if (!dailyReportDate.value) return;
  reportWriterLoading.value = true;
  reportWriterError.value = "";
  activePane.value = "writer";
  try {
    reportWriter.value = await aiApi.createReport(dailyReportDate.value, props.period);
  } catch (error) {
    reportWriter.value = null;
    reportWriterError.value = toErrorMessage(error);
  } finally {
    reportWriterLoading.value = false;
  }
}

async function generateDailyArchive(): Promise<void> {
  if (!canWrite.value) return;
  if (!dailyReportDate.value) return;
  archiveError.value = "";
  try {
    await reportsStore.generateDaily(dailyReportDate.value);
    activePane.value = "archive";
  } catch (error) {
    archiveError.value = toErrorMessage(error);
  }
}

async function generatePeriodArchive(): Promise<void> {
  if (!canWrite.value || !dailyReportDate.value) return;
  archiveError.value = "";
  try {
    await reportsStore.generatePeriod(dailyReportDate.value, props.period);
    activePane.value = "periodArchive";
  } catch (error) {
    archiveError.value = toErrorMessage(error);
  }
}

async function selectArchivedReport(date: string): Promise<void> {
  archiveError.value = "";
  try {
    await reportsStore.selectArchive(date);
    activePane.value = "archive";
  } catch (error) {
    archiveError.value = toErrorMessage(error);
  }
}

async function selectPeriodReport(endDate: string): Promise<void> {
  archiveError.value = "";
  try {
    await reportsStore.selectPeriodArchive(endDate, props.period);
    activePane.value = "periodArchive";
  } catch (error) {
    archiveError.value = toErrorMessage(error);
  }
}

async function exportPeriod(format: "markdown" | "pdf"): Promise<void> {
  if (!periodArchive.value) return;
  periodExporting.value = true;
  exportError.value = "";
  try {
    const download = format === "pdf" ? downloadPeriodReportPdf : downloadPeriodReportMarkdown;
    await download(periodArchive.value.endDate, periodArchive.value.period);
  } catch (error) {
    exportError.value = toErrorMessage(error);
  } finally {
    periodExporting.value = false;
  }
}

async function exportDaily(format: "markdown" | "pdf" | "excel"): Promise<void> {
  const date = archive.value?.reportDate ?? dailyReportDate.value;
  if (!date) return;
  dailyExporting.value = true;
  exportError.value = "";
  try {
    if (format === "pdf") await downloadDailyReportPdf(date);
    else if (format === "markdown") await downloadDailyReportMarkdown(date);
    else await downloadDailyReportExcel(date);
  } catch (error) {
    exportError.value = toErrorMessage(error);
  } finally {
    dailyExporting.value = false;
  }
}

function selectPane(value: string): void {
  if (paneKeys.has(value as ReportPane)) {
    activePane.value = value as ReportPane;
  }
}

</script>

<template>
  <section class="reports-view">
    <ReportWorkspaceHeader
      :period="period"
      :report-window="reportWindow"
      :can-write="canWrite"
      :date-available="Boolean(dailyReportDate)"
      :period-archive-current="periodArchive?.endDate === dailyReportDate"
      :daily-archive-current="archive?.reportDate === dailyReportDate"
      :period-archive-available="Boolean(periodArchive)"
      :daily-archive-available="Boolean(archive)"
      :period-generating="periodGenerating"
      :daily-generating="generating"
      :period-exporting="periodExporting"
      :daily-exporting="dailyExporting"
      @update:period="emit('update:period', $event)"
      @generate-period="generatePeriodArchive"
      @export-period="exportPeriod"
      @generate-daily="generateDailyArchive"
      @export-daily="exportDaily"
    />

    <ReadOnlyNotice v-if="!canWrite" />

    <ElAlert
      v-if="archiveError || exportError"
      :title="archiveError || exportError"
      type="error"
      show-icon
      @close="archiveError = ''; exportError = ''"
    />

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
        <PeriodReportArchivePanel
          :period="period"
          :history="periodHistory"
          :history-total="periodHistoryTotal"
          :active-report="periodArchive"
          :loading="selectingPeriodArchive"
          @select="selectPeriodReport"
        />

        <DailyReportArchivePanel
          :history="history"
          :history-total="historyTotal"
          :active-report="archive"
          :loading="selectingArchive"
          @select="selectArchivedReport"
        />

        <DailyReportReadinessPanel @navigate="emit('navigate', $event)" />

        <ReportSignalSidebar :report="periodInsightReport" />

        <ReportReviewQueuePanel
          :events="periodInsightReport?.reviewDueEvents ?? []"
          :current-date="periodInsightReport?.endDate ?? dailyReportDate"
        />

        <ReportReviewOutcomePanel :events="periodInsightReport?.reviewedEvents ?? []" />
      </aside>

      <main class="report-main">
        <ReportChartsPanel :report="periodInsightReport" :report-label="reportLabel" />

        <ReportReaderCard
          :model-value="activePane"
          :options="paneOptions"
          :markdown="markdown"
          :show-ai-status="showAiStatus"
          :ai-status="aiStatus"
          :report-writer-loading="reportWriterLoading"
          :report-writer-disabled="!canWrite || !dailyReportDate"
          :ai-disabled="!canWrite || !periodInsightReport"
          :has-ai-summary="hasAiSummaryText"
          @update:model-value="selectPane"
          @request-report-writer="requestReportWriter"
          @request-ai-summary="requestAiSummary"
        />
      </main>
    </section>
  </section>
</template>

<style scoped src="../styles/reports.css"></style>
