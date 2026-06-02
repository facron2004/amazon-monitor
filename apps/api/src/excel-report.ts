import type { Store } from "./store.js";

export interface NotificationAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

type CellValue = string | number | boolean | null | undefined;

interface WorkbookSheet {
  name: string;
  rows: CellValue[][];
}

export function buildNotificationExcelAttachment(store: Store, date: string): NotificationAttachment {
  const workbook = buildWorkbookBuffer(buildReportSheets(store, date));
  return {
    filename: `amazon-monitor-${date}.xlsx`,
    content: workbook,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
}

function buildReportSheets(store: Store, date: string): WorkbookSheet[] {
  const summary = store.getDashboardSummary(date);
  const categories = store.listCategoryMonitors();
  const categorySnapshots = store.listCategorySnapshots({ date, limit: 2000 });
  const brandMatrix = store.listBrandMatrix({ date });
  const categorySignals = store.listCategorySignals({ date, limit: 2000 });
  const keywordSnapshots = store.listSnapshots({ date, limit: 2000 });
  const competitors = store.listCompetitors();
  const alerts = store.listAlerts({ date, limit: 2000 });
  const bsrHistory = store.listBsrRankHistory({ date, limit: 5000 });
  const bsrQuality = store.listBsrSnapshotQuality({ date, limit: 5000 });
  const bsrChanges = store.listBsrRankChanges({ date, includeUnchanged: false, limit: 5000 });
  const actionInsights = store.listCompetitorActionInsights({ date, limit: 5000 });
  const priceHistory = store.listProductPriceHistory({ date, limit: 5000 });
  const activityEvents = store.listCategoryActivityEvents({ date, limit: 3000 });
  const activitySignals = categorySignals.filter((signal) => ["price_drop", "new_coupon", "new_deal"].includes(signal.signalType));

  return [
    {
      name: "总览",
      rows: [
        ["报告日期", date],
        ["模块", "指标", "数值"],
        ["关键词", "关键词总数", summary.keywordCount],
        ["关键词", "启用关键词", summary.activeKeywordCount],
        ["类目", "类目总数", summary.categoryMonitorCount],
        ["类目", "启用类目", summary.activeCategoryCount],
        ["采集", "关键词快照 ASIN", summary.todaySnapshotCount],
        ["采集", "类目榜单 ASIN", summary.categorySnapshotCount],
        ["竞品", "竞品池 ASIN", summary.competitorCount],
        ["告警", "关键词告警", summary.alertCount],
        ["告警", "类目信号", summary.categorySignalCount],
        ["告警", "高优先级告警", summary.criticalAlertCount],
        [],
        ["监控类目", "站点", "范围", "状态", "URL"],
        ...categories.map((category) => [
          category.name,
          category.marketplace,
          `Top ${category.crawlTopN}`,
          category.status,
          category.categoryUrl
        ])
      ]
    },
    {
      name: "类目榜单",
      rows: [
        ["日期", "类目", "站点", "排名", "ASIN", "品牌", "标题", "当前价", "到手价", "Coupon", "Deal", "评分", "评论数", "链接"],
        ...categorySnapshots.map((item) => [
          item.snapshotDate,
          item.categoryName,
          item.marketplace,
          item.rank,
          item.asin,
          item.brand,
          item.title,
          item.currentPrice,
          item.finalEstimatedPrice,
          item.couponText,
          item.dealBadge,
          item.rating,
          item.reviewCount,
          item.productUrl
        ])
      ]
    },
    {
      name: "品牌矩阵",
      rows: [
        ["日期", "类目", "站点", "品牌", "Top20", "Top50", "Top100", "最佳排名", "平均排名", "新增", "掉出", "上升", "下降", "降价", "Coupon", "Deal", "Top ASIN"],
        ...brandMatrix.map((item) => [
          item.snapshotDate,
          item.categoryName,
          item.marketplace,
          item.brand,
          item.productCountTop20,
          item.productCountTop50,
          item.productCountTop100,
          item.bestRank,
          item.averageRank,
          item.newEntryCount,
          item.droppedCount,
          item.rankUpCount,
          item.rankDownCount,
          item.priceDownCount,
          item.couponCount,
          item.dealCount,
          item.topAsins.join(", ")
        ])
      ]
    },
    {
      name: "异动信号",
      rows: [
        ["日期", "类目", "站点", "级别", "信号类型", "ASIN", "品牌", "标题", "当前排名", "昨日排名", "当前价", "昨日价", "说明"],
        ...categorySignals.map((signal) => [
          signal.signalDate,
          signal.categoryName,
          signal.marketplace,
          signal.alertLevel,
          signal.signalType,
          signal.asin,
          signal.brand,
          signal.title,
          signal.rank,
          signal.previousRank,
          signal.price,
          signal.previousPrice,
          signal.content
        ])
      ]
    },
    {
      name: "活动价格",
      rows: [
        ["日期", "类目", "级别", "活动类型", "ASIN", "品牌", "标题", "当前价", "昨日价", "说明"],
        ...activitySignals.map((signal) => [
          signal.signalDate,
          signal.categoryName,
          signal.alertLevel,
          signal.signalType,
          signal.asin,
          signal.brand,
          signal.title,
          signal.price,
          signal.previousPrice,
          signal.content
        ])
      ]
    },
    {
      name: "价格历史",
      rows: [
        ["日期", "类目", "站点", "ASIN", "品牌", "标题", "当前价", "到手价", "Coupon金额", "Coupon比例", "T30最低价", "T60最低价", "T90最低价", "监控以来最低价"],
        ...priceHistory.map((item) => [
          item.snapshotDate,
          item.categoryName,
          item.marketplace,
          item.asin,
          item.brand,
          item.title,
          item.currentPrice,
          item.finalEstimatedPrice,
          item.couponValue,
          item.couponRate,
          item.t30LowPrice,
          item.t60LowPrice,
          item.t90LowPrice,
          item.monitoringLowPrice
        ])
      ]
    },
    {
      name: "活动事件",
      rows: [
        ["日期", "类目", "级别", "事件", "ASIN", "品牌", "标题", "排名前", "排名后", "排名变化", "价格前", "价格后", "价格变化率", "Coupon前", "Coupon后", "Deal", "事件摘要", "系统判断", "建议动作"],
        ...activityEvents.map((item) => [
          item.eventDate,
          item.categoryName,
          item.eventLevel,
          item.eventType,
          item.asin,
          item.brand,
          item.title,
          item.rankBefore,
          item.rankAfter,
          item.rankChange,
          item.priceBefore,
          item.priceAfter,
          item.priceChangeRate,
          item.couponBefore,
          item.couponAfter,
          item.dealType,
          item.eventSummary,
          item.possibleStrategy,
          item.suggestedAction
        ])
      ]
    },
    {
      name: "关键词排名",
      rows: [
        ["日期", "关键词", "站点", "综合排名", "自然排名", "广告排名", "ASIN", "品牌", "标题", "当前价", "到手价", "Coupon", "Deal", "BSR", "BSR 类目", "链接"],
        ...keywordSnapshots.map((item) => [
          item.snapshotDate,
          item.keyword,
          item.marketplace,
          item.absoluteRank,
          item.organicRank,
          item.sponsoredRank,
          item.asin,
          item.brand,
          item.title,
          item.currentPrice,
          item.finalEstimatedPrice,
          item.couponText,
          item.dealBadge,
          item.bsrRank,
          item.bsrCategory,
          item.productUrl
        ])
      ]
    },
    {
      name: "竞品池",
      rows: [
        [
          "ASIN",
          "站点",
          "来源",
          "分层",
          "品牌",
          "标题",
          "首次来源",
          "首次发现",
          "最后出现",
          "关键词数",
          "类目排名",
          "类目",
          "最佳排名",
          "最新排名",
          "最低价",
          "最新价",
          "BSR",
          "BSR 类目",
          "入池原因",
          "重点",
          "链接"
        ],
        ...competitors.map((item) => [
          item.asin,
          item.marketplace,
          item.sourceType,
          item.competitorTier,
          item.brand,
          item.title,
          item.firstSeenSource ?? item.firstSeenKeyword,
          item.firstSeenDate,
          item.lastSeenDate,
          item.appearKeywordCount,
          item.latestCategoryRank,
          item.latestCategoryName,
          item.bestRank,
          item.latestRank,
          item.lowestPrice,
          item.latestPrice,
          item.latestBsrRank,
          item.latestBsrCategory,
          item.competitorReasons.join("; "),
          item.isKeyCompetitor ? "是" : "否",
          item.latestProductUrl
        ])
      ]
    },
    {
      name: "BSR历史",
      rows: [
        ["日期", "来源", "来源名称", "站点", "BSR类目", "BSR排名", "ASIN", "品牌", "标题", "当前价", "父级排名", "细分类目", "商品链接", "榜单链接"],
        ...bsrHistory.map((item) => [
          item.snapshotDate,
          item.sourceType,
          item.sourceName,
          item.marketplace,
          item.category,
          item.rank,
          item.asin,
          item.brand,
          item.title,
          item.currentPrice,
          item.parentRank,
          item.isSpecificRank ? "是" : "否",
          item.productUrl,
          item.rankUrl
        ])
      ]
    },
    {
      name: "BSR质量",
      rows: [
        ["日期", "来源", "来源名称", "站点", "类目", "状态", "预期数量", "实际数量", "唯一 ASIN", "唯一排名", "最小排名", "最大排名", "问题"],
        ...bsrQuality.map((item) => [
          item.snapshotDate,
          item.sourceType,
          item.sourceName,
          item.marketplace,
          item.category,
          item.qualityStatus,
          item.expectedCount,
          item.actualCount,
          item.uniqueAsinCount,
          item.uniqueRankCount,
          item.minRank,
          item.maxRank,
          item.issue
        ])
      ]
    },
    {
      name: "BSR异动",
      rows: [
        ["日期", "对比日期", "来源", "来源名称", "站点", "BSR类目", "异动", "ASIN", "品牌", "标题", "当前排名", "昨日排名", "变化", "当前价", "链接"],
        ...bsrChanges.map((item) => [
          item.snapshotDate,
          item.previousDate,
          item.sourceType,
          item.sourceName,
          item.marketplace,
          item.category,
          item.changeType,
          item.asin,
          item.brand,
          item.title,
          item.currentRank,
          item.previousRank,
          item.rankChange,
          item.currentPrice,
          item.productUrl
        ])
      ]
    },
    {
      name: "动作洞察",
      rows: [
        [
          "日期",
          "对比日期",
          "来源",
          "来源名称",
          "站点",
          "类目",
          "置信度",
          "洞察类型",
          "ASIN",
          "品牌",
          "标题",
          "当前排名",
          "昨日排名",
          "变化",
          "价格",
          "证据",
          "系统判断",
          "建议动作",
          "链接"
        ],
        ...actionInsights.map((item) => [
          item.insightDate,
          item.previousDate,
          item.sourceType,
          item.sourceName,
          item.marketplace,
          item.category,
          item.confidence,
          item.insightType,
          item.asin,
          item.brand,
          item.title,
          item.currentRank,
          item.previousRank,
          item.rankChange,
          item.price,
          item.evidence,
          item.inferredAction,
          item.suggestedResponse,
          item.productUrl
        ])
      ]
    },
    {
      name: "告警日志",
      rows: [
        ["日期", "级别", "类型", "关键词", "ASIN", "品牌", "标题", "状态", "旧值", "新值", "说明"],
        ...alerts.map((alert) => [
          alert.alertDate,
          alert.alertLevel,
          alert.alertType,
          alert.keyword,
          alert.asin,
          alert.brand,
          alert.title,
          alert.status,
          alert.oldValue,
          alert.newValue,
          alert.alertContent
        ])
      ]
    }
  ];
}

function buildWorkbookBuffer(sheets: WorkbookSheet[]): Buffer {
  const files: Array<{ path: string; content: string | Buffer }> = [
    { path: "[Content_Types].xml", content: contentTypesXml(sheets.length) },
    { path: "_rels/.rels", content: rootRelsXml() },
    { path: "xl/workbook.xml", content: workbookXml(sheets) },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheets.length) },
    { path: "xl/styles.xml", content: stylesXml() },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet)
    }))
  ];
  return zipStored(files);
}

function contentTypesXml(sheetCount: number): string {
  return xmlDecl(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      ${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
    </Types>`
  );
}

function rootRelsXml(): string {
  return xmlDecl(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`
  );
}

function workbookXml(sheets: WorkbookSheet[]): string {
  return xmlDecl(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>
        ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
      </sheets>
    </workbook>`
  );
}

function workbookRelsXml(sheetCount: number): string {
  return xmlDecl(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${Array.from(
        { length: sheetCount },
        (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
      ).join("")}
      <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`
  );
}

function stylesXml(): string {
  return xmlDecl(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
      <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`
  );
}

function worksheetXml(sheet: WorkbookSheet): string {
  const maxCols = Math.max(1, ...sheet.rows.map((row) => row.length));
  const rowsXml = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => cellXml(value, `${columnName(colIndex + 1)}${rowIndex + 1}`, rowIndex === 0 || (sheet.name === "总览" && rowIndex === 1)))
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const columnsXml = Array.from(
    { length: maxCols },
    (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(sheet, index)}" customWidth="1"/>`
  ).join("");

  return xmlDecl(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
      <cols>${columnsXml}</cols>
      <sheetData>${rowsXml}</sheetData>
      <autoFilter ref="A1:${columnName(maxCols)}${Math.max(1, sheet.rows.length)}"/>
    </worksheet>`
  );
}

function cellXml(value: CellValue, ref: string, isHeader: boolean): string {
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${isHeader ? ' s="1"' : ""}/>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${isHeader ? ' s="1"' : ""}><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}" t="b"${isHeader ? ' s="1"' : ""}><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${isHeader ? ' s="1"' : ""}><is><t>${escapeXml(String(value))}</t></is></c>`;
}

function columnWidth(sheet: WorkbookSheet, columnIndex: number): number {
  const values = sheet.rows.map((row) => String(row[columnIndex] ?? ""));
  const maxLength = Math.max(8, ...values.map((value) => Math.min(60, value.length)));
  return Math.min(42, Math.max(10, Math.ceil(maxLength * 1.2)));
}

function columnName(index: number): string {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function xmlDecl(value: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value.replace(/>\s+</g, "><").trim()}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function zipStored(files: Array<{ path: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const filename = Buffer.from(file.path, "utf8");
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(filename.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, filename, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, filename);

    offset += local.length + filename.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
