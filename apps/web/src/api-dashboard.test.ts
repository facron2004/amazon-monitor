import { describe, expect, it } from "vitest";
import {
  buildDailyReportExcelUrl,
  buildDailyReportMarkdownUrl,
  buildPeriodInsightReportQuery
} from "./api-reports";

describe("buildPeriodInsightReportQuery", () => {
  it("passes the selected insight report period through to the API query", () => {
    const query = buildPeriodInsightReportQuery({
      date: "2026-06-30",
      period: "monthly",
      includeAiSummary: true
    });

    expect(query.get("endDate")).toBe("2026-06-30");
    expect(query.get("period")).toBe("monthly");
    expect(query.get("includeAiSummary")).toBe("true");
  });

  it("builds a daily Excel download URL from the active API base", () => {
    expect(buildDailyReportExcelUrl("2026-06-30")).toBe("/api/reports/daily.xlsx?date=2026-06-30");
    expect(buildDailyReportExcelUrl("2026-06-30", "https://monitor.example.com/api/")).toBe(
      "https://monitor.example.com/api/reports/daily.xlsx?date=2026-06-30"
    );
    expect(buildDailyReportMarkdownUrl("2026-06-30")).toBe("/api/reports/daily.md?date=2026-06-30");
  });
});
