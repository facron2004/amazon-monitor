import type { AiDataFreshness, AiProductLaunchBrief } from "@amazon-monitor/shared";

export function formatProductLaunchBrief(
  brief: AiProductLaunchBrief,
  freshness?: AiDataFreshness
): string {
  const painStatus = brief.customerPainEvidence.status === "data_gap" ? "数据缺口" : "已有证据";
  return [
    `# ${brief.title}`,
    "",
    `- 证据日期：${brief.evidenceDate}`,
    `- 站点：${brief.marketplace}`,
    `- 决策建议：${brief.decision === "validate" ? "进入人工验证" : "保持观察"}`,
    ...formatFreshness(freshness),
    "",
    "## 机会判断",
    brief.opportunityThesis,
    "",
    "## 目标价格带",
    `- 最低：${formatPrice(brief.priceBand.minimum, brief.priceBand.currency)}`,
    `- 目标：${formatPrice(brief.priceBand.target, brief.priceBand.currency)}`,
    `- 最高：${formatPrice(brief.priceBand.maximum, brief.priceBand.currency)}`,
    `- 证据：${brief.priceBand.evidence}`,
    "",
    `## 用户痛点证据（${painStatus}）`,
    brief.customerPainEvidence.conclusion,
    ...brief.customerPainEvidence.evidence.map((item) => `- 现有证据：${item}`),
    ...brief.customerPainEvidence.validationNeeded.map((item) => `- 待验证：${item}`),
    "",
    "## 竞品矩阵",
    "| ASIN | 品牌 | BSR | 价格 | Review | 信号 |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    ...brief.competitorMatrix.map((item) => (
      `| ${tableCell(item.asin)} | ${tableCell(item.brand ?? "未知")} | #${item.rank} | ${formatPrice(item.price, brief.priceBand.currency)} | ${item.reviewCount ?? "暂无"} | ${tableCell(item.signal)} |`
    )),
    "",
    "## 差异化假设",
    ...brief.differentiationHypotheses.flatMap((item, index) => [
      `${index + 1}. ${item.hypothesis}`,
      `   - 证据：${item.evidence.join("；")}`,
      `   - 待验证：${item.validationNeeded}`
    ]),
    "",
    "## 立项验证清单",
    ...brief.validationChecklist.map((item) => (
      `- [ ] [${item.gate === "required" ? "必须" : "建议"}] ${item.item}：${item.evidenceRequired}`
    )),
    "",
    "## 风险边界",
    ...brief.riskNotes.map((item) => `- ${item}`)
  ].join("\n");
}

function formatFreshness(freshness?: AiDataFreshness): string[] {
  if (!freshness) return [];
  return [
    `- 数据来源：${freshness.dataSource}`,
    `- 数据更新时间：${freshness.lastSyncedAt ?? "暂无"}`,
    `- 采集状态：${freshness.syncStatus ?? "暂无"}`,
    `- 新鲜度状态：${freshness.freshnessStatus}`,
    ...(freshness.failureReason ? [`- 失败原因：${freshness.failureReason}`] : []),
    ...(freshness.warning ? [`- 新鲜度警告：${freshness.warning}`] : [])
  ];
}

function formatPrice(value: number | null, currency: string | null): string {
  if (value === null) return "暂无";
  return `${currency ? `${currency} ` : ""}${value.toFixed(2)}`;
}

function tableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll(/\s+/g, " ").trim();
}
