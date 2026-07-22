import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";
import type { AlertLog } from "@amazon-monitor/shared";

function buildAlert(overrides: Partial<AlertLog> = {}): AlertLog {
  return {
    alertDate: "2026-07-18",
    alertType: "rank_up",
    alertLevel: "high",
    keyword: "ice maker",
    asin: "B0ALERT01",
    title: "Sample product",
    brand: "BrandX",
    alertContent: "Rank improved",
    oldValue: "48",
    newValue: "12",
    status: "pending",
    ...overrides
  };
}

describe("alert re-run idempotency", () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("replaces alerts for the same keyword and date on re-run", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);

    store.insertAlerts([
      buildAlert({ asin: "B0OLD001", alertContent: "first run" }),
      buildAlert({ asin: "B0OLD002", alertContent: "first run" })
    ]);
    expect(store.listAlerts({ date: "2026-07-18", keyword: "ice maker" })).toHaveLength(2);

    store.deleteAlertsForKeywordDate("ice maker", "2026-07-18");
    store.insertAlerts([
      buildAlert({ asin: "B0NEW001", alertContent: "second run" })
    ]);

    const alerts = store.listAlerts({ date: "2026-07-18", keyword: "ice maker" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.asin).toBe("B0NEW001");
    expect(alerts[0]?.alertContent).toBe("second run");
  });

  it("does not delete alerts for other keywords or dates", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);

    store.insertAlerts([
      buildAlert({ keyword: "ice maker", alertDate: "2026-07-18" }),
      buildAlert({ keyword: "ice maker", alertDate: "2026-07-17", asin: "B0OTHER" }),
      buildAlert({ keyword: "portable ice", alertDate: "2026-07-18", asin: "B0OTHER2" })
    ]);

    store.deleteAlertsForKeywordDate("ice maker", "2026-07-18");

    expect(store.listAlerts({ keyword: "ice maker", date: "2026-07-18" })).toHaveLength(0);
    expect(store.listAlerts({ keyword: "ice maker", date: "2026-07-17" })).toHaveLength(1);
    expect(store.listAlerts({ keyword: "portable ice", date: "2026-07-18" })).toHaveLength(1);
  });
});