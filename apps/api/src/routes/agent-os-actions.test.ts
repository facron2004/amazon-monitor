import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { NotificationSender } from "../notifier.js";

describe("Agent OS action gateway routes", () => {
  let db: DatabaseSync;
  let store: ReturnType<typeof createStore>;
  let app: ReturnType<typeof createApiApp>;
  let cookie: string;

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    store = createStore(db);
    app = createApiApp(store);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    cookie = login.headers["set-cookie"][0] as string;
  });

  afterEach(() => db.close());

  it("rejects client-supplied lifecycle status when creating an action", async () => {
    await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        type: "CREATE_TASK",
        targetType: "SKU",
        proposedValue: { title: "Must start proposed" },
        reason: "Client cannot bypass the action lifecycle",
        evidence: [{ id: "status-e-1" }],
        riskLevel: "LOW",
        confidence: 0.99,
        requiresApproval: false,
        status: "EFFECTIVE",
        idempotencyKey: "action-status-bypass-1",
      })
      .expect(400);

    const action = await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        type: "CREATE_TASK",
        targetType: "SKU",
        proposedValue: { title: "Must start proposed" },
        reason: "Client cannot bypass the action lifecycle",
        evidence: [{ id: "status-e-2" }],
        riskLevel: "LOW",
        confidence: 0.99,
        requiresApproval: false,
        idempotencyKey: "action-status-proposed-1",
      })
      .expect(201);
    expect(action.body.status).toBe("PROPOSED");
  });

  it("executes and verifies a real CREATE_TASK action idempotently", async () => {
    const action = await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        type: "CREATE_TASK",
        targetType: "SKU",
        targetId: "B0TASK",
        proposedValue: { title: "Review generated task", taskType: "other", priority: "P1" },
        reason: "Create a review task from a trusted workflow",
        evidence: [{ id: "e-1", source: "workflow" }],
        riskLevel: "LOW",
        confidence: 0.95,
        requiresApproval: false,
        idempotencyKey: "action-gateway-task-1",
      })
      .expect(201);
    expect(action.body).toMatchObject({ requiresApproval: false, confidence: 0.95 });

    const executed = await request(app)
      .post(`/api/agent-os/actions/${action.body.id}/execute`)
      .set("Cookie", cookie)
      .expect(200);
    expect(executed.body.proposal.status).toBe("SUCCEEDED");
    expect(executed.body.execution.status).toBe("SUCCEEDED");

    const verified = await request(app)
      .post(`/api/agent-os/actions/${action.body.id}/verify`)
      .set("Cookie", cookie)
      .expect(200);
    expect(verified.body.status).toBe("EFFECTIVE");
    expect(verified.body.proposal.status).toBe("EFFECTIVE");
    expect(verified.body.execution.status).toBe("VERIFIED");

    const audit = await request(app)
      .get(`/api/agent-os/actions/${action.body.id}/execution`)
      .set("Cookie", cookie)
      .expect(200);
    expect(audit.body).toMatchObject({ id: verified.body.execution.id, status: "VERIFIED" });

    const repeated = await request(app)
      .post(`/api/agent-os/actions/${action.body.id}/execute`)
      .set("Cookie", cookie)
      .expect(200);
    expect(repeated.body.execution.id).toBe(executed.body.execution.id);
  });

  it("blocks an action that still requires approval", async () => {
    const action = await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        type: "CREATE_TASK",
        targetType: "SKU",
        proposedValue: { title: "Needs approval" },
        reason: "Approval gate",
        evidence: [{ id: "e-2" }],
        riskLevel: "LOW",
        confidence: 0.99,
        requiresApproval: true,
        idempotencyKey: "action-gateway-approval-1",
      })
      .expect(201);
    await request(app)
      .post(`/api/agent-os/actions/${action.body.id}/execute`)
      .set("Cookie", cookie)
      .expect(409);
  });

  it("generates a real daily report and sends a matched notification schedule", async () => {
    const reportAction = await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        type: "CREATE_REPORT",
        targetType: "ORGANIZATION",
        proposedValue: { date: "2026-08-14" },
        reason: "Create the operator report after a workflow run",
        evidence: [{ id: "report-e-1", source: "workflow" }],
        riskLevel: "LOW",
        confidence: 0.98,
        requiresApproval: false,
        idempotencyKey: "action-gateway-report-1",
      })
      .expect(201);

    const reportExecution = await request(app)
      .post(`/api/agent-os/actions/${reportAction.body.id}/execute`)
      .set("Cookie", cookie)
      .expect(200);
    expect(reportExecution.body.execution.result).toMatchObject({ reportDate: "2026-08-14" });

    const reportVerification = await request(app)
      .post(`/api/agent-os/actions/${reportAction.body.id}/verify`)
      .set("Cookie", cookie)
      .expect(200);
    expect(reportVerification.body.status).toBe("EFFECTIVE");

    const schedule = store.createNotificationSchedule({
      name: "Agent OS email",
      channel: "email",
      target: "ops@example.com",
      sendTime: "09:00",
      status: "enabled",
    });
    const sent: string[] = [];
    const sender: NotificationSender = {
      async send(_schedule, date) {
        sent.push(date);
        return { message: "recorded" };
      },
    };
    app = createApiApp(store, { notificationSender: sender });
    const relogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    cookie = relogin.headers["set-cookie"][0] as string;

    const notificationAction = await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        type: "SEND_EMAIL",
        targetType: "ORGANIZATION",
        proposedValue: { scheduleId: schedule.id, date: "2026-08-14" },
        reason: "Send the generated report to the operating mailbox",
        evidence: [{ id: "notify-e-1", source: "report" }],
        riskLevel: "LOW",
        confidence: 0.98,
        requiresApproval: false,
        idempotencyKey: "action-gateway-email-1",
      })
      .expect(201);

    const notificationExecution = await request(app)
      .post(`/api/agent-os/actions/${notificationAction.body.id}/execute`)
      .set("Cookie", cookie)
      .expect(200);
    expect(notificationExecution.body.execution.result).toMatchObject({
      channel: "email",
      status: "success",
    });
    expect(sent).toEqual(["2026-08-14"]);

    await request(app)
      .post(`/api/agent-os/actions/${notificationAction.body.id}/verify`)
      .set("Cookie", cookie)
      .expect(200);

    const mismatched = await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        type: "SEND_FEISHU",
        targetType: "ORGANIZATION",
        proposedValue: { scheduleId: schedule.id, date: "2026-08-14" },
        reason: "Channel mismatch must fail closed",
        evidence: [{ id: "notify-e-2", source: "report" }],
        riskLevel: "LOW",
        confidence: 0.98,
        requiresApproval: false,
        idempotencyKey: "action-gateway-feishu-mismatch-1",
      })
      .expect(201);
    await request(app)
      .post(`/api/agent-os/actions/${mismatched.body.id}/execute`)
      .set("Cookie", cookie)
      .expect(404);
  });

  it("records failed execution and isolates another organization", async () => {
    const invalid = await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        type: "CREATE_TASK",
        targetType: "SKU",
        proposedValue: { description: "title is missing" },
        reason: "Invalid task input",
        evidence: [{ id: "e-3" }],
        riskLevel: "LOW",
        confidence: 0.99,
        requiresApproval: false,
        idempotencyKey: "action-gateway-failed-1",
      })
      .expect(201);

    await request(app)
      .post(`/api/agent-os/actions/${invalid.body.id}/execute`)
      .set("Cookie", cookie)
      .expect(400);
    expect(store.agentOs.getActionProposal(invalid.body.id, 1)).toMatchObject({ status: "FAILED" });
    expect(store.agentOsActionExecutions.listActionExecutions({
      organizationId: 1,
      actionProposalId: invalid.body.id,
    })).toEqual([expect.objectContaining({ status: "FAILED" })]);

    const otherOrganization = store.createOrganization({ name: "Other organization" });
    const otherAction = store.agentOs.createActionProposal({
      organizationId: otherOrganization.id,
      type: "CREATE_TASK",
      targetType: "SKU",
      proposedValue: { title: "Other organization task" },
      reason: "Tenant isolation",
      evidence: [{ id: "e-4" }],
      riskLevel: "LOW",
      confidence: 0.99,
      requiresApproval: false,
      idempotencyKey: "action-gateway-other-org-1",
    });

    await request(app)
      .post(`/api/agent-os/actions/${otherAction.id}/execute`)
      .set("Cookie", cookie)
      .expect(404);
    await request(app)
      .post(`/api/agent-os/actions/${otherAction.id}/verify`)
      .set("Cookie", cookie)
      .expect(404);
  });
});
