export const operationalSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_competitor_daily_change (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL,
  keyword TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  yesterday_rank INTEGER,
  today_rank INTEGER,
  rank_change INTEGER,
  yesterday_price REAL,
  today_price REAL,
  price_change REAL,
  price_change_rate REAL,
  yesterday_sponsored INTEGER,
  today_sponsored INTEGER,
  change_type TEXT,
  title TEXT,
  brand TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asin_keyword_date ON amazon_competitor_daily_change(asin, keyword, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_change_activity_calendar ON amazon_competitor_daily_change(asin, marketplace, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_change_date_keyword ON amazon_competitor_daily_change(snapshot_date, keyword, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS amazon_alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_date TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  alert_level TEXT,
  keyword TEXT,
  asin TEXT,
  title TEXT,
  brand TEXT,
  alert_content TEXT,
  old_value TEXT,
  new_value TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_alert_date ON amazon_alert_log(alert_date);
CREATE INDEX IF NOT EXISTS idx_alert_date_status ON amazon_alert_log(alert_date, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_alert_date_keyword_status ON amazon_alert_log(alert_date, keyword, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_alert_asin ON amazon_alert_log(asin);
CREATE INDEX IF NOT EXISTS idx_alert_type ON amazon_alert_log(alert_type);

CREATE TABLE IF NOT EXISTS amazon_collect_task_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT,
  keyword_id INTEGER,
  keyword TEXT,
  marketplace TEXT,
  status TEXT,
  start_time TEXT,
  end_time TEXT,
  page_count INTEGER,
  success_count INTEGER,
  fail_count INTEGER,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS amazon_daily_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  keyword TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(report_date, keyword)
);

CREATE TABLE IF NOT EXISTS amazon_category_daily_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  markdown TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(report_date, category_id)
);
`;
