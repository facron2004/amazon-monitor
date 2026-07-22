import { DatabaseSync } from "node:sqlite";
import type { AlertLog, DailyChange } from "@amazon-monitor/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("keyword operational organization scope", () => {
  it("isolates alerts, status changes, daily changes, dashboard counts, and keyword reports", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const firstOrg = store.createOrganization({ name: "First alert team" });
    const secondOrg = store.createOrganization({ name: "Second alert team" });
    store.createUser({ orgId: firstOrg.id, username: "first-alert", password: "password-1234", role: "operator" });
    store.createUser({ orgId: secondOrg.id, username: "second-alert", password: "password-1234", role: "operator" });

    store.insertAlerts([alert("FIRST-ASIN", "First alert")], firstOrg.id);
    store.insertAlerts([alert("SECOND-ASIN", "Second alert")], secondOrg.id);
    store.insertDailyChanges([change("FIRST-ASIN", "First change")], firstOrg.id);
    store.insertDailyChanges([change("SECOND-ASIN", "Second change")], secondOrg.id);
    store.saveDailyReport("2026-07-18", "ice maker", "# First keyword report", firstOrg.id);
    store.saveDailyReport("2026-07-18", "ice maker", "# Second keyword report", secondOrg.id);

    const app = createApiApp(store);
    const firstApi = request.agent(app);
    const secondApi = request.agent(app);
    await firstApi.post("/api/auth/login").send({ username: "first-alert", password: "password-1234" }).expect(200);
    await secondApi.post("/api/auth/login").send({ username: "second-alert", password: "password-1234" }).expect(200);

    const firstAlerts = await firstApi.get("/api/alerts?date=2026-07-18").expect(200);
    const secondAlerts = await secondApi.get("/api/alerts?date=2026-07-18").expect(200);
    expect(firstAlerts.body).toEqual([expect.objectContaining({ orgId: firstOrg.id, asin: "FIRST-ASIN" })]);
    expect(secondAlerts.body).toEqual([expect.objectContaining({ orgId: secondOrg.id, asin: "SECOND-ASIN" })]);

    const secondAlertId = secondAlerts.body[0].id as number;
    await firstApi.patch(`/api/alerts/${secondAlertId}/status`).send({ status: "followed" }).expect(404);
    await secondApi.patch(`/api/alerts/${secondAlertId}/status`).send({ status: "followed" }).expect(200);
    expect((await firstApi.get("/api/changes?date=2026-07-18").expect(200)).body[0].asin).toBe("FIRST-ASIN");
    expect((await secondApi.get("/api/changes?date=2026-07-18").expect(200)).body[0].asin).toBe("SECOND-ASIN");

    const firstReport = await firstApi.get("/api/reports/daily?date=2026-07-18&keyword=ice%20maker").expect(200);
    const secondReport = await secondApi.get("/api/reports/daily?date=2026-07-18&keyword=ice%20maker").expect(200);
    expect(firstReport.body.markdown).toBe("# First keyword report");
    expect(secondReport.body.markdown).toBe("# Second keyword report");
    expect((await firstApi.get("/api/dashboard/summary?date=2026-07-18").expect(200)).body.alertCount).toBe(1);
    expect((await secondApi.get("/api/dashboard/summary?date=2026-07-18").expect(200)).body.alertCount).toBe(1);
  });
});

function alert(asin: string, content: string): AlertLog {
  return {
    alertDate: "2026-07-18", alertType: "price_drop", alertLevel: "high", keyword: "ice maker",
    asin, title: `${asin} title`, brand: "Acme", alertContent: content,
    oldValue: "$100", newValue: "$80", status: "pending"
  };
}

function change(asin: string, title: string): DailyChange {
  return {
    asin, keyword: "ice maker", marketplace: "amazon.com", snapshotDate: "2026-07-18",
    yesterdayRank: 20, todayRank: 10, rankChange: 10, yesterdayPrice: 100, todayPrice: 80,
    priceChange: -20, priceChangeRate: -0.2, yesterdaySponsored: false, todaySponsored: false,
    changeType: "price_drop", title, brand: "Acme"
  };
}
