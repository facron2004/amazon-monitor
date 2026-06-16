export const keywordSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_keyword_serp_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  page_no INTEGER,
  position_in_page INTEGER,
  absolute_rank INTEGER,
  organic_rank INTEGER,
  sponsored_rank INTEGER,
  asin TEXT,
  title TEXT,
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
  is_sponsored INTEGER DEFAULT 0,
  is_prime INTEGER DEFAULT 0,
  deal_badge TEXT,
  delivery_text TEXT,
  bsr_rank INTEGER,
  bsr_category TEXT,
  bsr_text TEXT,
  bestseller_ranks_json TEXT,
  detail_collected_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_keyword_date ON amazon_keyword_serp_snapshot(keyword_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_asin_date ON amazon_keyword_serp_snapshot(asin, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_keyword_activity_calendar ON amazon_keyword_serp_snapshot(asin, marketplace, snapshot_date, absolute_rank);
CREATE INDEX IF NOT EXISTS idx_keyword_competitor_lookup ON amazon_keyword_serp_snapshot(asin, marketplace, keyword_id, keyword);
CREATE INDEX IF NOT EXISTS idx_keyword_rank ON amazon_keyword_serp_snapshot(keyword_id, absolute_rank);
CREATE INDEX IF NOT EXISTS idx_keyword_promo_lookup ON amazon_keyword_serp_snapshot(asin, marketplace, snapshot_date, absolute_rank);
CREATE INDEX IF NOT EXISTS idx_keyword_link_lookup ON amazon_keyword_serp_snapshot(asin, keyword_id, snapshot_date DESC, absolute_rank);

CREATE TABLE IF NOT EXISTS amazon_competitor_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  title TEXT,
  brand TEXT,
  image_url TEXT,
  first_seen_keyword TEXT,
  first_seen_date TEXT,
  last_seen_date TEXT,
  appear_keyword_count INTEGER DEFAULT 0,
  best_rank INTEGER,
  latest_rank INTEGER,
  lowest_price REAL,
  latest_price REAL,
  latest_review_count INTEGER,
  latest_product_url TEXT,
  coupon_text TEXT,
  deal_badge TEXT,
  latest_bsr_rank INTEGER,
  latest_bsr_category TEXT,
  latest_bsr_text TEXT,
  latest_bestseller_ranks_json TEXT,
  source_type TEXT DEFAULT 'keyword',
  first_seen_source TEXT,
  latest_category_name TEXT,
  latest_category_rank INTEGER,
  ice_type TEXT,
  competitor_tier TEXT DEFAULT 'watch',
  competitor_reasons_json TEXT,
  is_key_competitor INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(asin, marketplace)
);
CREATE INDEX IF NOT EXISTS idx_competitor_pool_source_tier ON amazon_competitor_pool(source_type, competitor_tier, latest_category_rank);
CREATE INDEX IF NOT EXISTS idx_competitor_pool_rank ON amazon_competitor_pool(status, is_key_competitor, latest_category_rank, latest_bsr_rank, latest_rank);
`;
