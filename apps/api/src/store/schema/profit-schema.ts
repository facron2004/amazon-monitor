export const profitSchemaSql = `
CREATE TABLE IF NOT EXISTS product_profit_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL UNIQUE REFERENCES own_products(id) ON DELETE CASCADE,
  purchase_cost REAL,
  inbound_freight REAL,
  fba_fee REAL,
  referral_fee_rate REAL NOT NULL DEFAULT 0.15,
  storage_fee REAL,
  return_loss_rate REAL NOT NULL DEFAULT 0.03,
  target_margin_rate REAL NOT NULL DEFAULT 0.30,
  minimum_margin_rate REAL NOT NULL DEFAULT 0.20,
  deal_fee REAL,
  data_source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'manual',
  sync_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_profit_settings_product
  ON product_profit_settings(product_id);
`;
