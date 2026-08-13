export const dataSourceSchemaSql = `
CREATE TABLE IF NOT EXISTS data_source_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  marketplace TEXT,
  status TEXT NOT NULL DEFAULT 'not_connected',
  sync_status TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  last_success_at TEXT,
  sync_error TEXT,
  owner_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, name),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_data_sources_org_type ON data_source_configs(org_id, source_type);
CREATE INDEX IF NOT EXISTS idx_data_sources_org_status ON data_source_configs(org_id, status);

CREATE TABLE IF NOT EXISTS sp_api_connections (
  data_source_id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  region TEXT NOT NULL,
  credential_version INTEGER NOT NULL,
  key_version TEXT NOT NULL,
  credentials_ciphertext TEXT NOT NULL,
  credentials_iv TEXT NOT NULL,
  credentials_auth_tag TEXT NOT NULL,
  last_tested_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sp_api_connections_org_region
  ON sp_api_connections(org_id, region);

CREATE TABLE IF NOT EXISTS sp_api_connection_stores (
  data_source_id INTEGER NOT NULL,
  commerce_store_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (data_source_id, commerce_store_id),
  FOREIGN KEY (data_source_id) REFERENCES sp_api_connections(data_source_id) ON DELETE CASCADE,
  FOREIGN KEY (commerce_store_id) REFERENCES commerce_stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sp_api_connection_stores_store
  ON sp_api_connection_stores(commerce_store_id, data_source_id);

CREATE TABLE IF NOT EXISTS data_source_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  data_source_id INTEGER NOT NULL,
  operation TEXT NOT NULL,
  domain TEXT,
  trigger TEXT,
  mode TEXT,
  idempotency_key TEXT,
  credential_version INTEGER,
  marketplaces_json TEXT NOT NULL DEFAULT '[]',
  requested_from_date TEXT,
  requested_to_date TEXT,
  checkpoint_summary TEXT,
  external_request_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  created_records INTEGER NOT NULL DEFAULT 0,
  updated_records INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_summary TEXT,
  initiated_by_id INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (initiated_by_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_data_source_runs_source_started
  ON data_source_sync_runs(org_id, data_source_id, started_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_source_runs_idempotency
  ON data_source_sync_runs(data_source_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS data_source_domain_health (
  org_id INTEGER NOT NULL,
  data_source_id INTEGER NOT NULL,
  commerce_store_id INTEGER NOT NULL,
  marketplace TEXT NOT NULL,
  domain TEXT NOT NULL,
  status TEXT NOT NULL,
  last_attempt_at TEXT,
  last_success_at TEXT,
  source_time TEXT,
  error_code TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (data_source_id, commerce_store_id, marketplace, domain),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (commerce_store_id) REFERENCES commerce_stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_source_domain_health_org_source
  ON data_source_domain_health(org_id, data_source_id, domain, marketplace);

CREATE TABLE IF NOT EXISTS data_source_mapping_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  data_source_id INTEGER NOT NULL,
  commerce_store_id INTEGER NOT NULL,
  marketplace TEXT NOT NULL,
  domain TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  seller_sku TEXT NOT NULL DEFAULT '',
  source_asin TEXT NOT NULL DEFAULT '',
  candidate_product_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  first_seen_run_id INTEGER,
  last_seen_run_id INTEGER,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  resolution_note TEXT,
  resolved_product_id INTEGER,
  resolved_by_id INTEGER,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(data_source_id, commerce_store_id, marketplace, domain, issue_type, seller_sku, source_asin),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (commerce_store_id) REFERENCES commerce_stores(id) ON DELETE CASCADE,
  FOREIGN KEY (first_seen_run_id) REFERENCES data_source_sync_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (last_seen_run_id) REFERENCES data_source_sync_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_product_id) REFERENCES own_products(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_data_source_mapping_issues_list
  ON data_source_mapping_issues(org_id, data_source_id, status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS data_source_override_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  data_source_id INTEGER NOT NULL,
  sync_run_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  field_name TEXT NOT NULL,
  previous_data_source_id INTEGER NOT NULL,
  previous_sync_run_id INTEGER NOT NULL,
  previous_value REAL,
  new_value REAL,
  overridden_by_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  restore_on_sp_api_success INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (sync_run_id) REFERENCES data_source_sync_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE CASCADE,
  FOREIGN KEY (previous_data_source_id) REFERENCES data_source_configs(id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_sync_run_id) REFERENCES data_source_sync_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (overridden_by_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_data_source_override_audits_list
  ON data_source_override_audits(org_id, data_source_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_data_source_override_audits_product
  ON data_source_override_audits(org_id, product_id, effective_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_data_source_override_audits_product_date
  ON data_source_override_audits(product_id, effective_date, domain, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_data_source_override_audits_effective_window
  ON data_source_override_audits(org_id, domain, effective_date, product_id, field_name, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS sp_api_sales_traffic_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  data_source_id INTEGER NOT NULL,
  sync_run_id INTEGER NOT NULL,
  commerce_store_id INTEGER NOT NULL,
  marketplace TEXT NOT NULL,
  business_date TEXT NOT NULL,
  seller_sku TEXT NOT NULL,
  product_id INTEGER,
  asin TEXT,
  scope TEXT NOT NULL,
  sessions INTEGER,
  page_views INTEGER,
  orders INTEGER,
  units_sold INTEGER,
  sales_amount REAL,
  buy_box_percentage REAL,
  conversion_rate REAL,
  currency TEXT NOT NULL,
  source_time TEXT,
  source_document_id TEXT,
  content_hash TEXT,
  synced_at TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(commerce_store_id, marketplace, seller_sku, business_date, scope),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (sync_run_id) REFERENCES data_source_sync_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (commerce_store_id) REFERENCES commerce_stores(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_api_sales_traffic_org_date
  ON sp_api_sales_traffic_daily(org_id, commerce_store_id, marketplace, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_sp_api_sales_traffic_effective_scope_date
  ON sp_api_sales_traffic_daily(org_id, scope, status, business_date, product_id, commerce_store_id, marketplace);
CREATE INDEX IF NOT EXISTS idx_sp_api_sales_traffic_effective_product_date
  ON sp_api_sales_traffic_daily(org_id, product_id, business_date, scope, status);

CREATE TABLE IF NOT EXISTS sp_api_inventory_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  data_source_id INTEGER NOT NULL,
  sync_run_id INTEGER NOT NULL,
  commerce_store_id INTEGER NOT NULL,
  marketplace TEXT NOT NULL,
  seller_sku TEXT NOT NULL,
  product_id INTEGER,
  asin TEXT,
  fulfillable_quantity INTEGER,
  reserved_quantity INTEGER,
  inbound_working_quantity INTEGER,
  inbound_shipped_quantity INTEGER,
  inbound_receiving_quantity INTEGER,
  inbound_quantity INTEGER,
  unfulfillable_quantity INTEGER,
  total_quantity INTEGER,
  source_time TEXT,
  source_document_id TEXT,
  content_hash TEXT,
  synced_at TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(sync_run_id, marketplace, seller_sku),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (sync_run_id) REFERENCES data_source_sync_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (commerce_store_id) REFERENCES commerce_stores(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_api_inventory_snapshots_org_run
  ON sp_api_inventory_snapshots(org_id, sync_run_id, marketplace, seller_sku);

CREATE TABLE IF NOT EXISTS sp_api_inventory_latest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  data_source_id INTEGER NOT NULL,
  sync_run_id INTEGER NOT NULL,
  commerce_store_id INTEGER NOT NULL,
  marketplace TEXT NOT NULL,
  seller_sku TEXT NOT NULL,
  product_id INTEGER,
  asin TEXT,
  fulfillable_quantity INTEGER,
  reserved_quantity INTEGER,
  inbound_working_quantity INTEGER,
  inbound_shipped_quantity INTEGER,
  inbound_receiving_quantity INTEGER,
  inbound_quantity INTEGER,
  unfulfillable_quantity INTEGER,
  total_quantity INTEGER,
  source_time TEXT,
  source_document_id TEXT,
  content_hash TEXT,
  synced_at TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(commerce_store_id, marketplace, seller_sku),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (sync_run_id) REFERENCES data_source_sync_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (commerce_store_id) REFERENCES commerce_stores(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_api_inventory_latest_org_marketplace
  ON sp_api_inventory_latest(org_id, commerce_store_id, marketplace, seller_sku);
`;
