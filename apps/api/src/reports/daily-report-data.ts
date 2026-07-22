import { buildBrandTop10ChangeRows } from "./brand-top10-change-rows.js";
import { buildSnapshotLookup } from "./category-snapshot-lookup.js";
import type { Store } from "../store.js";
import { collectDailyInsightReportData } from "./insight-report.js";

export function collectDailyReportData(store: Store, date: string, orgId?: number) {
  const summary = store.getDashboardSummary(date, orgId);
  const categories = store.listCategoryMonitors({ orgId });
  const categorySnapshots = store.listCategorySnapshots({ orgId, date, limit: 2000 });
  const brandMatrix = store.listBrandMatrix({ orgId, date });
  const categorySignals = store.listCategorySignals({ orgId, date, limit: 2000 });
  const keywordSnapshots = store.listSnapshots({ orgId, date, limit: 2000 });
  const competitors = store.listCompetitors({ orgId });
  const alerts = store.listAlerts({ orgId, date, limit: 2000 });
  const bsrHistory = store.listBsrRankHistory({ orgId, date, limit: 5000 });
  const bsrQuality = store.listBsrSnapshotQuality({ orgId, date, limit: 5000 });
  const bsrChanges = store.listBsrRankChanges({ orgId, date, includeUnchanged: false, limit: 5000 });
  const actionInsights = store.listCompetitorActionInsights({ orgId, date, limit: 5000 });
  const { insightEvents, reviewDueEvents, reviewedEvents } = collectDailyInsightReportData(store, date, orgId);
  const priceHistory = store.listProductPriceHistory({ orgId, date, limit: 5000 });
  const activityEvents = store.listCategoryActivityEvents({ orgId, date, limit: 3000 });
  const activitySignals = categorySignals.filter((signal) => ["price_drop", "new_coupon", "new_deal"].includes(signal.signalType));
  const snapshotLookup = buildSnapshotLookup(categorySnapshots);
  const brandTop10Rows = buildBrandTop10ChangeRows(store, date, categorySnapshots, orgId);

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
