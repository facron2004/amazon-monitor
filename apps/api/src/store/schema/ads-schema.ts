export const adsSchemaSql = `
CREATE TABLE IF NOT EXISTS ad_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  product_id INTEGER,
  metric_date TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  ad_group_name TEXT NOT NULL DEFAULT '',
  target_text TEXT NOT NULL DEFAULT '',
  search_term TEXT NOT NULL DEFAULT '',
  match_type TEXT,
  impressions INTEGER,
  clicks INTEGER,
  spend REAL,
  sales REAL,
  orders INTEGER,
  units_sold INTEGER,
  acos REAL,
  roas REAL,
  cpc REAL,
  ctr REAL,
  cvr REAL,
  budget REAL,
  budget_usage_rate REAL,
  data_source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'manual',
  sync_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, metric_date, campaign_id, ad_group_name, target_text, search_term),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_org_date ON ad_daily_metrics(org_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_product_date ON ad_daily_metrics(product_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_campaign ON ad_daily_metrics(campaign_id, campaign_name);
`;
