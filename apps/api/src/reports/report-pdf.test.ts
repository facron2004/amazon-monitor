import { describe, expect, it } from "vitest";
import { buildReportPrintHtml } from "./report-pdf.js";

describe("report PDF print HTML", () => {
  it("renders report structure, metadata, tables, and approval boundary", () => {
    const html = buildReportPrintHtml({
      title: "跨境电商运营周报",
      subtitle: "2026-07-11 - 2026-07-17",
      markdown: [
        "# 周报",
        "",
        "## 1. 销售与利润",
        "",
        "- **US**：销售 $1,200",
        "- 人工审批：需要",
        "",
        "| SKU | 毛利率 |",
        "| --- | --- |",
        "| NORTH-1 | 32% |"
      ].join("\n"),
      version: 2,
      coverageStatus: "complete",
      generatedAt: "2026-07-17T00:30:00.000Z",
      generatedByName: "Administrator"
    });

    expect(html).toContain("<h1>跨境电商运营周报</h1>");
    expect(html).toContain("<h2>1. 销售与利润</h2>");
    expect(html).toContain("<strong>US</strong>");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>NORTH-1</td>");
    expect(html).toContain("v2");
    expect(html).toContain("覆盖完整");
    expect(html).toContain("仍需人工确认");
  });

  it("escapes untrusted report content before applying supported inline Markdown", () => {
    const html = buildReportPrintHtml({
      title: "<script>alert(1)</script>",
      subtitle: "Evidence",
      markdown: "## Check\n\n<script>alert('x')</script> and `safe_code`",
      version: 1,
      coverageStatus: "partial",
      generatedAt: "not-a-date",
      generatedByName: null
    });

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;script&gt;alert(&#039;x&#039;)&lt;/script&gt;");
    expect(html).toContain("<code>safe_code</code>");
    expect(html).toContain("部分覆盖");
  });
});
