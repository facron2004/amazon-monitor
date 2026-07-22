import type { DatabaseSync } from "node:sqlite";
import type { CategoryMonitor, CategoryMonitorInput, KeywordMonitor, KeywordMonitorInput } from "@amazon-monitor/shared";
import { mapCategoryMonitor, mapKeyword, type CategoryMonitorRow, type KeywordRow } from "./monitor-mappers.js";
import { nowIso, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";
import { normalizeTopN, validateCategoryInput } from "./validation.js";

type MonitorStoreMethods = Pick<
  Store,
  | "createKeyword"
  | "updateKeyword"
  | "markKeywordCollection"
  | "deleteKeyword"
  | "getKeyword"
  | "listKeywords"
  | "createCategoryMonitor"
  | "updateCategoryMonitor"
  | "markCategoryCollection"
  | "deleteCategoryMonitor"
  | "getCategoryMonitor"
  | "listCategoryMonitors"
>;

export function createMonitorStore(db: DatabaseSync): MonitorStoreMethods {
  return {
    createKeyword(input) {
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO amazon_keyword_monitor
          (org_id, keyword, marketplace, priority, zip_code, language, category_tag, crawl_pages, status, today_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        )
        .run(
          input.orgId ?? 1,
          input.keyword,
          input.marketplace,
          input.priority ?? "C",
          input.zipCode ?? null,
          input.language ?? "en_US",
          input.categoryTag ?? null,
          input.crawlPages ?? 3,
          input.status === "disabled" ? 0 : 1,
          now,
          now
        );
      return getKeyword(db, Number(result.lastInsertRowid))!;
    },

    updateKeyword(id, input, orgId) {
      const current = getKeyword(db, id, orgId);
      if (!current) {
        throw new Error(`Keyword ${id} not found`);
      }
      const next: Required<KeywordMonitorInput> = {
        orgId: current.orgId,
        keyword: input.keyword ?? current.keyword,
        marketplace: input.marketplace ?? current.marketplace,
        priority: input.priority ?? current.priority,
        zipCode: input.zipCode ?? current.zipCode,
        language: input.language ?? current.language,
        categoryTag: input.categoryTag ?? current.categoryTag,
        crawlPages: input.crawlPages ?? current.crawlPages,
        status: input.status ?? current.status
      };
      db.prepare(
        `UPDATE amazon_keyword_monitor
         SET keyword = ?, marketplace = ?, priority = ?, zip_code = ?, language = ?, category_tag = ?, crawl_pages = ?, status = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.keyword,
        next.marketplace,
        next.priority,
        next.zipCode,
        next.language,
        next.categoryTag,
        next.crawlPages,
        next.status === "enabled" ? 1 : 0,
        nowIso(),
        id
      );
      return getKeyword(db, id, orgId)!;
    },

    markKeywordCollection(id, status) {
      db.prepare("UPDATE amazon_keyword_monitor SET today_status = ?, last_collected_at = ?, updated_at = ? WHERE id = ?").run(
        status,
        nowIso(),
        nowIso(),
        id
      );
    },

    deleteKeyword(id, orgId) {
      const keyword = getKeyword(db, id, orgId);
      if (!keyword) {
        throw new Error(`Keyword ${id} not found`);
      }

      // Use withTransaction (SAVEPOINT-based) instead of raw BEGIN/COMMIT —
      // node:sqlite does not support nested BEGIN, and the caller may already
      // be inside a withTransaction block.
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_keyword_serp_snapshot WHERE keyword_id = ?").run(id);
        db.prepare(
          `DELETE FROM amazon_competitor_pool
           WHERE org_id = ? AND (
             first_seen_keyword = ?
              OR EXISTS (
                SELECT 1 FROM amazon_keyword_serp_snapshot s
                WHERE s.asin = amazon_competitor_pool.asin
                  AND s.marketplace = amazon_competitor_pool.marketplace
                  AND s.keyword_id = ?
              ))`
        ).run(keyword.orgId, keyword.keyword, id);
        db.prepare("DELETE FROM amazon_keyword_monitor WHERE id = ?").run(id);
      });
    },

    getKeyword(id, orgId) {
      return getKeyword(db, id, orgId);
    },

    listKeywords(filter = {}) {
      const status = filter.status;
      const orgId = filter.orgId;
      const rows = orgId === undefined && status === undefined
        ? db.prepare("SELECT * FROM amazon_keyword_monitor ORDER BY id").all()
        : orgId === undefined
          ? db.prepare("SELECT * FROM amazon_keyword_monitor WHERE status = ? ORDER BY id").all(status === "enabled" ? 1 : 0)
          : status === undefined
            ? db.prepare("SELECT * FROM amazon_keyword_monitor WHERE org_id = ? ORDER BY id").all(orgId)
            : db.prepare("SELECT * FROM amazon_keyword_monitor WHERE org_id = ? AND status = ? ORDER BY id").all(orgId, status === "enabled" ? 1 : 0);
      return (rows as unknown as KeywordRow[]).map(mapKeyword);
    },

    createCategoryMonitor(input) {
      validateCategoryInput(input);
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO amazon_bestseller_category_monitor
          (org_id, name, marketplace, category_url, category_path, crawl_top_n, status, today_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        )
        .run(
          input.orgId ?? 1,
          input.name.trim(),
          input.marketplace.trim(),
          input.categoryUrl.trim(),
          input.categoryPath?.trim() || null,
          normalizeTopN(input.crawlTopN),
          input.status === "disabled" ? 0 : 1,
          now,
          now
        );
      return getCategoryMonitor(db, Number(result.lastInsertRowid))!;
    },

    updateCategoryMonitor(id, input, orgId) {
      const current = getCategoryMonitor(db, id, orgId);
      if (!current) {
        throw new Error(`Category monitor ${id} not found`);
      }
      const next: CategoryMonitorInput = {
        name: input.name ?? current.name,
        marketplace: input.marketplace ?? current.marketplace,
        categoryUrl: input.categoryUrl ?? current.categoryUrl,
        categoryPath: input.categoryPath ?? current.categoryPath,
        crawlTopN: input.crawlTopN ?? current.crawlTopN,
        status: input.status ?? current.status
      };
      validateCategoryInput(next);
      db.prepare(
        `UPDATE amazon_bestseller_category_monitor
         SET name = ?, marketplace = ?, category_url = ?, category_path = ?, crawl_top_n = ?, status = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.name.trim(),
        next.marketplace.trim(),
        next.categoryUrl.trim(),
        next.categoryPath?.trim() || null,
        normalizeTopN(next.crawlTopN),
        next.status === "disabled" ? 0 : 1,
        nowIso(),
        id
      );
      return getCategoryMonitor(db, id, orgId)!;
    },

    markCategoryCollection(id, status) {
      db.prepare("UPDATE amazon_bestseller_category_monitor SET today_status = ?, last_collected_at = ?, updated_at = ? WHERE id = ?").run(
        status,
        nowIso(),
        nowIso(),
        id
      );
    },

    deleteCategoryMonitor(id, orgId) {
      const current = getCategoryMonitor(db, id, orgId);
      if (!current) throw new Error(`Category monitor ${id} not found`);
      db.prepare("DELETE FROM amazon_bestseller_category_monitor WHERE id = ?").run(id);
    },

    getCategoryMonitor(id, orgId) {
      return getCategoryMonitor(db, id, orgId);
    },

    listCategoryMonitors(filter = {}) {
      const { orgId, status } = filter;
      const rows = orgId === undefined && status === undefined
        ? db.prepare("SELECT * FROM amazon_bestseller_category_monitor ORDER BY id").all()
        : orgId === undefined
          ? db.prepare("SELECT * FROM amazon_bestseller_category_monitor WHERE status = ? ORDER BY id").all(status === "enabled" ? 1 : 0)
          : status === undefined
            ? db.prepare("SELECT * FROM amazon_bestseller_category_monitor WHERE org_id = ? ORDER BY id").all(orgId)
            : db.prepare("SELECT * FROM amazon_bestseller_category_monitor WHERE org_id = ? AND status = ? ORDER BY id").all(orgId, status === "enabled" ? 1 : 0);
      return (rows as unknown as CategoryMonitorRow[]).map(mapCategoryMonitor);
    }
  };
}

function getKeyword(db: DatabaseSync, id: number, orgId?: number): KeywordMonitor | null {
  const row = orgId === undefined
    ? db.prepare("SELECT * FROM amazon_keyword_monitor WHERE id = ?").get(id)
    : db.prepare("SELECT * FROM amazon_keyword_monitor WHERE id = ? AND org_id = ?").get(id, orgId);
  return row ? mapKeyword(row as unknown as KeywordRow) : null;
}

function getCategoryMonitor(db: DatabaseSync, id: number, orgId?: number): CategoryMonitor | null {
  const row = orgId === undefined
    ? db.prepare("SELECT * FROM amazon_bestseller_category_monitor WHERE id = ?").get(id)
    : db.prepare("SELECT * FROM amazon_bestseller_category_monitor WHERE id = ? AND org_id = ?").get(id, orgId);
  return row ? mapCategoryMonitor(row as unknown as CategoryMonitorRow) : null;
}
