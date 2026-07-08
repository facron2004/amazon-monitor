export const productSchemaSql = `
CREATE TABLE IF NOT EXISTS own_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  marketplace TEXT NOT NULL,
  sku TEXT NOT NULL,
  asin TEXT NOT NULL,
  brand TEXT,
  title TEXT NOT NULL,
  image_url TEXT,
  category TEXT,
  owner_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  data_source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'manual',
  sync_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, marketplace, sku),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_own_products_org_status ON own_products(org_id, status);
CREATE INDEX IF NOT EXISTS idx_own_products_asin ON own_products(asin, marketplace);
CREATE INDEX IF NOT EXISTS idx_own_products_owner ON own_products(owner_id);

CREATE TABLE IF NOT EXISTS own_product_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  metric_date TEXT NOT NULL,
  sessions INTEGER,
  page_views INTEGER,
  orders INTEGER,
  units_sold INTEGER,
  sales_amount REAL,
  buy_box_percentage REAL,
  conversion_rate REAL,
  rating REAL,
  review_count INTEGER,
  bsr_rank INTEGER,
  inventory_available INTEGER,
  inventory_days REAL,
  ad_spend REAL,
  ad_sales REAL,
  acos REAL,
  tacos REAL,
  gross_margin REAL,
  keyword_rank INTEGER,
  data_source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'manual',
  sync_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, metric_date),
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_own_product_metrics_product_date ON own_product_daily_metrics(product_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_own_product_metrics_date ON own_product_daily_metrics(metric_date);

CREATE TABLE IF NOT EXISTS own_product_listing_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  snapshot_date TEXT NOT NULL,
  title TEXT NOT NULL,
  bullet_points_json TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  image_urls_json TEXT NOT NULL DEFAULT '[]',
  core_keywords_json TEXT NOT NULL DEFAULT '[]',
  review_highlights_json TEXT NOT NULL DEFAULT '[]',
  qa_gaps_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT,
  data_source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'manual',
  sync_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, snapshot_date),
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_own_listing_snapshots_product_date ON own_product_listing_snapshots(product_id, snapshot_date DESC);
`;
