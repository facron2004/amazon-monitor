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

  it("persists a stable error code and retry count on a finished run", () => {
    const source = store.createDataSource({
      orgId: 1,
      name: "Observable SP-API",
      sourceType: "amazon_sp_api"
    });
    const run = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: source.id,
      operation: "sp_api_fba_inventory_incremental_sync",
      domain: "fba_inventory",
      mode: "incremental",
      marketplaces: ["US"]
    });

    store.finishDataSourceSyncRun(run.id, {
      status: "failed",
      totalRows: 0,
      importedRows: 0,
      failedRows: 0,
      createdRecords: 0,
      updatedRecords: 0,
      errorCode: "rate_limited",
      errorSummary: "SP-API is rate limited",
      retryCount: 2
    });

    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "failed",
      errorCode: "rate_limited",
      errorSummary: "SP-API is rate limited",
      retryCount: 2
    });

    store.finishDataSourceSyncRun(run.id, {
      status: "success",
      totalRows: 1,
      importedRows: 1,
      failedRows: 0,
      createdRecords: 1,
      updatedRecords: 0
    });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "success",
      errorCode: null,
      errorSummary: null,
      retryCount: 2
    });
  });

  it("persists checkpoints only for the owning organization and resumable run states", () => {
    const source = store.createDataSource({
      orgId: 1,
      name: "Checkpointed SP-API",
      sourceType: "amazon_sp_api"
    });
    const run = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: source.id,
      operation: "sp_api_fba_inventory_incremental_sync",
      domain: "fba_inventory",
      mode: "incremental",
      marketplaces: ["US"]
    });

    expect(store.setDataSourceSyncRunCheckpoint(run.id, 2, "wrong-org")).toBeNull();
    expect(store.setDataSourceSyncRunCheckpoint(run.id, 1, "pending-checkpoint")).toMatchObject({
      checkpointSummary: "pending-checkpoint",
      status: "pending"
    });

    store.finishDataSourceSyncRun(run.id, {
      status: "failed",
      totalRows: 0,
      importedRows: 0,
      failedRows: 0,
      createdRecords: 0,
      updatedRecords: 0,
      errorCode: "rate_limited",
      errorSummary: "retry",
      retryCount: 1
    });
    expect(store.setDataSourceSyncRunCheckpoint(run.id, 1, "failed-checkpoint")).toMatchObject({
      checkpointSummary: "failed-checkpoint",
      status: "failed"
    });

    store.finishDataSourceSyncRun(run.id, {
      status: "success",
      totalRows: 0,
      importedRows: 0,
      failedRows: 0,
      createdRecords: 0,
      updatedRecords: 0
    });
    expect(store.setDataSourceSyncRunCheckpoint(run.id, 1, "must-not-overwrite")).toMatchObject({
      checkpointSummary: "failed-checkpoint",
      status: "success"
    });
  });
});
