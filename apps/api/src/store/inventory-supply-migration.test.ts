import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";

describe("inventory supply migration", () => {
  it("adds supply-chain fields while preserving legacy replenishment settings", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE product_inventory_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE,
      lead_time_days REAL NOT NULL DEFAULT 21,
      safety_stock_days REAL NOT NULL DEFAULT 14,
      target_stock_days REAL NOT NULL DEFAULT 60,
      min_order_quantity INTEGER,
      pack_size INTEGER,
      supplier_name TEXT,
      reorder_point_units INTEGER,
      data_source TEXT NOT NULL DEFAULT 'manual',
      last_synced_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'manual',
      sync_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO product_inventory_settings (
      product_id, lead_time_days, safety_stock_days, target_stock_days,
      supplier_name, created_at, updated_at
    ) VALUES (99, 28, 10, 75, 'Legacy supplier', '2026-07-01', '2026-07-01');`);

    initSchema(db);
    const setting = createStore(db).getInventorySetting(99);

    expect(setting).toMatchObject({
      productId: 99,
      leadTimeDays: 28,
      safetyStockDays: 10,
      targetStockDays: 75,
      supplierName: "Legacy supplier",
      productionLeadTimeDays: null,
      inboundLeadTimeDays: null,
      inTransitUnits: null,
      localWarehouseUnits: null,
      expectedArrivalDate: null
    });
    db.close();
  });
});
