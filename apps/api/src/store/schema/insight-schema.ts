export const insightSchemaSql = `
CREATE TABLE IF NOT EXISTS insight_events (
  id TEXT PRIMARY KEY,
  org_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id),
  event_date TEXT NOT NULL,
  asin TEXT,
  brand TEXT,
  category_id INTEGER,
  keyword_id INTEGER,
  event_type TEXT NOT NULL,
  event_level TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_summary TEXT NOT NULL,
  attribution_tags_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  score_total INTEGER NOT NULL,
  score_level TEXT NOT NULL,
  score_breakdown_json TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'TODO',
  assignee TEXT,
  review_due_date TEXT,
  review_result TEXT,
  user_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_insight_events_date ON insight_events(event_date);
CREATE INDEX IF NOT EXISTS idx_insight_events_org_date ON insight_events(org_id, event_date);
CREATE INDEX IF NOT EXISTS idx_insight_events_asin ON insight_events(asin);
CREATE INDEX IF NOT EXISTS idx_insight_events_brand ON insight_events(brand);
CREATE INDEX IF NOT EXISTS idx_insight_events_category ON insight_events(category_id, event_date);
CREATE INDEX IF NOT EXISTS idx_insight_events_type ON insight_events(event_type, event_date);
CREATE INDEX IF NOT EXISTS idx_insight_events_level ON insight_events(event_level);
CREATE INDEX IF NOT EXISTS idx_insight_events_status ON insight_events(status);
CREATE INDEX IF NOT EXISTS idx_insight_events_review_due ON insight_events(review_due_date);

CREATE TABLE IF NOT EXISTS insight_event_notes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES insight_events(id)
);
CREATE INDEX IF NOT EXISTS idx_insight_event_notes_event ON insight_event_notes(event_id, created_at);

CREATE TABLE IF NOT EXISTS asin_watch_states (
  org_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id),
  asin TEXT NOT NULL,
  watch_level TEXT NOT NULL DEFAULT 'NORMAL',
  watch_reason TEXT,
  first_watch_date TEXT NOT NULL,
  last_event_date TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, asin)
);
CREATE INDEX IF NOT EXISTS idx_asin_watch_states_level ON asin_watch_states(org_id, watch_level);
CREATE INDEX IF NOT EXISTS idx_asin_watch_states_last_event ON asin_watch_states(org_id, last_event_date);

-- 复盘 evaluator 的 in-flight claim 跟踪表
-- evaluator 在事务里 INSERT OR IGNORE 此表来原子地认领一批 due events,
-- 防止两个并发 evaluator 实例或 worker 重启后重复评同一批。
-- claimed_at 超过 1 小时视为 stale,会在下一次 claim 时被覆盖。
CREATE TABLE IF NOT EXISTS insight_review_claims (
  event_id TEXT PRIMARY KEY,
  claimed_at TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES insight_events(id)
);
CREATE INDEX IF NOT EXISTS idx_insight_review_claims_claim ON insight_review_claims(claim_id);
CREATE INDEX IF NOT EXISTS idx_insight_review_claims_claimed_at ON insight_review_claims(claimed_at);
`;
