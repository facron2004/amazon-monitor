import type { PeriodInsightReport } from "./period-insight-report.js";

export type PeriodInsightAiSummaryStatus = "disabled" | "generated" | "failed";

export interface PeriodInsightAiSummary {
  status: PeriodInsightAiSummaryStatus;
  provider: "openai-responses";
  model: string | null;
  text: string | null;
  error: string | null;
  promptVersion: "period-insight-report-v1";
  generatedAt: string | null;
}

interface ResponsesApiPayload {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

const promptVersion = "period-insight-report-v1";

export async function summarizePeriodInsightReport(report: PeriodInsightReport): Promise<PeriodInsightAiSummary> {
  if (process.env.INSIGHT_REPORT_LLM_ENABLED?.trim().toLowerCase() !== "true") {
    return disabledSummary(
      null,
      "External report AI summaries are disabled by default. Set INSIGHT_REPORT_LLM_ENABLED=true only after approving the data-sharing scope."
    );
  }

  const apiKey = process.env.INSIGHT_REPORT_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = process.env.INSIGHT_REPORT_LLM_MODEL;
  if (!apiKey || !model) {
    return disabledSummary(
      model ?? null,
      "Set INSIGHT_REPORT_LLM_API_KEY or OPENAI_API_KEY, plus INSIGHT_REPORT_LLM_MODEL, after enabling external report AI summaries."
    );
  }

  try {
    const response = await fetch(`${llmBaseUrl()}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: "You write concise Amazon category operations summaries from evidence. Do not invent facts."
          },
          {
            role: "user",
            content: buildPrompt(report)
          }
        ],
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(Number(process.env.INSIGHT_REPORT_LLM_TIMEOUT_MS ?? 20_000))
    });
    const payload = await response.json() as ResponsesApiPayload;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `LLM request failed with status ${response.status}`);
    }
    const text = extractOutputText(payload);
    if (!text) {
      throw new Error("LLM response did not contain text output.");
    }
    return {
      status: "generated",
      provider: "openai-responses",
      model,
      text,
      error: null,
      promptVersion,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: "failed",
      provider: "openai-responses",
      model,
      text: null,
      error: error instanceof Error ? error.message : String(error),
      promptVersion,
      generatedAt: null
    };
  }
}

function disabledSummary(model: string | null, error: string): PeriodInsightAiSummary {
  return {
    status: "disabled",
    provider: "openai-responses",
    model,
    text: null,
    error,
    promptVersion,
    generatedAt: null
  };
}

function llmBaseUrl(): string {
  return (process.env.INSIGHT_REPORT_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
}

function buildPrompt(report: PeriodInsightReport): string {
  return [
    `Period: ${report.period}`,
    `Window: ${report.startDate} to ${report.endDate}`,
    `Summary: total=${report.summary.totalEvents}, S=${report.summary.sLevelCount}, A=${report.summary.aLevelCount}, coreRisks=${report.summary.coreRiskCount}, newBreakouts=${report.summary.newBreakoutCount}, reviewDue=${report.summary.reviewDueCount}, overdueReviewDue=${report.summary.overdueReviewDueCount}, reviewed=${report.summary.reviewedCount}, confirmed=${report.summary.confirmedCount}, reverted=${report.summary.revertedCount}`,
    "Top events:",
    ...report.topEvents.slice(0, 8).map((event, index) => `${index + 1}. ${event.brand} ${event.asin} ${event.eventType} score=${event.scoreTotal}; evidence=${event.eventSummary}; action=${event.suggestedAction}`),
    "Top brands:",
    ...report.topBrands.slice(0, 6).map((brand, index) => `${index + 1}. ${brand.brand}: events=${brand.eventCount}, topScore=${brand.topScore}, coreRisks=${brand.coreRiskCount}, action=${brand.suggestedAction}`),
    "",
    "Write 5 bullets: biggest risk, strongest opportunity, brands to watch, review-loop signal, next operational action. Keep each bullet under 28 words."
  ].join("\n");
}

function extractOutputText(payload: ResponsesApiPayload): string | null {
  const directText = payload.output_text?.trim();
  if (directText) {
    return directText;
  }
  const parts = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text?.trim() ?? "")
    .filter((text) => text.length > 0);
  return parts?.length ? parts.join("\n") : null;
}
