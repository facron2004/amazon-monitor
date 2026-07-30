import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";
import { encryptSpApiCredentials } from "./sp-api-credentials.js";
import { enqueueScheduledSpApiSyncs } from "./sp-api-scheduler.js";

let db: DatabaseSync;
let store: Store;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 9).toString("base64");
});

afterEach(() => {
  db.close();
});

describe("SP-API scheduler", () => {
  it("queues one idempotent D-1 Sales run per linked marketplace", () => {
    const source = setupConnectedSource();
    const now = new Date("2026-07-28T12:10:00.000Z");

    expect(enqueueScheduledSpApiSyncs(store, "sales_daily", now)).toBe(1);
    expect(enqueueScheduledSpApiSyncs(store, "sales_daily", now)).toBe(1);

    expect(store.listDataSourceSyncRuns({ orgId: 1, dataSourceId: source.id })).toEqual([
      expect.objectContaining({
        operation: "sp_api_sales_traffic_daily_sync",
        domain: "sales_traffic",
        mode: "incremental",
        marketplaces: ["US"],
        requestedFromDate: "2026-07-27",
        requestedToDate: "2026-07-27"
      })
    ]);
    expect(queueCount()).toBe(1);
  });

  it("uses a 30-minute FBA bucket and a daily full-reconcile idempotency window", () => {
    const source = setupConnectedSource();
    const now = new Date("2026-07-28T12:44:00.000Z");

    expect(enqueueScheduledSpApiSyncs(store, "fba_incremental", now)).toBe(1);
    expect(enqueueScheduledSpApiSyncs(store, "fba_incremental", new Date("2026-07-28T12:59:00.000Z"))).toBe(1);
    expect(enqueueScheduledSpApiSyncs(store, "fba_full", now)).toBe(1);

    expect(store.listDataSourceSyncRuns({ orgId: 1, dataSourceId: source.id })).toEqual([
      expect.objectContaining({ operation: "sp_api_fba_inventory_full_reconcile", mode: "full" }),
      expect.objectContaining({ operation: "sp_api_fba_inventory_incremental_sync", mode: "incremental" })
    ]);
    expect(queueCount()).toBe(2);
  });
});

function setupConnectedSource() {
  const source = store.createDataSource({
    orgId: 1,
    name: `Scheduled source ${Date.now()}`,
    sourceType: "amazon_sp_api",
    status: "connected"
  });
  const commerceStore = store.createCommerceStore({
    orgId: 1,
    name: "Scheduled US store",
    marketplace: "amazon.com",
    sellerId: "SCHEDULED-SELLER"
  });
  store.replaceSpApiConnection({
    orgId: 1,
    dataSourceId: source.id,
    region: "NA",
    commerceStoreIds: [commerceStore.id],
    encryptedCredentials: encryptSpApiCredentials({
      lwaClientId: "scheduler-client",
      lwaClientSecret: "scheduler-secret",
      lwaRefreshToken: "scheduler-refresh"
    }, { orgId: 1, dataSourceId: source.id })
  });
  return source;
}

function queueCount(): number {
  return (db.prepare(
    "SELECT COUNT(*) AS count FROM amazon_collect_job_queue WHERE org_id = ? AND task_type = ?"
  ).get(1, "data_source_sync") as { count: number }).count;
}
