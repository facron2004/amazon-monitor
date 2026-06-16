export const metadataSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_schema_metadata (
  metadata_key TEXT PRIMARY KEY,
  metadata_value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;
