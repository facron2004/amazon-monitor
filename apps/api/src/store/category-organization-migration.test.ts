import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";

describe("category organization migration", () => {
  it("backfills legacy category monitors to the default organization", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE amazon_bestseller_category_monitor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      category_url TEXT NOT NULL,
      status INTEGER DEFAULT 1
    );
    INSERT INTO amazon_bestseller_category_monitor (name, marketplace, category_url)
    VALUES ('Legacy Ice Makers', 'amazon.com', 'https://www.amazon.com/Best-Sellers/zgbs');`);

    initSchema(db);
    const category = createStore(db).getCategoryMonitor(1, 1);
    expect(category).toMatchObject({ id: 1, orgId: 1, name: "Legacy Ice Makers" });
  });
});
