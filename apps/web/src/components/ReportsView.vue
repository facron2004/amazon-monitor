<script setup lang="ts">
import { computed, ref } from "vue";
import { BrainCircuit, CalendarDays, Download, RefreshCw, Sparkles, Target } from "@lucide/vue";
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
import {
  insightEventTypeLabels,
  strategyTagLabels,
  type InsightEvent,
  type StrategyTag
} from "@amazon-monitor/shared";
import type { CategoryReportResponse, DailyReportResponse, InsightReportPeriod, PeriodInsightReportResponse } from "../api-types";
import { downloadDailyReportExcel } from "../api-dashboard";
import { toErrorMessage } from "../utils/error-message";
import ReportChartsPanel from "./reports/ReportChartsPanel.vue";
import ReportReviewOutcomePanel from "./reports/ReportReviewOutcomePanel.vue";
import ReportReviewQueuePanel from "./reports/ReportReviewQueuePanel.vue";

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
const downloadingExcel = ref(false);
const excelDownloadError = ref("");
const periodOptions: Array<{ value: InsightReportPeriod; label: string }> = [
  { value: "weekly", label: "按周" },
  { value: "monthly", label: "按月" }
];
const paneOptions: Array<{ value: ReportPane; label: string }> = [
  { value: "insight", label: "洞察" },
  { value: "ai", label: "AI 摘要" },
  { value: "daily", label: "日报" },
  { value: "category", label: "类目" }
];

const aiSummary = computed(() => props.periodInsightReport?.aiSummary ?? null);
const hasAiSummaryText = computed(() => Boolean(aiSummary.value?.text));
const reportWindow = computed(() => {
  const report = props.periodInsightReport;
  return report ? `${report.startDate} - ${report.endDate}` : props.report?.date ?? "-";
});
const dailyReportDate = computed(() => props.report?.date ?? props.periodInsightReport?.endDate ?? "");
const reportLabel = computed(() => (props.period === "monthly" ? "月度" : "周度"));
const summary = computed(() => props.periodInsightReport?.summary ?? null);
const topEvents = computed(() => props.periodInsightReport?.topEvents.slice(0, 6) ?? []);
const topBrands = computed(() => props.periodInsightReport?.topBrands.slice(0, 8) ?? []);
const maxBrandEvents = computed(() => Math.max(...topBrands.value.map((brand) => brand.eventCount), 1));

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
  if (activePane.value === "ai") {
    return aiSummary.value?.text ?? aiSummary.value?.error ?? "尚未为本报告生成 AI 摘要。";
  }
  if (activePane.value === "daily") {
    return props.report?.markdown ?? "暂无关键词日报。";
  }
  if (activePane.value === "category") {
    return props.categoryReport?.markdown ?? "暂无类目报告。";
  }
  return props.periodInsightReport?.markdown ?? `暂无${props.period === "monthly" ? "月" : "周"}度洞察报告。`;
});

const aiStatus = computed(() => {
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
  emit("requestAiSummary");
  activePane.value = "ai";
}

async function downloadExcel(): Promise<void> {
  if (!dailyReportDate.value) return;
  downloadingExcel.value = true;
  excelDownloadError.value = "";
  try {
    await downloadDailyReportExcel(dailyReportDate.value);
  } catch (error) {
    excelDownloadError.value = toErrorMessage(error);
  } finally {
    downloadingExcel.value = false;
  }
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

function strategyLabel(tag: StrategyTag): string {
  return strategyTagLabels[tag];
}
</script>

<template>
  <section class="reports-view">
    <header class="reports-head">
      <div>
        <span>报告</span>
        <h2>洞察报告工作台</h2>
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
        <ElButton
          :loading="downloadingExcel"
          :disabled="!dailyReportDate"
          @click="downloadExcel"
        >
          <Download :size="15" />
          <span>下载 Excel</span>
        </ElButton>
      </div>
    </header>

    <ElAlert
      v-if="excelDownloadError"
      :title="excelDownloadError"
      type="error"
      show-icon
      @close="excelDownloadError = ''"
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
        <ElCard shadow="never" class="report-card">
          <template #header>
            <div class="panel-title">
              <Target :size="16" />
              <span>优先级</span>
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
                  <strong>{{ event.brand || event.asin || "未知对象" }}</strong>
                </div>
                <p>{{ insightEventTypeLabels[event.eventType] }}</p>
                <ElTooltip :content="event.eventTitle" placement="top" :show-after="350">
                  <small>{{ event.eventTitle }}</small>
                </ElTooltip>
                <ElProgress :percentage="Math.min(event.scoreTotal, 100)" :stroke-width="6" :show-text="false" />
              </div>
            </ElTimelineItem>
          </ElTimeline>
          <ElEmpty v-else description="本期暂无事件证据。" :image-size="72" />
        </ElCard>

        <ElCard shadow="never" class="report-card">
          <template #header>
            <div class="panel-title">
              <Sparkles :size="16" />
              <span>品牌信号榜</span>
            </div>
          </template>

          <ElTable v-if="topBrands.length" :data="topBrands" size="small" class="brand-table" height="286">
            <ElTableColumn prop="brand" label="品牌" min-width="118" show-overflow-tooltip />
            <ElTableColumn label="事件" width="112">
              <template #default="{ row }">
                <div class="brand-events">
                  <strong>{{ row.eventCount }}</strong>
                  <ElProgress :percentage="brandShare(row.eventCount)" :stroke-width="5" :show-text="false" />
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="最高分" width="64">
              <template #default="{ row }">{{ row.topScore }}</template>
            </ElTableColumn>
            <ElTableColumn label="策略标签" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="strategy-tags">
                  <ElTag
                    v-for="tag in row.strategyTags.slice(0, 2)"
                    :key="tag"
                    size="small"
                    effect="plain"
                    round
                  >
                    {{ strategyLabel(tag) }}
                  </ElTag>
                  <ElTag v-if="row.strategyTags.length > 2" size="small" effect="plain" round>
                    +{{ row.strategyTags.length - 2 }}
                  </ElTag>
                  <span v-if="row.strategyTags.length === 0">-</span>
                </div>
              </template>
            </ElTableColumn>
          </ElTable>
          <ElEmpty v-else description="本期暂无品牌信号证据。" :image-size="72" />
        </ElCard>

        <ReportReviewQueuePanel
          :events="periodInsightReport?.reviewDueEvents ?? []"
          :current-date="periodInsightReport?.endDate ?? dailyReportDate"
        />

        <ReportReviewOutcomePanel :events="periodInsightReport?.reviewedEvents ?? []" />
      </aside>

      <main class="report-main">
        <ReportChartsPanel :report="periodInsightReport" :report-label="reportLabel" />

        <ElCard shadow="never" class="report-card report-reader-card">
          <template #header>
            <div class="report-toolbar">
              <ElSegmented v-model="activePane" :options="paneOptions" />
              <ElButton type="primary" :disabled="!periodInsightReport" @click="requestAiSummary">
                <RefreshCw :size="15" />
                <span>{{ hasAiSummaryText ? "刷新 AI" : "生成 AI" }}</span>
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

.reports-head-actions :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 6px;
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

.strategy-tags {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.strategy-tags span {
  color: #94a3b8;
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
  .reports-head-actions :deep(.el-button),
  .reports-head-actions :deep(.el-segmented) {
    justify-content: center;
    width: 100%;
  }
}
</style>
