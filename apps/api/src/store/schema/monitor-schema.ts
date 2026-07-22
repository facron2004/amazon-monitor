export const monitorSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_keyword_monitor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL DEFAULT 1,
  keyword TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'C',
  zip_code TEXT,
  language TEXT,
  category_tag TEXT,
  crawl_pages INTEGER DEFAULT 3,
  status INTEGER DEFAULT 1,
  last_collected_at TEXT,
  today_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_keyword_monitor_org_status ON amazon_keyword_monitor(org_id, status, id);

CREATE TABLE IF NOT EXISTS amazon_bestseller_category_monitor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  category_url TEXT NOT NULL,
  category_path TEXT,
  crawl_top_n INTEGER DEFAULT 100,
  status INTEGER DEFAULT 1,
  last_collected_at TEXT,
  today_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_category_monitor_org_status ON amazon_bestseller_category_monitor(org_id, status, id);
`;
