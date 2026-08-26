import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createIntelligenceStore } from "./intelligence-store.js";

const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function openStore() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return { db, store: createIntelligenceStore(db) };
}

describe("Agent OS intelligence SQLite adapter", () => {
  it("initializes independently and scopes opportunity CRUD, idempotency, version, and paging by organization", () => {
    const { db, store } = openStore();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = ? AND name LIKE ? ORDER BY name",
    ).all("table", "agent_os_intelligence_%") as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual([
      "agent_os_intelligence_decisions",
      "agent_os_intelligence_experiments",
      "agent_os_intelligence_opportunities",
    ]);

    const first = store.createOpportunity({
      organizationId: 1,
      type: "price_gap",
      title: "Competitor price gap",
      targetType: "sku",
      targetId: "B0TESTASIN",
      signal: { source: "serp", delta: 0.12 },
      idempotencyKey: "opportunity:price-gap:1",
    });
    const duplicate = store.createOpportunity({
      organizationId: 1,
      type: "ignored",
      title: "Duplicate payload",
      idempotencyKey: "opportunity:price-gap:1",
    });
    const otherOrganization = store.createOpportunity({
      organizationId: 2,
      type: "price_gap",
      title: "Same key in another organization",
      idempotencyKey: "opportunity:price-gap:1",
    });
    const second = store.createOpportunity({
      organizationId: 1,
      type: "review_gap",
      title: "Review gap",
      status: "READY",
      idempotencyKey: "opportunity:review-gap:1",
    });
    const third = store.createOpportunity({
      organizationId: 1,
      type: "stockout",
      title: "Stockout risk",
      status: "READY",
      idempotencyKey: "opportunity:stockout:1",
    });

    expect(duplicate).toEqual(first);
    expect(otherOrganization.id).not.toBe(first.id);
    expect(store.getOpportunity(first.id, 2)).toBeNull();
    expect(store.listOpportunities({ organizationId: 1, status: "READY", limit: 10 })).toEqual([third, second]);
    expect(store.listOpportunities({ organizationId: 1, limit: 1, offset: 1 })).toHaveLength(1);

    const updated = store.updateOpportunity(first.id, 1, {
      title: "Updated opportunity",
      details: { owner: "ops" },
      expectedVersion: 1,
    });
    expect(updated).toMatchObject({ id: first.id, title: "Updated opportunity", version: 2 });
    expect(store.updateOpportunity(first.id, 1, { title: "Stale update", expectedVersion: 1 })).toBeNull();
    expect(store.updateOpportunity(first.id, 2, { title: "Cross-organization update" })).toBeNull();
    expect(store.deleteOpportunity(first.id, 1, 1)).toBe(false);
    expect(store.deleteOpportunity(first.id, 1, 2)).toBe(true);
    expect(store.getOpportunity(first.id, 1)).toBeNull();
  });

  it("persists and maps decisions and experiments with JSON fields and optimistic versions", () => {
    const { store } = openStore();
    const decision = store.createDecision({
      organizationId: 7,
      issue: "Organic rank declined",
      rootCauses: ["Impression share fell"],
      evidence: [{ source: "rank-history", confidence: 0.9 }],
      options: [{ id: "budget", label: "Increase exact budget" }],
      recommendedOption: { id: "budget" },
      requiredApproval: false,
      constraints: { maxDailyBudget: 140 },
      idempotencyKey: "decision:rank-drop:7",
    });
    const experiment = store.createExperiment({
      organizationId: 7,
      title: "Test exact-match bid",
      hypothesis: "A tighter bid improves organic rank",
      action: { bidDelta: 0.1 },
      before: { rank: 18 },
      status: "RUNNING",
      observationWindowDays: 7,
      idempotencyKey: "experiment:rank-bid:7",
    });

    expect(decision).toMatchObject({
      requiredApproval: false,
      rootCauses: ["Impression share fell"],
      constraints: { maxDailyBudget: 140 },
      version: 1,
    });
    expect(experiment).toMatchObject({
      hypothesis: "A tighter bid improves organic rank",
      action: { bidDelta: 0.1 },
      before: { rank: 18 },
      status: "RUNNING",
      version: 1,
    });
    expect(store.listDecisions({ organizationId: 7, limit: 10 })).toEqual([decision]);
    expect(store.listExperiments({ organizationId: 7, status: "RUNNING", limit: 10 })).toEqual([experiment]);

    expect(store.updateDecision(decision.id, 7, { status: "APPROVED", expectedVersion: 1 }))
      .toMatchObject({ id: decision.id, status: "APPROVED", version: 2 });
    expect(store.updateExperiment(experiment.id, 7, {
      after: { rank: 12 },
      delta: { rank: -6 },
      expectedVersion: 1,
    })).toMatchObject({ id: experiment.id, after: { rank: 12 }, version: 2 });
    expect(store.updateExperiment(experiment.id, 7, { expectedVersion: 1 })).toBeNull();
  });
});
