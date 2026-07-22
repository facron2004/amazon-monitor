import type {
  AiAgentOutput,
  AiRecommendedAction,
  AiReportType,
  AiReportWriterResponse,
  InsightEvent
} from "@amazon-monitor/shared";
import { appendDailyInsightReportMarkdown, collectDailyInsightReportData } from "../reports/insight-report.js";
import { buildPeriodInsightReport, type InsightReportPeriod, type PeriodInsightReport } from "../reports/period-insight-report.js";
import type { Store } from "../store.js";
import { normalizeAiActionPriority, validateAiAgentOutput } from "./ai-agent-policy.js";

const REPORT_WRITER_MODEL = "deterministic-report-writer-v1";

interface ReportWriterInput {
  date: string;
  orgId: number;
  reportType: AiReportType;
}

interface ReportEvidence {
  markdown: string;
  sourceEvents: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  reviewedEvents: InsightEvent[];
  summary: {
    totalEvents: number;
    p0Count: number;
    highScoreCount: number;
    reviewDueCount: number;
    reviewedCount: number;
    topBrand: string | null;
  };
}

export function createReportWithAgent(store: Store, input: ReportWriterInput): AiReportWriterResponse {
  const evidence = collectReportEvidence(store, input);
  const confidence = calculateConfidence(evidence);
  const output = buildReportWriterOutput(input, evidence, confidence);
  const validationErrors = validateAiAgentOutput(output);
  const markdown = buildMarkdown(input, evidence, output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    reportType: input.reportType,
    sourceEventIds: evidence.sourceEvents.slice(0, 20).map((event) => event.id),
    reviewDueCount: evidence.reviewDueEvents.length,
    reviewedCount: evidence.reviewedEvents.length,
    generatedAt: new Date().toISOString()
  });

  if (validationErrors.length > 0) {
    store.createAiRun({
      orgId: input.orgId,
      agentType: "report_writer",
      inputContextJson,
      output: null,
      model: REPORT_WRITER_MODEL,
      status: "failed",
      errorMessage: validationErrors.join("; ")
    });
    throw Object.assign(new Error(`Invalid AI Agent output: ${validationErrors.join("; ")}`), { statusCode: 500 });
  }

  const run = store.createAiRun({
    orgId: input.orgId,
    agentType: "report_writer",
    inputContextJson,
    output,
    model: REPORT_WRITER_MODEL,
    status: "success",
    tokenUsage: null,
    errorMessage: null
  });
  return {
    date: input.date,
    reportType: input.reportType,
    markdown,
    output,
    run,
    sourceEventIds: evidence.sourceEvents.slice(0, 20).map((event) => event.id)
  };
}

function collectReportEvidence(store: Store, input: ReportWriterInput): ReportEvidence {
  if (input.reportType === "daily") {
    const dailyData = collectDailyInsightReportData(store, input.date, input.orgId);
  const baseMarkdown = store.getDailyReport(input.date, undefined, input.orgId);
    const markdown = appendDailyInsightReportMarkdown(baseMarkdown, dailyData);
    const sourceEvents = rankEvents(dailyData.insightEvents);
    return {
      markdown,
      sourceEvents,
      reviewDueEvents: dailyData.reviewDueEvents,
      reviewedEvents: dailyData.reviewedEvents,
      summary: buildEvidenceSummary(sourceEvents, dailyData.reviewDueEvents, dailyData.reviewedEvents)
    };
  }

  const periodReport = buildPeriodInsightReport(store, {
    orgId: input.orgId,
    endDate: input.date,
    period: input.reportType as InsightReportPeriod
  });
  const sourceEvents = rankEvents(periodReport.topEvents);
  return {
    markdown: periodReport.markdown,
    sourceEvents,
    reviewDueEvents: periodReport.reviewDueEvents,
    reviewedEvents: periodReport.reviewedEvents,
    summary: buildPeriodSummary(periodReport)
  };
}

function buildReportWriterOutput(
  input: ReportWriterInput,
  evidence: ReportEvidence,
  confidence: number
): AiAgentOutput {
  return {
    summary: `${input.reportType} report for ${input.date}: ${evidence.summary.totalEvents} insight events, ${evidence.summary.p0Count} P0 signals, ${evidence.summary.reviewDueCount} review-due items.`,
    evidence: buildEvidenceLines(evidence),
    impact: buildImpact(evidence),
    recommended_actions: buildRecommendedActions(evidence, confidence),
    confidence
  };
}

function buildMarkdown(input: ReportWriterInput, evidence: ReportEvidence, output: AiAgentOutput): string {
  return [
    `# ${capitalize(input.reportType)} Operations Report (${input.date})`,
    "",
    "## Report Writer Summary",
    output.summary,
    "",
    "## Evidence",
    ...output.evidence.map((item) => `- ${item}`),
    "",
    "## Impact",
    output.impact,
    "",
    "## Approval-Gated Actions",
    ...output.recommended_actions.map((action, index) => (
      `${index + 1}. [${action.priority}] ${action.action}\n   - Reason: ${action.reason}\n   - Risk: ${action.risk}\n   - Human approval: required`
    )),
    "",
    "## Source Report",
    evidence.markdown.trim() || "No source report markdown was available for this date."
  ].join("\n");
}

function buildEvidenceLines(evidence: ReportEvidence): string[] {
  const lines = [
    `${evidence.summary.totalEvents} insight events; ${evidence.summary.highScoreCount} S/A signals; ${evidence.summary.p0Count} P0 signals.`,
    `${evidence.summary.reviewDueCount} review-due items and ${evidence.summary.reviewedCount} completed reviews in scope.`
  ];
  if (evidence.summary.topBrand) {
    lines.push(`Top brand pressure: ${evidence.summary.topBrand}.`);
  }
  for (const event of evidence.sourceEvents.slice(0, 4)) {
    lines.push(`${event.eventLevel} ${event.eventType}: ${formatSubject(event)} score ${event.scoreTotal}. ${firstEvidence(event)}`);
  }
  return lines;
}

function buildImpact(evidence: ReportEvidence): string {
  if (evidence.summary.p0Count > 0 || evidence.summary.reviewDueCount > 0) {
    return "The report should drive same-day operator review, owner assignment, and follow-up on high-priority competitor or SKU signals.";
  }
  if (evidence.summary.totalEvents > 0) {
    return "The report is useful for monitoring trend direction, but current evidence does not require urgent execution.";
  }
  return "The report mainly documents data gaps; refresh collection or import operational data before making decisions.";
}

function buildRecommendedActions(evidence: ReportEvidence, confidence: number): AiRecommendedAction[] {
  const actions: AiRecommendedAction[] = [];
  const topEvent = evidence.sourceEvents[0];
  if (topEvent) {
    actions.push({
      action: topEvent.suggestedAction || `Review ${formatSubject(topEvent)} before closing the report`,
      priority: normalizeAiActionPriority(topEvent.eventLevel, confidence),
      reason: topEvent.eventSummary || topEvent.eventTitle,
      risk: "Acting on the report without checking the source event can miss stale or noisy evidence.",
      needs_human_approval: true
    });
  }
  if (evidence.summary.reviewDueCount > 0) {
    actions.push({
      action: `Assign owners for ${evidence.summary.reviewDueCount} review-due item${evidence.summary.reviewDueCount === 1 ? "" : "s"}`,
      priority: normalizeAiActionPriority(evidence.summary.p0Count > 0 ? "P1" : "P2", confidence),
      reason: "Review-due items are the handoff point between signal detection and outcome learning.",
      risk: "Skipping review attribution weakens future rule and SOP quality.",
      needs_human_approval: true
    });
  }
  if (actions.length > 0) {
    return actions.slice(0, 5);
  }
  return [{
    action: "Refresh data collection and regenerate the report before assigning execution work",
    priority: normalizeAiActionPriority("P2", confidence),
    reason: "No insight events or review outcomes were available in the current report scope.",
    risk: "A report without fresh evidence can create low-value tasks.",
    needs_human_approval: true
  }];
}

function buildEvidenceSummary(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  reviewedEvents: InsightEvent[]
): ReportEvidence["summary"] {
  return {
    totalEvents: events.length,
    p0Count: events.filter((event) => event.eventLevel === "P0").length,
    highScoreCount: events.filter((event) => event.scoreLevel === "S" || event.scoreLevel === "A").length,
    reviewDueCount: reviewDueEvents.length,
    reviewedCount: reviewedEvents.length,
    topBrand: topBrand(events)
  };
}

function buildPeriodSummary(report: PeriodInsightReport): ReportEvidence["summary"] {
  return {
    totalEvents: report.summary.totalEvents,
    p0Count: report.topEvents.filter((event) => event.eventLevel === "P0").length,
    highScoreCount: report.summary.sLevelCount + report.summary.aLevelCount,
    reviewDueCount: report.summary.reviewDueCount,
    reviewedCount: report.summary.reviewedCount,
    topBrand: report.topBrands[0]?.brand ?? null
  };
}

function calculateConfidence(evidence: ReportEvidence): number {
  let score = 0.35;
  if (evidence.summary.totalEvents > 0) score += 0.25;
  if (evidence.summary.highScoreCount > 0) score += 0.12;
  if (evidence.summary.reviewDueCount > 0 || evidence.summary.reviewedCount > 0) score += 0.1;
  if (evidence.markdown.trim()) score += 0.08;
  return Math.min(0.85, Number(score.toFixed(2)));
}

function rankEvents(events: InsightEvent[]): InsightEvent[] {
  return [...events].sort((left, right) => right.scoreTotal - left.scoreTotal || left.eventTitle.localeCompare(right.eventTitle));
}

function topBrand(events: InsightEvent[]): string | null {
  const counts = new Map<string, number>();
  for (const event of events) {
    const brand = event.brand?.trim();
    if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}


function formatSubject(event: InsightEvent): string {
  return [event.brand, event.asin].filter(Boolean).join(" ") || event.brand || event.asin || "Brand-level event";
}

function firstEvidence(event: InsightEvent): string {
  return event.evidence.evidenceItems[0] ?? event.eventSummary.split("\n")[0] ?? "No evidence summary.";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
