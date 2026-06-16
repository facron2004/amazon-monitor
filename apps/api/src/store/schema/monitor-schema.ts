export const monitorSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_keyword_monitor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  marketplace TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS amazon_bestseller_category_monitor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
`;
