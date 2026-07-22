import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";

describe("keyword priority migration", () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("adds the priority column to legacy keyword tables and persists updates", () => {
    db = new DatabaseSync(":memory:");
    db.exec(`
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
    `);

    initSchema(db);
    const store = createStore(db);
    const keyword = store.createKeyword({
      keyword: "nugget ice maker",
      marketplace: "amazon.com",
      priority: "S"
    });
    expect(keyword.priority).toBe("S");
    expect(store.updateKeyword(keyword.id, { priority: "A" }).priority).toBe("A");
  });
});
