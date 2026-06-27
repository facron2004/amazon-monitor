<script setup lang="ts">
import { computed, ref } from "vue";
import { BrainCircuit, CalendarDays, FileText, RefreshCw, Sparkles, Target } from "@lucide/vue";
import type { CategoryReportResponse, DailyReportResponse, PeriodInsightReportResponse } from "../api-types";

type ReportPane = "insight" | "ai" | "daily" | "category";

interface Props {
  report: DailyReportResponse | null;
  categoryReport: CategoryReportResponse | null;
  periodInsightReport: PeriodInsightReportResponse | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  requestAiSummary: [];
}>();

const activePane = ref<ReportPane>("insight");

const aiSummary = computed(() => props.periodInsightReport?.aiSummary ?? null);
const hasAiSummaryText = computed(() => Boolean(aiSummary.value?.text));
const reportWindow = computed(() => {
  const report = props.periodInsightReport;
  return report ? `${report.startDate} - ${report.endDate}` : props.report?.date ?? "-";
});

const kpis = computed(() => {
  const summary = props.periodInsightReport?.summary;
  return [
    { label: "Insight events", value: summary?.totalEvents ?? 0 },
    { label: "S / A", value: `${summary?.sLevelCount ?? 0} / ${summary?.aLevelCount ?? 0}` },
    { label: "Core risks", value: summary?.coreRiskCount ?? 0 },
    { label: "Review loop", value: `${summary?.reviewDueCount ?? 0} / ${summary?.reviewedCount ?? 0}` }
  ];
});

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
  return props.periodInsightReport?.markdown ?? "No weekly insight report is available.";
});

const aiStateClass = computed(() => {
  if (aiSummary.value?.status === "generated") return "is-good";
  if (aiSummary.value?.status === "failed") return "is-bad";
  return "is-muted";
});

async function requestAiSummary(): Promise<void> {
  emit("requestAiSummary");
  activePane.value = "ai";
}
</script>

<template>
  <section class="reports-view">
    <header class="reports-head">
      <div>
        <span>Reports</span>
        <h2>Insight report workbench</h2>
      </div>
      <div class="reports-head-meta">
        <CalendarDays :size="16" />
        <strong>{{ reportWindow }}</strong>
      </div>
    </header>

    <section class="report-kpis">
      <article v-for="item in kpis" :key="item.label" class="report-kpi">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section class="report-grid">
      <aside class="report-side">
        <div class="report-side-head">
          <Target :size="16" />
          <span>Top events</span>
        </div>
        <ol v-if="periodInsightReport?.topEvents.length" class="report-event-list">
          <li v-for="event in periodInsightReport.topEvents.slice(0, 5)" :key="event.id">
            <strong>{{ event.brand || event.asin || "Unknown target" }}</strong>
            <span>{{ event.eventType }} · {{ event.scoreTotal }}</span>
          </li>
        </ol>
        <p v-else class="report-empty">No event evidence for this period.</p>

        <div class="report-side-head">
          <Sparkles :size="16" />
          <span>Brand signals</span>
        </div>
        <ol v-if="periodInsightReport?.topBrands.length" class="report-brand-list">
          <li v-for="brand in periodInsightReport.topBrands.slice(0, 5)" :key="brand.brand">
            <strong>{{ brand.brand }}</strong>
            <span>{{ brand.eventCount }} events · top {{ brand.topScore }}</span>
          </li>
        </ol>
        <p v-else class="report-empty">No brand signal evidence for this period.</p>
      </aside>

      <main class="report-main">
        <div class="report-toolbar">
          <div class="report-tabs">
            <button type="button" :class="{ active: activePane === 'insight' }" @click="activePane = 'insight'">
              <FileText :size="15" />
              <span>Insight</span>
            </button>
            <button type="button" :class="{ active: activePane === 'ai' }" @click="activePane = 'ai'">
              <BrainCircuit :size="15" />
              <span>AI summary</span>
            </button>
            <button type="button" :class="{ active: activePane === 'daily' }" @click="activePane = 'daily'">
              <FileText :size="15" />
              <span>Daily</span>
            </button>
            <button type="button" :class="{ active: activePane === 'category' }" @click="activePane = 'category'">
              <FileText :size="15" />
              <span>Category</span>
            </button>
          </div>
          <button class="ai-button" type="button" :disabled="!periodInsightReport" @click="requestAiSummary">
            <RefreshCw :size="15" />
            <span>{{ hasAiSummaryText ? "Refresh AI" : "Generate AI" }}</span>
          </button>
        </div>

        <div class="ai-status" :class="aiStateClass">
          <BrainCircuit :size="15" />
          <span v-if="aiSummary?.status === 'generated'">AI summary generated with {{ aiSummary.model }}</span>
          <span v-else-if="aiSummary?.status === 'failed'">AI summary failed: {{ aiSummary.error }}</span>
          <span v-else-if="aiSummary?.status === 'disabled'">AI summary disabled: {{ aiSummary.error }}</span>
          <span v-else>AI summary has not been requested.</span>
        </div>

        <pre class="report">{{ markdown }}</pre>
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

.reports-head span,
.report-kpi span,
.report-side-head,
.report-event-list span,
.report-brand-list span,
.ai-status {
  color: #64748b;
  font-size: 12px;
}

.reports-head h2 {
  color: #0f172a;
  font-size: 26px;
  line-height: 1.2;
  margin: 3px 0 0;
}

.reports-head-meta {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  display: inline-flex;
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
}

.report-kpis {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.report-kpi,
.report-side,
.report-main {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
}

.report-kpi {
  display: grid;
  gap: 6px;
  min-height: 76px;
  padding: 14px;
}

.report-kpi strong {
  color: #0f172a;
  font-size: 24px;
}

.report-grid {
  display: grid;
  flex: 1 1 auto;
  gap: 14px;
  grid-template-columns: minmax(250px, 320px) minmax(0, 1fr);
  min-height: 0;
}

.report-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 14px;
}

.report-side-head {
  align-items: center;
  display: flex;
  font-weight: 700;
  gap: 7px;
  text-transform: uppercase;
}

.report-event-list,
.report-brand-list {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
}

.report-event-list li,
.report-brand-list li {
  background: #f8fafc;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
}

.report-event-list strong,
.report-brand-list strong {
  color: #0f172a;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-empty {
  color: #64748b;
  font-size: 13px;
  margin: 0 0 8px;
}

.report-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px;
}

.report-toolbar {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  margin-bottom: 10px;
}

.report-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.report-tabs button,
.ai-button {
  align-items: center;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 13px;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
}

.report-tabs button.active,
.ai-button {
  background: #0f172a;
  border-color: #0f172a;
  color: #ffffff;
}

.ai-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.ai-status {
  align-items: center;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  display: inline-flex;
  gap: 7px;
  margin-bottom: 10px;
  min-height: 34px;
  padding: 0 10px;
}

.ai-status.is-good {
  background: #ecfdf5;
  border-color: #bbf7d0;
  color: #047857;
}

.ai-status.is-bad {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.ai-status.is-muted {
  background: #f8fafc;
}

.report {
  flex: 1 1 auto;
  min-height: 420px;
  max-height: none;
}

@media (max-width: 1040px) {
  .report-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .report-grid {
    grid-template-columns: 1fr;
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

  .reports-head-meta,
  .ai-button {
    justify-content: center;
  }

  .report-kpis {
    grid-template-columns: 1fr;
  }
}
</style>
