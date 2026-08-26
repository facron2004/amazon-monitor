import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("Agent OS data quality route", () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApiApp>;
  let cookie: string;

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    app = createApiApp(createStore(db));
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" }).expect(200);
    cookie = login.headers["set-cookie"][0] as string;
  });

  afterEach(() => db.close());

  it("reports the current organization evidence gate instead of fake Agent data", async () => {
    const response = await request(app)
      .get("/api/agent-os/data-quality?checkedAt=2026-08-14T00:00:00.000Z")
      .set("Cookie", cookie)
      .expect(200);
    expect(response.body).toMatchObject({
      checkedAt: "2026-08-14T00:00:00.000Z",
      report: { status: "INVALID", refreshRequired: true },
      evidenceGate: { action: "STOP", allowed: false },
    });
    expect(response.body.sourceChecks).toHaveLength(2);
    expect(response.body.sourceChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "collector:category", collectionStatus: "missing" }),
      expect.objectContaining({ source: "collector:keyword", collectionStatus: "missing" }),
    ]));
  });
});
