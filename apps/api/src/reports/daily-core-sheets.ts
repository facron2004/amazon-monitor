import { inferIceType } from "@amazon-monitor/shared";
import { imagePreviewCell, type WorkbookSheet } from "./excel-workbook.js";
import { promoText, validCouponText, validDealBadge } from "./promo-text.js";
import type { DailyReportData } from "./daily-report-data.js";

export function buildDailyCoreSheets(data: DailyReportData, date: string): WorkbookSheet[] {
  const {
    summary,
    categories,
    categorySnapshots,
    brandMatrix,
    categorySignals,
    keywordSnapshots,
    competitors,
    priceHistory,
    activityEvents,
    activitySignals
  } = data;

  return [
    {
      name: "Summary",
      rows: [
        ["Report Date", date],
        ["Module", "Metric", "Value"],
        ["Keywords", "Total keywords", summary.keywordCount],
        ["Keywords", "Enabled keywords", summary.activeKeywordCount],
        ["Categories", "Total categories", summary.categoryMonitorCount],
        ["Categories", "Enabled categories", summary.activeCategoryCount],
        ["Collection", "Keyword snapshot ASINs", summary.todaySnapshotCount],
        ["Collection", "Category bestseller ASINs", summary.categorySnapshotCount],
        ["Competitors", "Competitor pool ASINs", summary.competitorCount],
        ["Alerts", "Keyword alerts", summary.alertCount],
        ["Alerts", "Category signals", summary.categorySignalCount],
        ["Alerts", "High priority alerts", summary.criticalAlertCount],
        [],
        ["Monitored Category", "Marketplace", "Range", "Status", "URL"],
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
      name: "Category Bestsellers",
      rows: [
        ["Date", "Category", "Marketplace", "Rank", "ASIN", "Brand", "Ice Type", "Title", "Image Preview", "Image URL", "Current Price", "Final Price", "Coupon", "Deal", "Coupon / Deal", "Rating", "Review Count", "Product URL"],
        ...categorySnapshots.map((item) => [
          item.snapshotDate,
          item.categoryName,
          item.marketplace,
          item.rank,
          item.asin,
          item.brand,
          item.iceType,
          item.title,
          imagePreviewCell(item.imageUrl),
          item.imageUrl,
          item.currentPrice,
          item.finalEstimatedPrice,
          validCouponText(item.couponText),
          validDealBadge(item.dealBadge),
          promoText(item),
          item.rating,
          item.reviewCount,
          item.productUrl
        ])
      ]
    },
    {
      name: "Brand Matrix",
      rows: [
        ["Date", "Category", "Marketplace", "Brand", "Top10", "Top20", "Top50", "Top100", "Best Rank", "Average Rank", "New Entries", "Dropped", "Rank Up", "Rank Down", "Price Down", "Coupon Count", "Deal Count", "Top ASINs"],
        ...brandMatrix.map((item) => [
          item.snapshotDate,
          item.categoryName,
          item.marketplace,
          item.brand,
          item.productCountTop10,
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
      name: "Category Signals",
      rows: [
        ["Date", "Category", "Marketplace", "Level", "Signal Type", "ASIN", "Brand", "Title", "Current Rank", "Previous Rank", "Current Price", "Previous Price", "Content"],
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
      name: "Promo Price Signals",
      rows: [
        ["Date", "Category", "Level", "Signal Type", "ASIN", "Brand", "Title", "Current Price", "Previous Price", "Content"],
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
      name: "Price Review History",
      rows: [
        ["Date", "Category", "Marketplace", "ASIN", "Brand", "Ice Type", "Image Preview", "Image URL", "Product URL", "Title", "Current Price", "Final Price", "Coupon", "Deal", "Coupon / Deal", "Coupon Value", "Coupon Rate", "Review Count", "Previous Reviews", "Review Change", "T30 Low", "T60 Low", "T90 Low", "Monitoring Low"],
        ...priceHistory.map((item) => [
          item.snapshotDate,
          item.categoryName,
          item.marketplace,
          item.asin,
          item.brand,
          item.iceType,
          imagePreviewCell(item.imageUrl),
          item.imageUrl,
          item.productUrl,
          item.title,
          item.currentPrice,
          item.finalEstimatedPrice,
          validCouponText(item.couponText),
          validDealBadge(item.dealBadge),
          promoText(item),
          item.couponValue,
          item.couponRate,
          item.reviewCount,
          item.previousReviewCount,
          item.reviewCountChange,
          item.t30LowPrice,
          item.t60LowPrice,
          item.t90LowPrice,
          item.monitoringLowPrice
        ])
      ]
    },
    {
      name: "Activity Events",
      rows: [
        ["Date", "Category", "Level", "Event", "ASIN", "Brand", "Title", "Rank Before", "Rank After", "Rank Change", "Review Before", "Review After", "Review Change", "Price Before", "Price After", "Price Change Rate", "Coupon Before", "Coupon After", "Deal", "Summary", "Possible Strategy", "Suggested Action"],
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
          item.reviewCountBefore,
          item.reviewCountAfter,
          item.reviewCountChange,
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
      name: "Keyword Rankings",
      rows: [
        ["Date", "Keyword", "Marketplace", "Absolute Rank", "Organic Rank", "Sponsored Rank", "ASIN", "Brand", "Ice Type", "Image Preview", "Image URL", "Title", "Current Price", "Final Price", "Review Count", "Coupon", "Deal", "BSR", "BSR Category", "Product URL"],
        ...keywordSnapshots.map((item) => [
          item.snapshotDate,
          item.keyword,
          item.marketplace,
          item.absoluteRank,
          item.organicRank,
          item.sponsoredRank,
          item.asin,
          item.brand,
          inferIceType(item.title),
          imagePreviewCell(item.imageUrl),
          item.imageUrl,
          item.title,
          item.currentPrice,
          item.finalEstimatedPrice,
          item.reviewCount,
          item.couponText,
          item.dealBadge,
          item.bsrRank,
          item.bsrCategory,
          item.productUrl
        ])
      ]
    },
    {
      name: "Competitor Pool",
      rows: [
        [
          "ASIN",
          "Marketplace",
          "Source",
          "Tier",
          "Brand",
          "Ice Type",
          "Title",
          "Image Preview",
          "Image URL",
          "First Source",
          "First Seen",
          "Last Seen",
          "Keyword Count",
          "Category Rank",
          "Category",
          "Best Rank",
          "Latest Rank",
          "Lowest Price",
          "Latest Price",
          "Coupon / Deal",
          "Review Count",
          "BSR",
          "BSR Category",
          "Reasons",
          "Key Competitor",
          "Product URL"
        ],
        ...competitors.map((item) => [
          item.asin,
          item.marketplace,
          item.sourceType,
          item.competitorTier,
          item.brand,
          item.iceType,
          item.title,
          imagePreviewCell(item.imageUrl),
          item.imageUrl,
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
          promoText(item),
          item.latestReviewCount,
          item.latestBsrRank,
          item.latestBsrCategory,
          item.competitorReasons.join("; "),
          item.isKeyCompetitor,
          item.latestProductUrl
        ])
      ]
    },
  ];
}
