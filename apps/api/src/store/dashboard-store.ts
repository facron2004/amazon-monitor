import type { DatabaseSync } from "node:sqlite";
import type { Store } from "./types.js";

type DashboardStoreMethods = Pick<Store, "getDashboardSummary">;

export function createDashboardStore(db: DatabaseSync): DashboardStoreMethods {
  return {
    getDashboardSummary(date) {
      const row = db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM amazon_keyword_monitor) AS keyword_count,
            (SELECT COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) FROM amazon_keyword_monitor) AS active_keyword_count,
            (SELECT COUNT(*) FROM amazon_bestseller_category_monitor) AS category_monitor_count,
            (SELECT COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) FROM amazon_bestseller_category_monitor) AS active_category_count,
            (SELECT COUNT(*) FROM amazon_keyword_serp_snapshot WHERE snapshot_date = ?) AS today_snapshot_count,
            (SELECT COUNT(*) FROM amazon_bestseller_rank_snapshot WHERE snapshot_date = ?) AS category_snapshot_count,
            (SELECT COUNT(*) FROM amazon_competitor_pool WHERE status = 1) AS competitor_count,
            (SELECT COUNT(*) FROM amazon_alert_log WHERE alert_date = ?) AS alert_count,
            (SELECT COUNT(*) FROM amazon_competitor_signal_log WHERE source_type = 'category' AND signal_date = ?) AS category_signal_count,
            (SELECT COUNT(*) FROM amazon_alert_log WHERE alert_date = ? AND alert_level IN ('critical', 'high')) AS critical_alert_count,
            (SELECT MAX(report_date) FROM amazon_daily_report) AS latest_report_date`
        )
        .get(date, date, date, date, date) as {
        keyword_count: number;
        active_keyword_count: number;
        category_monitor_count: number;
        active_category_count: number;
        today_snapshot_count: number;
        category_snapshot_count: number;
        competitor_count: number;
        alert_count: number;
        category_signal_count: number;
        critical_alert_count: number;
        latest_report_date: string | null;
      };
      return {
        keywordCount: row.keyword_count,
        activeKeywordCount: row.active_keyword_count,
        categoryMonitorCount: row.category_monitor_count,
        activeCategoryCount: row.active_category_count,
        todaySnapshotCount: row.today_snapshot_count,
        categorySnapshotCount: row.category_snapshot_count,
        competitorCount: row.competitor_count,
        alertCount: row.alert_count,
        categorySignalCount: row.category_signal_count,
        criticalAlertCount: row.critical_alert_count,
        latestReportDate: row.latest_report_date
      };
    }
  };
}
