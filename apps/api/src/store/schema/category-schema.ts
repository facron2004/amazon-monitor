export const categorySchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_bestseller_rank_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  category_name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  rank_no INTEGER NOT NULL,
  asin TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT,
  image_url TEXT,
  product_url TEXT,
  current_price REAL,
  original_price REAL,
  coupon_text TEXT,
  coupon_value REAL,
  coupon_rate REAL,
  final_estimated_price REAL,
  currency TEXT,
  rating REAL,
  review_count INTEGER,
  ice_type TEXT,
  is_prime INTEGER DEFAULT 0,
  deal_badge TEXT,
  bsr_rank INTEGER,
  bsr_category TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bestseller_category_date ON amazon_bestseller_rank_snapshot(category_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_bestseller_asin_date ON amazon_bestseller_rank_snapshot(asin, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_bestseller_activity_calendar ON amazon_bestseller_rank_snapshot(asin, marketplace, snapshot_date, rank_no);
CREATE INDEX IF NOT EXISTS idx_bestseller_rank ON amazon_bestseller_rank_snapshot(category_id, rank_no);
CREATE INDEX IF NOT EXISTS idx_bestseller_category_date_rank ON amazon_bestseller_rank_snapshot(category_id, snapshot_date, rank_no);
CREATE INDEX IF NOT EXISTS idx_bestseller_promo_lookup ON amazon_bestseller_rank_snapshot(asin, marketplace, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_bestseller_asin_date_rank ON amazon_bestseller_rank_snapshot(asin, snapshot_date DESC, rank_no);
CREATE INDEX IF NOT EXISTS idx_bestseller_price_low_lookup ON amazon_bestseller_rank_snapshot(category_id, marketplace, asin, snapshot_date, current_price);

CREATE TABLE IF NOT EXISTS amazon_bsr_rank_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id INTEGER,
  source_name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  asin TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL,
  rank_no INTEGER NOT NULL,
  rank_url TEXT,
  product_url TEXT,
  current_price REAL,
  parent_rank INTEGER,
  is_specific_rank INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_date, source_type, source_id, asin, category)
);
CREATE INDEX IF NOT EXISTS idx_bsr_history_date ON amazon_bsr_rank_history(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_bsr_history_scope ON amazon_bsr_rank_history(source_type, source_id, snapshot_date, category);
CREATE INDEX IF NOT EXISTS idx_bsr_history_asin ON amazon_bsr_rank_history(asin, marketplace, category, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_bsr_history_scope_rank ON amazon_bsr_rank_history(source_type, source_id, snapshot_date DESC, category, rank_no);

CREATE TABLE IF NOT EXISTS amazon_bsr_snapshot_quality (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id INTEGER,
  source_name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  category TEXT NOT NULL,
  expected_count INTEGER,
  actual_count INTEGER NOT NULL,
  unique_asin_count INTEGER NOT NULL,
  unique_rank_count INTEGER NOT NULL DEFAULT 0,
  min_rank INTEGER,
  max_rank INTEGER,
  quality_status TEXT NOT NULL,
  issue TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_date, source_type, source_id, category)
);
CREATE INDEX IF NOT EXISTS idx_bsr_quality_date ON amazon_bsr_snapshot_quality(snapshot_date, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_bsr_quality_status ON amazon_bsr_snapshot_quality(quality_status, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_bsr_quality_scope_status ON amazon_bsr_snapshot_quality(snapshot_date, source_type, source_id, category, quality_status);
CREATE INDEX IF NOT EXISTS idx_bsr_quality_latest_ok ON amazon_bsr_snapshot_quality(source_type, source_id, quality_status, snapshot_date DESC, category);

CREATE TABLE IF NOT EXISTS amazon_product_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  title TEXT,
  brand TEXT,
  image_url TEXT,
  product_url TEXT,
  first_seen_date TEXT,
  first_seen_category TEXT,
  last_seen_date TEXT,
  latest_category_name TEXT,
  latest_rank INTEGER,
  latest_price REAL,
  rating REAL,
  review_count INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(asin, marketplace)
);

CREATE TABLE IF NOT EXISTS amazon_product_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  category_name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  asin TEXT NOT NULL,
  brand TEXT,
  title TEXT NOT NULL,
  current_price REAL,
  review_count INTEGER,
  previous_review_count INTEGER,
  review_count_change INTEGER,
  ice_type TEXT,
  coupon_text TEXT,
  coupon_value REAL,
  coupon_rate REAL,
  deal_badge TEXT,
  final_estimated_price REAL,
  t30_low_price REAL,
  t60_low_price REAL,
  t90_low_price REAL,
  monitoring_low_price REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_date, category_id, asin, marketplace)
);
CREATE INDEX IF NOT EXISTS idx_product_price_history_date ON amazon_product_price_history(snapshot_date, category_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_asin ON amazon_product_price_history(asin, marketplace, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_product_price_history_promo_lookup ON amazon_product_price_history(asin, marketplace, snapshot_date);

CREATE TABLE IF NOT EXISTS amazon_brand_matrix_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  category_name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  brand TEXT NOT NULL,
  product_count_top100 INTEGER DEFAULT 0,
  product_count_top50 INTEGER DEFAULT 0,
  product_count_top20 INTEGER DEFAULT 0,
  best_rank INTEGER,
  average_rank REAL,
  new_entry_count INTEGER DEFAULT 0,
  dropped_count INTEGER DEFAULT 0,
  rank_up_count INTEGER DEFAULT 0,
  rank_down_count INTEGER DEFAULT 0,
  price_down_count INTEGER DEFAULT 0,
  coupon_count INTEGER DEFAULT 0,
  deal_count INTEGER DEFAULT 0,
  top_asins_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, snapshot_date, brand)
);
CREATE INDEX IF NOT EXISTS idx_brand_matrix_category_date ON amazon_brand_matrix_snapshot(category_id, snapshot_date);

CREATE TABLE IF NOT EXISTS amazon_competitor_signal_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_date TEXT NOT NULL,
  source_type TEXT DEFAULT 'category',
  category_id INTEGER,
  category_name TEXT,
  marketplace TEXT,
  signal_type TEXT NOT NULL,
  alert_level TEXT,
  asin TEXT,
  brand TEXT,
  title TEXT,
  rank_no INTEGER,
  previous_rank INTEGER,
  price REAL,
  previous_price REAL,
  content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_signal_date ON amazon_competitor_signal_log(signal_date);
CREATE INDEX IF NOT EXISTS idx_signal_category ON amazon_competitor_signal_log(category_id, signal_date);
CREATE INDEX IF NOT EXISTS idx_signal_asin_date ON amazon_competitor_signal_log(asin, marketplace, signal_date);

CREATE TABLE IF NOT EXISTS amazon_competitor_activity_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_level TEXT,
  category_id INTEGER NOT NULL,
  category_name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  asin TEXT,
  brand TEXT,
  title TEXT,
  price_before REAL,
  price_after REAL,
  price_change_rate REAL,
  review_count_before INTEGER,
  review_count_after INTEGER,
  review_count_change INTEGER,
  coupon_before TEXT,
  coupon_after TEXT,
  deal_type TEXT,
  rank_before INTEGER,
  rank_after INTEGER,
  rank_change INTEGER,
  keyword_rank_before INTEGER,
  keyword_rank_after INTEGER,
  event_summary TEXT NOT NULL,
  possible_strategy TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_date, category_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_activity_event_date ON amazon_competitor_activity_event(event_date, category_id);
CREATE INDEX IF NOT EXISTS idx_activity_event_asin ON amazon_competitor_activity_event(asin, event_date);
CREATE INDEX IF NOT EXISTS idx_activity_event_brand ON amazon_competitor_activity_event(brand, event_date);

CREATE TABLE IF NOT EXISTS amazon_competitor_action_insight (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  insight_date TEXT NOT NULL,
  previous_date TEXT,
  source_type TEXT NOT NULL,
  source_id INTEGER,
  source_name TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  category TEXT NOT NULL,
  asin TEXT,
  brand TEXT,
  title TEXT,
  insight_type TEXT NOT NULL,
  confidence TEXT NOT NULL,
  current_rank INTEGER,
  previous_rank INTEGER,
  rank_change INTEGER,
  price REAL,
  product_url TEXT,
  evidence TEXT NOT NULL,
  inferred_action TEXT NOT NULL,
  suggested_response TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(insight_date, source_type, source_id, category, asin, insight_type)
);
CREATE INDEX IF NOT EXISTS idx_action_insight_date ON amazon_competitor_action_insight(insight_date, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_action_insight_asin ON amazon_competitor_action_insight(asin, insight_date);
CREATE INDEX IF NOT EXISTS idx_action_insight_type ON amazon_competitor_action_insight(insight_type, confidence);
`;
