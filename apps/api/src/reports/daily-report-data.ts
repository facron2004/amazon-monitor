import { buildBrandTop10ChangeRows } from "./brand-top10-change-rows.js";
import { buildSnapshotLookup } from "./category-snapshot-lookup.js";
import type { Store } from "../store.js";
import { collectDailyInsightReportData } from "./insight-report.js";

export function collectDailyReportData(store: Store, date: string) {
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
  const { insightEvents, reviewDueEvents, reviewedEvents } = collectDailyInsightReportData(store, date);
  const priceHistory = store.listProductPriceHistory({ date, limit: 5000 });
  const activityEvents = store.listCategoryActivityEvents({ date, limit: 3000 });
  const activitySignals = categorySignals.filter((signal) => ["price_drop", "new_coupon", "new_deal"].includes(signal.signalType));
  const snapshotLookup = buildSnapshotLookup(categorySnapshots);
  const brandTop10Rows = buildBrandTop10ChangeRows(store, date, categorySnapshots);

  return {
    summary,
    categories,
    categorySnapshots,
    brandMatrix,
    categorySignals,
    keywordSnapshots,
    competitors,
    alerts,
    bsrHistory,
    bsrQuality,
    bsrChanges,
    actionInsights,
    insightEvents,
    reviewDueEvents,
    reviewedEvents,
    priceHistory,
    activityEvents,
    activitySignals,
    snapshotLookup,
    brandTop10Rows
  };
}

export type DailyReportData = ReturnType<typeof collectDailyReportData>;
