import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";
import type { Store } from "./types.js";

let db: DatabaseSync;
let store: Store;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
});

afterEach(() => {
  db.close();
});

describe("data source sync runs", () => {
  it("returns the existing run for a repeated idempotency key", () => {
    const source = store.createDataSource({
      orgId: 1,
      name: "Idempotent EU SP-API",
      sourceType: "amazon_sp_api"
    });
    const input = {
      orgId: 1,
      dataSourceId: source.id,
      operation: "sp_api_sales_traffic_daily_sync" as const,
      domain: "sales_traffic" as const,
      trigger: "scheduled" as const,
      mode: "incremental" as const,
      marketplaces: ["UK"],
      requestedFromDate: "2026-07-27",
      requestedToDate: "2026-07-27",
      idempotencyKey: "source-1:sales_traffic:UK:2026-07-27:window-001"
    };

    const first = store.createDataSourceSyncRun(input);
    const second = store.createDataSourceSyncRun(input);

    expect(second).toMatchObject({ id: first.id, idempotencyKey: input.idempotencyKey });
    expect(store.listDataSourceSyncRuns({ orgId: 1, dataSourceId: source.id })).toHaveLength(1);
  });
});
