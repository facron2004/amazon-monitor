import { DatabaseSync } from "node:sqlite";
import {
  buildCategoryDailyKpiSnapshot,
  buildCategorySnapshotDiff,
  isoDateOffset,
} from "@amazon-monitor/shared";
import { createAdsStore } from "./store/ads-store.js";
import { createAiRunStore } from "./store/ai-run-store.js";
import {
  mapCompetitor,
  type CompetitorRow,
} from "./store/competitor-mappers.js";
import { openDatabase } from "./store/db.js";
import { createBsrStore } from "./store/bsr-store.js";
import { createCategoryInsightStore } from "./store/category-insight-store.js";
import { createCategoryPriceStore } from "./store/category-price-store.js";
import { createCategorySnapshotStore } from "./store/category-snapshot-store.js";
import { createCommerceStoreStore } from "./store/commerce-store-store.js";
import { createCompetitorStore } from "./store/competitor-store.js";
import { loadCategorySnapshotContexts } from "./store/category-snapshot-context.js";
import { createDashboardStore } from "./store/dashboard-store.js";
import { createDataSourceStore } from "./store/data-source-store.js";
import { createIdentityStore } from "./store/identity-store.js";
import { createInventoryStore } from "./store/inventory-store.js";
import { createKeywordSnapshotStore } from "./store/keyword-snapshot-store.js";
import { getKeywordRankMatrix } from "./store/keyword-rank-matrix-store.js";
import { createInsightEventStore } from "./store/insight-event-store.js";
import { createListingHealthStore } from "./store/listing-health-store.js";
import { createMonitorStore } from "./store/monitor-store.js";
import { createNotificationStore } from "./store/notification-store.js";
import { createOperationalStore } from "./store/operational-store.js";
import { createProductActivityStore } from "./store/product-activity-store.js";
import { createProductStore } from "./store/product-store.js";
import { createProfitStore } from "./store/profit-store.js";
import { createPromotionStore } from "./store/promotion-store.js";
import { createQueueStore } from "./store/queue-store.js";
import { createReportStore } from "./store/report-store.js";
import { createReviewVocStore } from "./store/review-voc-store.js";
import { createRuleStore } from "./store/rule-store.js";
import { createSopStore } from "./store/sop-store.js";
import { createTaskStore } from "./store/task-store.js";
import { createWorkerStore } from "./store/worker-store.js";
import { nowIso, withTransaction } from "./store/sql-utils.js";
import type { KeywordInput, Store } from "./store/types.js";

export type { KeywordInput, Store } from "./store/types.js";
export { buildBsrRankChanges } from "./store/bsr-rank-changes.js";
export {
  hasEarlierBsrHistory,
  previousUsableBsrDate,
} from "./store/bsr-history-queries.js";
export {
  initSchema,
  configureDatabase,
  openDatabase,
  sqliteBusyTimeoutMs,
} from "./store/db.js";

export function openAppStore(dbPath = "data/amazon-monitor.sqlite"): Store {
  const db = openDatabase(dbPath);
  return createStore(db);
}

export function createStore(db: DatabaseSync): Store {
  const categorySnapshotStore = createCategorySnapshotStore(db);

  return {
    ...createMonitorStore(db),
    ...createNotificationStore(db),
    ...createOperationalStore(db),
    ...createBsrStore(db),
    ...createInsightEventStore(db),
    ...createKeywordSnapshotStore(db),
    ...createCompetitorStore(db),
    ...createDashboardStore(db),
    ...categorySnapshotStore,
    ...createCategoryPriceStore(db, categorySnapshotStore),
    ...createCategoryInsightStore(db),
    ...createProductActivityStore(db),
    ...createCommerceStoreStore(db),
    ...createPromotionStore(db),
    ...createProductStore(db),
    ...createAiRunStore(db),
    ...createListingHealthStore(db),
    ...createAdsStore(db),
    ...createReviewVocStore(db),
    ...createInventoryStore(db),
    ...createProfitStore(db),
    ...createRuleStore(db),
    ...createDataSourceStore(db),
    ...createReportStore(db),
    ...createQueueStore(db),
    ...createWorkerStore(db),
    ...createTaskStore(db),
    ...createSopStore(db),
    ...createIdentityStore(db),

    reset() {
      withTransaction(db, () => {
        db.exec(`
          DELETE FROM sessions;
          DELETE FROM workflow_period_reports;
          DELETE FROM workflow_daily_reports;
          DELETE FROM data_source_sync_runs;
          DELETE FROM data_source_configs;
          DELETE FROM alert_rule_configs;
          DELETE FROM ai_runs;
          DELETE FROM ad_daily_metrics;
          DELETE FROM own_product_reviews;
          DELETE FROM product_inventory_settings;
          DELETE FROM product_profit_settings;
          DELETE FROM own_product_listing_snapshots;
          DELETE FROM own_product_daily_metrics;
          DELETE FROM promotion_plans;
          DELETE FROM own_products;
          DELETE FROM commerce_stores;
          DELETE FROM users;
          DELETE FROM organizations;
          DELETE FROM insight_event_tasks;
          DELETE FROM task_notes;
          DELETE FROM tasks;
          DELETE FROM sops;
          DELETE FROM amazon_worker_heartbeat;
          DELETE FROM amazon_collect_job_queue;
          DELETE FROM asin_watch_states;
          DELETE FROM insight_event_notes;
          DELETE FROM insight_events;
          DELETE FROM amazon_category_daily_report;
          DELETE FROM amazon_daily_report;
          DELETE FROM amazon_notification_send_log;
          DELETE FROM amazon_notification_schedule;
          DELETE FROM amazon_competitor_action_insight;
          DELETE FROM amazon_competitor_activity_event;
          DELETE FROM amazon_competitor_signal_log;
          DELETE FROM amazon_bsr_snapshot_quality;
          DELETE FROM amazon_bsr_rank_history;
          DELETE FROM amazon_product_price_history;
          DELETE FROM amazon_brand_matrix_snapshot;
          DELETE FROM amazon_product_master;
          DELETE FROM amazon_bestseller_rank_snapshot;
          DELETE FROM amazon_bestseller_category_monitor;
          DELETE FROM amazon_collect_task_log;
          DELETE FROM amazon_alert_log;
          DELETE FROM amazon_competitor_daily_change;
          DELETE FROM amazon_competitor_pool;
          DELETE FROM amazon_keyword_serp_snapshot;
          DELETE FROM amazon_keyword_monitor;
        `);
      });
    },

    runInTransaction(work: () => void) {
      withTransaction(db, work);
    },

    getCategoryDetail(categoryId, date, orgId) {
      const category = this.getCategoryMonitor(categoryId, orgId);
      const snapshots = category
        ? this.listCategorySnapshots({ orgId, categoryId, date })
        : [];
      const contextByProduct = loadCategorySnapshotContexts(
        db,
        categoryId,
        date,
        orgId,
      );
      const yesterday = isoDateOffset(date, -1);
      const hasYesterdaySnapshot = category
        ? this.listCategorySnapshots({
            orgId,
            categoryId,
            date: yesterday,
            limit: 1,
          }).length > 0
        : false;
      const yesterdayKpiSnapshot = hasYesterdaySnapshot
        ? buildCategoryDailyKpiSnapshot(
            yesterday,
            this.listCategoryActivityEvents({
              orgId,
              categoryId,
              date: yesterday,
            }),
          )
        : null;
      return {
        category,
        snapshots: snapshots.map((snapshot) => ({
          ...snapshot,
          ...contextByProduct.get(`${snapshot.marketplace}:${snapshot.asin}`),
        })),
        brandMatrix: category
          ? this.listBrandMatrix({ orgId, categoryId, date })
          : [],
        signals: category
          ? this.listCategorySignals({ orgId, categoryId, date, limit: 200 })
          : [],
        report: category ? this.getCategoryReport(date, categoryId, orgId) : "",
        yesterdayKpiSnapshot,
      };
    },

    getCategoryDiff(categoryId, date, compareDate, orgId) {
      if (!this.getCategoryMonitor(categoryId, orgId)) {
        return buildCategorySnapshotDiff({
          categoryId,
          date,
          compareDate,
          current: [],
          comparison: [],
        });
      }
      return buildCategorySnapshotDiff({
        categoryId,
        date,
        compareDate,
        current: this.listCategorySnapshots({ orgId, categoryId, date }),
        comparison: this.listCategorySnapshots({
          orgId,
          categoryId,
          date: compareDate,
        }),
      });
    },

    addCategoryCompetitor(asin, categoryId, orgId) {
      const normalizedAsin = asin.trim().toUpperCase();
      const snapshot = this.listCategorySnapshots({
        orgId,
        categoryId,
        asin: normalizedAsin,
        limit: 1,
      })[0];
      if (!snapshot) {
        return null;
      }

      withTransaction(db, () => {
        this.upsertCompetitorsFromCategorySnapshots([snapshot], [], orgId);
        db.prepare(
          "UPDATE amazon_competitor_pool SET status = 1, updated_at = ? WHERE org_id = ? AND asin = ? AND marketplace = ?",
        ).run(nowIso(), orgId ?? 1, snapshot.asin, snapshot.marketplace);
      });
      const row = db
        .prepare(
          "SELECT * FROM amazon_competitor_pool WHERE org_id = ? AND asin = ? AND marketplace = ?",
        )
        .get(orgId ?? 1, snapshot.asin, snapshot.marketplace) as
        CompetitorRow | undefined;
      return row ? mapCompetitor(row) : null;
    },

    setKeyCompetitor(asin, isKeyCompetitor, orgId) {
      db.prepare(
        "UPDATE amazon_competitor_pool SET is_key_competitor = ?, updated_at = ? WHERE asin = ? AND (? IS NULL OR org_id = ?)",
      ).run(
        isKeyCompetitor ? 1 : 0,
        nowIso(),
        asin,
        orgId ?? null,
        orgId ?? null,
      );
      const row = db
        .prepare(
          "SELECT * FROM amazon_competitor_pool WHERE asin = ? AND (? IS NULL OR org_id = ?) LIMIT 1",
        )
        .get(asin, orgId ?? null, orgId ?? null) as CompetitorRow | undefined;
      return row ? mapCompetitor(row) : null;
    },

    getKeywordDetail(keywordId, date, orgId) {
      const keyword = this.getKeyword(keywordId, orgId);
      const snapshots = keyword
        ? this.listSnapshots({ orgId, keywordId, date })
        : [];
      const changes = keyword
        ? this.listDailyChanges({ orgId, date, keyword: keyword.keyword })
        : [];
      const alerts = keyword
        ? this.listAlerts({ orgId, date, keyword: keyword.keyword })
        : [];
      return { keyword, snapshots, changes, alerts };
    },

    getKeywordRankMatrix(organizationId, requestedDate) {
      return getKeywordRankMatrix(
        db,
        organizationId,
        requestedDate,
        this.listKeywords({ orgId: organizationId }),
      );
    },
  };
}
