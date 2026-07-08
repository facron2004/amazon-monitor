import { describe, expect, it } from "vitest";
import { attributionTagLabels, insightReviewResultLabels, type InsightEvent } from "@amazon-monitor/shared";
import { buildDailyInsightSheets, buildInsightHtmlSections, buildInsightTextSections, type DailyInsightReportData } from "./insight-report.js";

describe("daily insight report attribution labels", () => {
  it("renders insufficient attribution evidence as the shared no-clear-driver label", () => {
    const event = makeInsightEvent({
      attributionTags: [],
      reviewDueDate: "2026-06-30"
    });
    const data: DailyInsightReportData = {
      insightEvents: [event],
      reviewDueEvents: [event],
      reviewedEvents: []
    };

    expect(buildInsightTextSections(data).join("\n")).toContain(attributionTagLabels.NO_CLEAR_DRIVER);

    const sheets = buildDailyInsightSheets(data);
    const insightSheet = sheets.find((sheet) => sheet.name === "Insight Events");
    const reviewSheet = sheets.find((sheet) => sheet.name === "Review Queue");
    expect(insightSheet?.rows.flat()).toContain(attributionTagLabels.NO_CLEAR_DRIVER);
    expect(reviewSheet?.rows.flat()).toContain(attributionTagLabels.NO_CLEAR_DRIVER);
  });
});

describe("daily insight report action sections", () => {
  it("promotes P0 events to must-see and P1 events to high-priority sections", () => {
    const p0Event = makeInsightEvent({
      id: "p0-b",
      asin: "B0P0TEST",
      brand: "P0 Brand",
      eventLevel: "P0",
      scoreLevel: "B",
      scoreTotal: 67
    });
    const p1Event = makeInsightEvent({
      id: "p1-b",
      asin: "B0P1TEST",
      brand: "P1 Brand",
      eventLevel: "P1",
      scoreLevel: "B",
      scoreTotal: 58
    });
    const data: DailyInsightReportData = {
      insightEvents: [p1Event, p0Event],
      reviewDueEvents: [],
      reviewedEvents: []
    };

    const text = buildInsightTextSections(data).join("\n");
    const mustSeeSection = sectionBetween(text, "## 今日必须看", "## 今日高优先级机会");
    const highPrioritySection = sectionBetween(text, "## 今日高优先级机会", "## 今日核心竞品风险");

    expect(mustSeeSection).toContain("B0P0TEST");
    expect(mustSeeSection).not.toContain("B0P1TEST");
    expect(highPrioritySection).toContain("B0P1TEST");

    const html = buildInsightHtmlSections(data);
    expect(html).toContain("今日高优先级机会");
    expect(html).toContain("今日核心竞品风险");
    expect(html).toContain("今日待复盘事项");
  });

  it("treats inferred core competitors as core-risk report items", () => {
    const event = makeInsightEvent({
      id: "core-risk",
      asin: "B0CORETEST",
      brand: "Core Brand",
      eventType: "RANK_SURGE",
      eventLevel: "P2",
      scoreLevel: "C",
      scoreTotal: 44,
      evidence: {
        ...makeInsightEvent().evidence,
        currentRank: 35,
        isCoreCompetitor: true
      }
    });
    const text = buildInsightTextSections({
      insightEvents: [event],
      reviewDueEvents: [],
      reviewedEvents: []
    }).join("\n");
    const coreRiskSection = sectionBetween(text, "## 今日核心竞品风险", "## 今日待复盘事项");

    expect(coreRiskSection).toContain("B0CORETEST");
  });

  it("includes P1-only events in the action checklist sheet", () => {
    const event = makeInsightEvent({
      id: "p1-action",
      asin: "B0P1ACTION",
      eventLevel: "P1",
      scoreLevel: "B",
      scoreTotal: 53
    });
    const sheets = buildDailyInsightSheets({
      insightEvents: [event],
      reviewDueEvents: [],
      reviewedEvents: []
    });
    const actionSheet = sheets.find((sheet) => sheet.name === "Action Checklist");

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "Action Checklist",
      "Insight Events",
      "Review Queue",
      "Review Outcomes",
      "Brand Strategy Tags"
    ]);
    expect(actionSheet?.rows.flat()).toContain("高优先级");
    expect(actionSheet?.rows.flat()).toContain("B0P1ACTION");
  });

  it("exports reviewed events to a dedicated review outcomes sheet", () => {
    const reviewed = makeInsightEvent({
      id: "reviewed-action",
      asin: "B0REVIEWED",
      brand: "Review Brand",
      status: "REVIEWED",
      reviewResult: "CONFIRMED",
      userNote: "Ranking held after the 3-day review.",
      updatedAt: "2026-06-30T09:30:00.000Z",
      reviewDueDate: "2026-07-07"
    });
    const sheets = buildDailyInsightSheets({
      insightEvents: [],
      reviewDueEvents: [],
      reviewedEvents: [reviewed]
    });
    const reviewOutcomeSheet = sheets.find((sheet) => sheet.name === "Review Outcomes");

    expect(reviewOutcomeSheet?.rows[0]).toEqual([
      "Reviewed Date",
      "Event Date",
      "Result",
      "Status",
      "Level",
      "Score",
      "Score Level",
      "Type",
      "ASIN",
      "Brand",
      "Title",
      "Evidence",
      "Review Due",
      "Review Note",
      "Suggested Action",
      "Attribution Tags",
      "Strategy Tags",
      "Product URL"
    ]);
    expect(reviewOutcomeSheet?.rows.flat()).toContain("B0REVIEWED");
    expect(reviewOutcomeSheet?.rows.flat()).toContain(insightReviewResultLabels.CONFIRMED);
    expect(reviewOutcomeSheet?.rows.flat()).toContain("Ranking held after the 3-day review.");
    expect(reviewOutcomeSheet?.rows.flat()).toContain("2026-06-30");
  });
});

function sectionBetween(text: string, startHeading: string, endHeading: string): string {
  const start = text.indexOf(startHeading);
  const end = text.indexOf(endHeading);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

function makeInsightEvent(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: "event-1",
    eventDate: "2026-06-30",
    asin: "B000TEST",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "RANK_SURGE",
    eventLevel: "P0",
    eventTitle: "Acme B000TEST rank surge",
    eventSummary: "Evidence-backed event summary.",
    attributionTags: ["NO_CLEAR_DRIVER"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      productUrl: "https://www.amazon.com/dp/B000TEST",
      imageUrl: null,
      title: "Acme test product",
      currentRank: 12,
      previousRank: 30,
      rankChange: 18,
      priceBefore: null,
      priceAfter: null,
      priceChangeRate: null,
      reviewCountBefore: null,
      reviewCountAfter: null,
      reviewCountChange: null,
      couponBefore: null,
      couponAfter: null,
      dealType: null,
      brandRisingCount: null,
      brandNewEntryCount: null,
      brandTop100Count: null,
      priceLowWindow: null,
      isCoreCompetitor: false,
      strategyTags: [],
      evidenceItems: ["BSR #30 -> #12"]
    },
    scoreTotal: 90,
    scoreLevel: "S",
    scoreBreakdown: {
      rankingScore: 30,
      productScore: 20,
      promoScore: 10,
      brandScore: 20,
      riskScore: 10,
      reasons: ["fixture"]
    },
    suggestedAction: "Review the evidence before action.",
    status: "REVIEW_PENDING",
    assignee: "Alice",
    reviewDueDate: null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-30T08:00:00.000Z",
    updatedAt: "2026-06-30T08:00:00.000Z",
    ...overrides
  };
}
