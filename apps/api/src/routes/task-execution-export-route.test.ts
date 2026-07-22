import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isoDate, type TaskPriority } from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

let db: DatabaseSync;
let store: ReturnType<typeof createStore>;
let app: ReturnType<typeof createApiApp>;
let token: string;

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
  token = await login("admin", "admin123");
});

afterEach(() => db.close());

describe("task execution checklist export", () => {
  it("exports only confirmed in-progress tasks and honors priority filters", async () => {
    const assignee = store.createUser({
      orgId: 1,
      username: "execution-owner",
      password: "Owner123!",
      role: "operator",
      displayName: "Execution Owner"
    });
    createTask("Pending task", "P1", "pending", assignee.id);
    createTask("Confirmed P1 task", "P1", "in_progress", assignee.id);
    createTask("Confirmed P2 task", "P2", "in_progress", assignee.id);

    const response = await request(app)
      .get("/api/tasks/execution.csv?priority=P1")
      .set("x-amazon-monitor-session", token)
      .expect(200)
      .expect("Content-Type", /text\/csv/);

    expect(response.headers["content-disposition"]).toBe(`attachment; filename="task-execution-${isoDate()}.csv"`);
    expect(response.text).toContain("\uFEFF");
    expect(response.text).toContain("Confirmed P1 task");
    expect(response.text).toContain("Execution Owner");
    expect(response.text).not.toContain("Pending task");
    expect(response.text).not.toContain("Confirmed P2 task");
  });

  it("enforces organization isolation and workflow permissions", async () => {
    createTask("Organization one task", "P1", "in_progress", null);
    const otherOrg = store.createOrganization({ name: "Other", plan: "standard" });
    store.createTask(taskInput(otherOrg.id, "Other organization task", "P1", null));
    store.createUser({ orgId: 1, username: "export-viewer", password: "Viewer123!", role: "viewer", displayName: "Viewer" });
    const viewerToken = await login("export-viewer", "Viewer123!");

    await request(app)
      .get("/api/tasks/execution.csv")
      .set("x-amazon-monitor-session", viewerToken)
      .expect(403);

    const response = await request(app)
      .get("/api/tasks/execution.csv")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(response.text).toContain("Organization one task");
    expect(response.text).not.toContain("Other organization task");
  });
});

async function login(username: string, password: string): Promise<string> {
  const response = await request(app).post("/api/auth/login").send({ username, password }).expect(200);
  return response.body.token as string;
}

function createTask(title: string, priority: TaskPriority, status: "pending" | "in_progress", assigneeId: number | null): void {
  const task = store.createTask(taskInput(1, title, priority, assigneeId));
  if (status === "in_progress") store.updateTask(task.id, { status });
}

function taskInput(orgId: number, title: string, priority: TaskPriority, assigneeId: number | null) {
  return {
    orgId,
    sourceType: "manual" as const,
    sourceId: null,
    title,
    description: "Execute after human confirmation",
    taskType: "other" as const,
    priority,
    assigneeId,
    dueDate: "2026-07-20",
    relatedAsin: "B0EXECUTION1",
    relatedKeyword: null,
    relatedBrand: "Northstar",
    relatedCategoryId: null,
    aiRecommendation: "Confirm parameters before execution",
    createdBy: 1
  };
}
