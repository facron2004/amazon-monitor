import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const UPGRADE_MARKER_TABLE = "__amazon_monitor_package_upgrade_smoke";

export function createLegacyDatabaseFixture(databasePath, marker) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec(`
      CREATE TABLE amazon_keyword_monitor (
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
      INSERT INTO amazon_keyword_monitor
        (keyword, marketplace) VALUES ('legacy-upgrade-fixture', 'amazon.com');
      CREATE TABLE amazon_bestseller_category_monitor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        marketplace TEXT NOT NULL,
        category_url TEXT NOT NULL,
        status INTEGER DEFAULT 1
      );
      INSERT INTO amazon_bestseller_category_monitor
        (name, marketplace, category_url)
        VALUES ('Legacy Upgrade Fixture', 'amazon.com', 'https://www.amazon.com/Best-Sellers/zgbs');
      CREATE TABLE ${UPGRADE_MARKER_TABLE} (marker TEXT NOT NULL);
    `);
    database.prepare(
      `INSERT INTO ${UPGRADE_MARKER_TABLE} (marker) VALUES (?)`,
    ).run(marker);
  } finally {
    database.close();
  }
}

export function readUpgradeMarker(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare(
      `SELECT marker FROM ${UPGRADE_MARKER_TABLE} LIMIT 1`,
    ).get();
    return row && typeof row.marker === "string" ? row.marker : undefined;
  } finally {
    database.close();
  }
}

export function readLegacySchemaEvidence(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const keywordColumns = database.prepare(
      "PRAGMA table_info(amazon_keyword_monitor)",
    ).all().map((column) => column.name);
    const categoryColumns = database.prepare(
      "PRAGMA table_info(amazon_bestseller_category_monitor)",
    ).all().map((column) => column.name);
    const keyword = database.prepare(
      "SELECT priority, org_id FROM amazon_keyword_monitor WHERE keyword = ? LIMIT 1",
    ).get("legacy-upgrade-fixture");
    const category = database.prepare(
      "SELECT org_id FROM amazon_bestseller_category_monitor WHERE name = ? LIMIT 1",
    ).get("Legacy Upgrade Fixture");
    const evidence = {
      keywordColumns,
      keywordPriority: keyword?.priority,
      keywordOrgId: keyword?.org_id,
      categoryColumns,
      categoryOrgId: category?.org_id,
    };
    if (
      !keywordColumns.includes("priority")
      || !keywordColumns.includes("org_id")
      || evidence.keywordPriority !== "C"
      || evidence.keywordOrgId !== 1
      || !categoryColumns.includes("org_id")
      || evidence.categoryOrgId !== 1
    ) {
      throw new Error(`Legacy schema fixture was not migrated: ${JSON.stringify(evidence)}`);
    }
    return evidence;
  } finally {
    database.close();
  }
}
