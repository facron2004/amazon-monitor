export const reviewVocSchemaSql = `
CREATE TABLE IF NOT EXISTS own_product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  review_date TEXT NOT NULL,
  external_review_id TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reviewer_name TEXT,
  variant TEXT,
  verified_purchase INTEGER NOT NULL DEFAULT 0,
  helpful_votes INTEGER,
  sentiment TEXT NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '[]',
  data_source TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'manual',
  sync_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, review_date, external_review_id, title, body),
  FOREIGN KEY (product_id) REFERENCES own_products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_own_product_reviews_product_date ON own_product_reviews(product_id, review_date DESC);
CREATE INDEX IF NOT EXISTS idx_own_product_reviews_sentiment ON own_product_reviews(sentiment, review_date DESC);
`;
