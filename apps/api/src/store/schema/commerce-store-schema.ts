export const commerceStoreSchemaSql = `
CREATE TABLE IF NOT EXISTS commerce_stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'amazon',
  marketplace TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  auth_status TEXT NOT NULL DEFAULT 'not_connected',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, platform, marketplace, seller_id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_commerce_stores_org_status ON commerce_stores(org_id, status);
CREATE INDEX IF NOT EXISTS idx_commerce_stores_org_marketplace ON commerce_stores(org_id, marketplace);
`;
