export const inventorySchemaSql = `
CREATE TABLE IF NOT EXISTS product_inventory_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL UNIQUE,
  lead_time_days REAL NOT NULL DEFAULT 21,
  production_lead_time_days REAL,
  inbound_lead_time_days REAL,
  safety_stock_days REAL NOT NULL DEFAULT 14,
  target_stock_days REAL NOT NULL DEFAULT 60,
  min_order_quantity INTEGER,
  pack_size INTEGER,
  supplier_name TEXT,
  reorder_point_units INTEGER,
  in_transit_units INTEGER,
  local_warehouse_units INTEGER,
  expected_arrival_date TEXT,
  data_source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'manual',
  sync_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_inventory_settings_product ON product_inventory_settings(product_id);
`;
