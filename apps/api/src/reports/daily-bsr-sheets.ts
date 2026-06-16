import { inferIceType } from "@amazon-monitor/shared";
import {
  snapshotForActionInsight,
  snapshotForBsrChange,
  snapshotForBsrHistory
} from "./category-snapshot-lookup.js";
import { imagePreviewCell, type WorkbookSheet } from "./excel-workbook.js";
import { promoText } from "./promo-text.js";
import type { DailyReportData } from "./daily-report-data.js";

export function buildDailyBsrSheets(data: DailyReportData): WorkbookSheet[] {
  const { alerts, actionInsights, brandTop10Rows, bsrChanges, bsrHistory, bsrQuality, snapshotLookup } = data;

  return [
    {
      name: "BSR History",
      rows: [
        ["Date", "Source", "Source Name", "Marketplace", "BSR Category", "BSR Rank", "ASIN", "Brand", "Ice Type", "Image Preview", "Image URL", "Review Count", "Title", "Current Price", "Coupon / Deal", "Parent Rank", "Specific Rank", "Product URL", "Rank URL"],
        ...bsrHistory.map((item) => {
          const snapshot = snapshotForBsrHistory(snapshotLookup, item);
          const imageUrl = snapshot?.imageUrl ?? null;
          return [
            item.snapshotDate,
            item.sourceType,
            item.sourceName,
            item.marketplace,
            item.category,
            item.rank,
            item.asin,
            item.brand,
            snapshot?.iceType ?? inferIceType(item.title),
            imagePreviewCell(imageUrl),
            imageUrl,
            snapshot?.reviewCount ?? null,
            item.title,
            item.currentPrice,
            promoText(snapshot),
            item.parentRank,
            item.isSpecificRank,
            item.productUrl,
            item.rankUrl
          ];
        })
      ]
    },
    {
      name: "BSR Quality",
      rows: [
        ["Date", "Source", "Source Name", "Marketplace", "Category", "Status", "Expected Count", "Actual Count", "Unique ASINs", "Unique Ranks", "Min Rank", "Max Rank", "Issue"],
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
      name: "BSR Changes",
      rows: [
        ["Date", "Previous Date", "Source", "Source Name", "Marketplace", "BSR Category", "Change", "ASIN", "Brand", "Ice Type", "Image Preview", "Image URL", "Review Count", "Title", "Current Rank", "Previous Rank", "Rank Change", "Current Price", "Coupon / Deal", "Product URL"],
        ...bsrChanges.map((item) => {
          const snapshot = snapshotForBsrChange(snapshotLookup, item);
          const imageUrl = snapshot?.imageUrl ?? null;
          return [
            item.snapshotDate,
            item.previousDate,
            item.sourceType,
            item.sourceName,
            item.marketplace,
            item.category,
            item.changeType,
            item.asin,
            item.brand,
            snapshot?.iceType ?? inferIceType(item.title),
            imagePreviewCell(imageUrl),
            imageUrl,
            snapshot?.reviewCount ?? null,
            item.title,
            item.currentRank,
            item.previousRank,
            item.rankChange,
            item.currentPrice,
            promoText(snapshot),
            item.productUrl
          ];
        })
      ]
    },
    {
      name: "Action Insights",
      rows: [
        [
          "Date",
          "Previous Date",
          "Source",
          "Source Name",
          "Marketplace",
          "Category",
          "Confidence",
          "Insight Type",
          "ASIN",
          "Brand",
          "Ice Type",
          "Image Preview",
          "Image URL",
          "Review Count",
          "Title",
          "Current Rank",
          "Previous Rank",
          "Rank Change",
          "Price",
          "Evidence",
          "Inferred Action",
          "Suggested Response",
          "Product URL"
        ],
        ...actionInsights.map((item) => {
          const snapshot = snapshotForActionInsight(snapshotLookup, item);
          const imageUrl = snapshot?.imageUrl ?? null;
          return [
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
            snapshot?.iceType ?? inferIceType(item.title),
            imagePreviewCell(imageUrl),
            imageUrl,
            snapshot?.reviewCount ?? null,
            item.title,
            item.currentRank,
            item.previousRank,
            item.rankChange,
            item.price,
            item.evidence,
            item.inferredAction,
            item.suggestedResponse,
            item.productUrl
          ];
        })
      ]
    },
    {
      name: "Brand Top10 Changes",
      rows: [
        ["Date", "Category", "Marketplace", "Brand", "Current Top10 ASINs", "Previous Top10 ASINs", "Delta", "Current ASINs", "New Top10 ASINs", "Dropped Top10 ASINs", "Rank Moves"],
        ...brandTop10Rows
      ]
    },
    {
      name: "Alert Log",
      rows: [
        ["Date", "Level", "Type", "Keyword", "ASIN", "Brand", "Title", "Status", "Old Value", "New Value", "Content"],
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
