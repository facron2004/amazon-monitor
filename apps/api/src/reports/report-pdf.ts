import { chromium } from "playwright";

export interface ReportPdfInput {
  title: string;
  subtitle: string;
  markdown: string;
  version: number;
  coverageStatus: string;
  generatedAt: string;
  generatedByName: string | null;
}

export type ReportPdfRenderer = (input: ReportPdfInput) => Promise<Buffer>;

export const renderReportPdf: ReportPdfRenderer = async (input) => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(buildReportPrintHtml(input), { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="box-sizing:border-box;color:#98a2b3;font-family:Arial,sans-serif;font-size:8px;padding:0 14mm;text-align:center;width:100%;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
      margin: {
        top: "14mm",
        right: "14mm",
        bottom: "16mm",
        left: "14mm"
      }
    });
  } finally {
    await browser.close();
  }
};

export function buildReportPrintHtml(input: ReportPdfInput): string {
  const coverageLabel = coverageStatusLabel(input.coverageStatus);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { size: A4; }
    * { box-sizing: border-box; }
    html { color: #172033; font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif; font-size: 10.5px; }
    body { margin: 0; }
    .cover { border-bottom: 1px solid #dfe3ea; margin-bottom: 18px; padding: 4px 0 14px; }
    .brand { align-items: center; display: flex; gap: 10px; margin-bottom: 16px; }
    .brand-mark { align-items: center; background: #101828; border-radius: 6px; color: #fff; display: inline-flex; font-size: 15px; font-weight: 700; height: 34px; justify-content: center; width: 34px; }
    .brand-name { color: #344054; font-size: 12px; font-weight: 700; }
    h1 { font-size: 25px; line-height: 1.25; margin: 0 0 6px; }
    .subtitle { color: #667085; font-size: 12px; margin: 0 0 12px; }
    .meta { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .meta-item { background: #f7f8fa; border: 1px solid #eaecf0; border-radius: 5px; padding: 9px 10px; }
    .meta-item span { color: #667085; display: block; font-size: 9px; margin-bottom: 3px; }
    .meta-item strong { color: #344054; font-size: 10px; font-weight: 650; }
    .report h1 { font-size: 21px; margin: 0 0 10px; }
    .report h2 { border-bottom: 1px solid #eaecf0; break-after: avoid; color: #172033; font-size: 15px; margin: 18px 0 7px; padding-bottom: 5px; }
    .report h3 { break-after: avoid; color: #344054; font-size: 13px; margin: 14px 0 6px; }
    .report p { line-height: 1.65; margin: 5px 0; orphans: 3; widows: 3; }
    .report ul, .report ol { margin: 5px 0 8px; padding-left: 22px; }
    .report li { break-inside: avoid; line-height: 1.55; margin: 3px 0; }
    .report blockquote { background: #f7f8fa; border-left: 3px solid #3b82f6; color: #475467; margin: 10px 0; padding: 8px 12px; }
    .report code { background: #f2f4f7; border-radius: 3px; color: #344054; font-family: Consolas, monospace; font-size: 9px; padding: 1px 4px; }
    .report pre { background: #101828; border-radius: 5px; color: #f8fafc; line-height: 1.55; overflow-wrap: anywhere; padding: 12px; white-space: pre-wrap; }
    .report pre code { background: transparent; color: inherit; padding: 0; }
    .report table { border-collapse: collapse; font-size: 9px; margin: 10px 0 16px; table-layout: fixed; width: 100%; }
    .report th { background: #f2f4f7; color: #344054; font-weight: 700; text-align: left; }
    .report th, .report td { border: 1px solid #dfe3ea; overflow-wrap: anywhere; padding: 7px 8px; vertical-align: top; }
    .report strong { font-weight: 700; }
    .approval-note { background: #fffaeb; border: 1px solid #fedf89; border-radius: 5px; color: #7a2e0e; margin-top: 22px; padding: 10px 12px; }
  </style>
</head>
<body>
  <section class="cover">
    <div class="brand">
      <span class="brand-mark">A</span>
      <span class="brand-name">亚马逊运营工作流中台</span>
    </div>
    <h1>${escapeHtml(input.title)}</h1>
    <p class="subtitle">${escapeHtml(input.subtitle)}</p>
    <div class="meta">
      ${metaItem("归档版本", `v${input.version}`)}
      ${metaItem("数据覆盖", coverageLabel)}
      ${metaItem("生成时间", formatGeneratedAt(input.generatedAt))}
      ${metaItem("生成人", input.generatedByName ?? "系统")}
    </div>
  </section>
  <main class="report">${markdownToHtml(input.markdown)}</main>
  <aside class="approval-note">本报告用于运营判断和任务协作。调价、广告预算、促销及 Listing 修改仍需人工确认。</aside>
</body>
</html>`;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]?.startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (isTableStart(lines, index)) {
      const tableLines: string[] = [line];
      index += 2;
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2] ?? "")}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
      index += 1;
      continue;
    }
    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }
  return blocks.join("\n");
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return !line.trim()
    || line.startsWith("```")
    || /^(#{1,3})\s+/.test(line)
    || /^[-*]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || line.startsWith("> ")
    || isTableStart(lines, index);
}

function isTableStart(lines: string[], index: number): boolean {
  return isTableRow(lines[index] ?? "") && /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(lines[index + 1] ?? "");
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function renderTable(lines: string[]): string {
  const rows = lines.map(splitTableRow);
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  return `<table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>`
    + `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function splitTableRow(line: string): string[] {
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function metaItem(label: string, value: string): string {
  return `<div class="meta-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function coverageStatusLabel(status: string): string {
  if (status === "complete") return "覆盖完整";
  if (status === "partial") return "部分覆盖";
  return "证据不足";
}

function formatGeneratedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai"
  }).format(timestamp);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
