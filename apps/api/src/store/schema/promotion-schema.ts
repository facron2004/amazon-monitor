export const promotionSchemaSql = `
CREATE TABLE IF NOT EXISTS promotion_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id INTEGER REFERENCES commerce_stores(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES own_products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  target_price REAL,
  budget REAL,
  inventory_target INTEGER,
  notes TEXT,
  preparation_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  review_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date >= start_date),
  CHECK (status IN ('planned', 'ready', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_promotion_plans_org_dates
  ON promotion_plans(org_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotion_plans_store
  ON promotion_plans(store_id, start_date);
CREATE INDEX IF NOT EXISTS idx_promotion_plans_product
  ON promotion_plans(product_id, start_date);
`;
