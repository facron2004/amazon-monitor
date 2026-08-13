import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";
import type { Store } from "./types.js";

let db: DatabaseSync;
let store: Store;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
});

afterEach(() => {
  db.close();
});

describe("organization product metric scale boundary", () => {
  it("creates the indexes used by the effective Dashboard read path", () => {
    const indexes = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index'
        AND name IN (
          'idx_data_source_override_audits_effective_window',
          'idx_sp_api_sales_traffic_effective_scope_date',
          'idx_sp_api_sales_traffic_effective_product_date'
        )
      ORDER BY name
    `).all() as Array<{ name: string }>;

    expect(indexes.map((index) => index.name)).toEqual([
      "idx_data_source_override_audits_effective_window",
      "idx_sp_api_sales_traffic_effective_product_date",
      "idx_sp_api_sales_traffic_effective_scope_date"
    ]);
  });

  it("does not apply the generic 1000-row clamp to organization reads", () => {
    const insertProduct = db.prepare(`
      INSERT INTO own_products (org_id, marketplace, sku, asin, title, status, data_source, sync_status)
      VALUES (1, 'US', ?, ?, ?, 'active', 'manual', 'manual')
    `);
    const insertMetric = db.prepare(`
      INSERT INTO own_product_daily_metrics (product_id, metric_date, orders, sales_amount, data_source)
      VALUES (?, '2026-07-27', 1, 10, 'manual')
    `);
    db.exec("BEGIN");
    try {
      for (let index = 0; index < 1_001; index += 1) {
        const result = insertProduct.run(`SCALE-${index}`, `B0SCALE${String(index).padStart(5, "0")}`, `Scale ${index}`);
        insertMetric.run(Number(result.lastInsertRowid));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const metrics = store.listOrganizationProductDailyMetrics(1, {
      startDate: "2026-07-27",
      endDate: "2026-07-27",
      limit: 2_000
    });

    expect(metrics).toHaveLength(1_001);
    expect(metrics[0]).toMatchObject({ date: "2026-07-27", salesAmount: 10, orders: 1 });
  });
});
