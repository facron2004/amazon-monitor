import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createTables } from "./schema.js";
import { createStore } from "../store.js";
import { createTaskStore, VALID_TRANSITIONS } from "./task-store.js";
import { createSopStore } from "./sop-store.js";
import { createIdentityStore } from "./identity-store.js";
import { createInsightEventStore } from "./insight-event-store.js";
import type { Store } from "./types.js";

function freshStore(): { db: DatabaseSync; store: Store } {
  const db = new DatabaseSync(":memory:");
  createTables(db);
  const store: Store = {
    ...createTaskStore(db),
    ...createSopStore(db),
    ...createIdentityStore(db),
    ...createInsightEventStore(db),
    reset() {
      db.exec("DELETE FROM insight_event_tasks; DELETE FROM task_notes; DELETE FROM tasks; DELETE FROM sops; DELETE FROM users; DELETE FROM organizations;");
    },
    runInTransaction(work: () => void) {
      work();
    }
  } as Store;
  return { db, store };
}

describe("task store", () => {
  let store: Store;
  beforeEach(() => {
    ({ store } = freshStore());
  });
  afterEach(() => {
    store.reset();
  });

  it("creates and lists tasks with default status=pending", () => {
    const task = store.createTask({
      orgId: 1,
      sourceType: "manual",
      sourceId: null,
      title: "降低 B0 对手价格",
      description: "测试描述",
      taskType: "price",
      priority: "P0",
      relatedAsin: "B0TEST123"
    } as unknown as Parameters<Store["createTask"]>[0]);

    expect(task.status).toBe("pending");
    expect(task.priority).toBe("P0");
    expect(task.relatedAsin).toBe("B0TEST123");
    const list = store.listTasks();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(task.id);
  });

  it("rejects illegal task transitions", () => {
    const task = store.createTask({
      orgId: 1,
      sourceType: "manual",
      sourceId: null,
      title: "T",
      description: "",
      taskType: "other",
      priority: "P1"
    } as unknown as Parameters<Store["createTask"]>[0]);
    // pending → done is illegal
    expect(() => store.transitionTaskStatus(task.id, "done")).toThrow(/Illegal/);
  });

  it("allows legal transitions and sets completed_at / reviewed_at", () => {
    const task = store.createTask({
      orgId: 1,
      sourceType: "manual",
      sourceId: null,
      title: "T",
      description: "",
      taskType: "other",
      priority: "P1"
    } as unknown as Parameters<Store["createTask"]>[0]);
    const t1 = store.transitionTaskStatus(task.id, "in_progress");
    expect(t1?.status).toBe("in_progress");
    const t2 = store.transitionTaskStatus(task.id, "awaiting_review");
    expect(t2?.status).toBe("awaiting_review");
    const t3 = store.transitionTaskStatus(task.id, "done");
    expect(t3?.status).toBe("done");
    expect(t3?.completedAt).toBeTruthy();
    const t4 = store.transitionTaskStatus(task.id, "reviewed");
    expect(t4?.status).toBe("reviewed");
    expect(t4?.reviewedAt).toBeTruthy();
  });

  it("filters tasks by statusIn and priority", () => {
    for (const p of ["P0", "P1", "P2"] as const) {
      store.createTask({
        orgId: 1,
        sourceType: "manual",
        sourceId: null,
        title: `task-${p}`,
        description: "",
        taskType: "other",
        priority: p
      } as unknown as Parameters<Store["createTask"]>[0]);
    }
    expect(store.listTasks({ priority: "P0" })).toHaveLength(1);
    expect(store.listTasks({ statusIn: ["pending", "in_progress"] })).toHaveLength(3);
  });

  it("adds and lists task notes", () => {
    const task = store.createTask({
      orgId: 1,
      sourceType: "manual",
      sourceId: null,
      title: "T",
      description: "",
      taskType: "other",
      priority: "P1"
    } as unknown as Parameters<Store["createTask"]>[0]);
    store.addTaskNote({ taskId: task.id, authorId: 1, body: "first note" });
    store.addTaskNote({ taskId: task.id, authorId: 1, body: "second note" });
    const notes = store.listTaskNotes(task.id);
    expect(notes).toHaveLength(2);
    expect(notes[0].body).toBe("first note");
  });

  it("VALID_TRANSITIONS map covers all 6 states", () => {
    const expectedStates = ["pending", "in_progress", "awaiting_review", "done", "reviewed", "cancelled"];
    for (const s of expectedStates) {
      expect(VALID_TRANSITIONS).toHaveProperty(s);
    }
    expect(VALID_TRANSITIONS.cancelled).toEqual([]);
  });
});

describe("sop store", () => {
  let store: Store;
  beforeEach(() => {
    ({ store } = freshStore());
  });
  afterEach(() => {
    store.reset();
  });

  it("creates draft SOP, then publishes and archives", () => {
    const sop = store.createSop({
      orgId: 1,
      title: "竞品调价 SOP",
      category: "price_action",
      bodyMd: "# Step 1\n降价 5%",
      tags: ["price", "B0"]
    } as unknown as Parameters<Store["createSop"]>[0]);
    expect(sop.status).toBe("draft");
    expect(sop.tags).toEqual(["price", "B0"]);

    const published = store.publishSop(sop.id);
    expect(published.status).toBe("published");
    const archived = store.archiveSop(sop.id);
    expect(archived.status).toBe("archived");
  });

  it("marks the source task when a task is promoted to an SOP", () => {
    const task = store.createTask({
      orgId: 1,
      sourceType: "manual",
      sourceId: null,
      title: "复盘竞品降价",
      description: "沉淀应对动作",
      taskType: "competitor",
      priority: "P1"
    } as unknown as Parameters<Store["createTask"]>[0]);

    const sop = store.createSop({
      orgId: 1,
      title: "竞品降价复盘 SOP",
      category: "competitor_response",
      bodyMd: "# SOP\n记录证据、动作与结果",
      sourceTaskId: task.id,
      tags: ["competitor", "review"]
    } as unknown as Parameters<Store["createSop"]>[0]);

    expect(sop.sourceTaskId).toBe(task.id);
    expect(store.getTask(task.id)?.promotedToSopId).toBe(sop.id);
  });

  it("filters SOPs by category and status", () => {
    for (const cat of ["price_action", "competitor_response", "general"] as const) {
      store.createSop({
        orgId: 1,
        title: `sop-${cat}`,
        category: cat,
        bodyMd: "x"
      } as unknown as Parameters<Store["createSop"]>[0]);
    }
    expect(store.listSops({ category: "price_action" })).toHaveLength(1);
    expect(store.listSops({ status: "draft" })).toHaveLength(3);
  });

  it("searches by title substring", () => {
    store.createSop({
      orgId: 1,
      title: "Listing 优化指南",
      category: "listing_optimization",
      bodyMd: "x"
    } as unknown as Parameters<Store["createSop"]>[0]);
    store.createSop({
      orgId: 1,
      title: "其他",
      category: "general",
      bodyMd: "x"
    } as unknown as Parameters<Store["createSop"]>[0]);
    const res = store.listSops({ q: "Listing" });
    expect(res).toHaveLength(1);
    expect(res[0].title).toContain("Listing");
  });
});

describe("task ↔ insight_event link", () => {
  let store: Store;
  beforeEach(() => {
    ({ store } = freshStore());
  });
  afterEach(() => {
    store.reset();
  });

  it("links a task to an event, then lists tasks for that event", () => {
    // seed an insight event directly
    const now = new Date().toISOString();
    const ev = store.upsertInsightEvent({
      id: "evt-1",
      eventDate: now.slice(0, 10),
      asin: "B0EVT",
      brand: "BrandX",
      categoryId: null,
      keywordId: null,
      eventType: "PRICE_DROP",
      eventLevel: "P1",
      eventTitle: "降价",
      eventSummary: "对手降价 5%",
      attributionTags: ["PRICE_DRIVEN"],
      evidence: {
        marketplace: "US",
        evidenceItems: []
      },
      scoreTotal: 80,
      scoreLevel: "A",
      scoreBreakdown: { rankingScore: 0, productScore: 0, promoScore: 0, brandScore: 0, riskScore: 0, reasons: [] },
      suggestedAction: "关注",
      status: "TODO",
      reviewDueDate: null,
      reviewResult: null,
      userNote: null
    } as unknown as Parameters<Store["upsertInsightEvent"]>[0]);
    const task = store.createTask({
      orgId: 1,
      sourceType: "insight_event",
      sourceId: ev.id,
      title: "T",
      description: "",
      taskType: "price",
      priority: "P1"
    } as unknown as Parameters<Store["createTask"]>[0]);
    store.linkEventToTask(ev.id, task.id);
    expect(store.listTasksForEvent(ev.id)).toHaveLength(1);
    expect(store.listEventsForTask(task.id)[0].eventId).toBe(ev.id);
  });
});
