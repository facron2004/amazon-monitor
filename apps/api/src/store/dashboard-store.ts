import type { DatabaseSync } from "node:sqlite";
import { getDashboardOperationsSummary } from "./dashboard-operations.js";
import type { Store } from "./types.js";

type DashboardStoreMethods = Pick<Store, "getDashboardSummary" | "getDashboardOperationsSummary">;

export function createDashboardStore(db: DatabaseSync): DashboardStoreMethods {
  return {
    getDashboardSummary(date, orgId) {
      const scope = orgId ?? null;
      const row = db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM amazon_keyword_monitor WHERE (? IS NULL OR org_id = ?)) AS keyword_count,
            (SELECT COUNT(*) FROM amazon_keyword_monitor WHERE status = 1 AND (? IS NULL OR org_id = ?)) AS active_keyword_count,
            (SELECT COUNT(*) FROM amazon_bestseller_category_monitor WHERE (? IS NULL OR org_id = ?)) AS category_monitor_count,
            (SELECT COUNT(*) FROM amazon_bestseller_category_monitor WHERE status = 1 AND (? IS NULL OR org_id = ?)) AS active_category_count,
            (SELECT COUNT(*) FROM amazon_keyword_serp_snapshot s
              INNER JOIN amazon_keyword_monitor m ON m.id = s.keyword_id
              WHERE s.snapshot_date = ? AND (? IS NULL OR m.org_id = ?)) AS today_snapshot_count,
            (SELECT COUNT(*) FROM amazon_bestseller_rank_snapshot s
              INNER JOIN amazon_bestseller_category_monitor m ON m.id = s.category_id
              WHERE s.snapshot_date = ? AND (? IS NULL OR m.org_id = ?)) AS category_snapshot_count,
            (SELECT COUNT(*) FROM amazon_competitor_pool WHERE status = 1 AND (? IS NULL OR org_id = ?)) AS competitor_count,
            (SELECT COUNT(*) FROM amazon_alert_log WHERE alert_date = ? AND (? IS NULL OR org_id = ?)) AS alert_count,
            (SELECT COUNT(*) FROM amazon_competitor_signal_log s
              INNER JOIN amazon_bestseller_category_monitor m ON m.id = s.category_id
              WHERE s.source_type = 'category' AND s.signal_date = ? AND (? IS NULL OR m.org_id = ?)) AS category_signal_count,
            (SELECT COUNT(*) FROM amazon_alert_log WHERE alert_date = ? AND alert_level IN ('critical', 'high') AND (? IS NULL OR org_id = ?)) AS critical_alert_count,
            (SELECT MAX(report_date) FROM amazon_daily_report WHERE (? IS NULL OR org_id = ?)) AS latest_report_date`
        )
        .get(
          scope, scope,
          scope, scope,
          scope, scope,
          scope, scope,
          date, scope, scope,
          date, scope, scope,
          scope, scope,
          date, scope, scope,
          date, scope, scope,
          date, scope, scope,
          scope, scope
        ) as {
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
    },

    getDashboardOperationsSummary(orgId, date) {
      return getDashboardOperationsSummary(db, orgId, date);
    }
  };
}
