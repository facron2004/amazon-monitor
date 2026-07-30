import { DatabaseSync } from "node:sqlite";
import type { NotificationSchedule } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import type { NotificationSender } from "../notifier.js";
import { createStore, initSchema } from "../store.js";
import { AgentActionService } from "./agent-action-service.js";

class RecordingSender implements NotificationSender {
  readonly sent: NotificationSchedule[] = [];

  async send(schedule: NotificationSchedule): Promise<{ message: string }> {
    this.sent.push(schedule);
    return { message: "sent" };
  }
}

describe("AgentActionService", () => {
  it("never sends a Feishu proposal before explicit L3 confirmation", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const sender = new RecordingSender();
    const user = store.listUsers()[0];
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Feishu approval boundary",
    });
    const run = store.createAgentRun({
      sessionId: session.id,
      orgId: user.orgId,
      userId: user.id,
      taskType: "report",
      input: "Send the daily report",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
    });
    const schedule = store.createNotificationSchedule({
      name: "Agent Feishu test",
      channel: "feishu",
      target: "https://open.feishu.cn/open-apis/bot/v2/hook/test",
      sendTime: "09:30",
      timezone: "Asia/Shanghai",
      status: "enabled",
    }, user.orgId);
    const proposal = store.createActionProposal({
      runId: run.id,
      orgId: user.orgId,
      actionType: "send_feishu_report",
      title: "Send daily report",
      payload: { scheduleId: schedule.id, date: "2026-07-29" },
      riskLevel: "L3",
      idempotencyKey: `test:${run.id}:feishu`,
    });
    const service = new AgentActionService(store, sender);

    const approved = await service.approve(
      proposal.id,
      user.orgId,
      user.id,
      proposal.expectedVersion,
    );
    expect(approved.execution).toBeNull();
    expect(sender.sent).toHaveLength(0);

    await expect(service.execute(
      proposal.id,
      user.orgId,
      user.id,
      false,
    )).rejects.toThrow(/second confirmation/i);
    expect(sender.sent).toHaveLength(0);

    const executed = await service.execute(
      proposal.id,
      user.orgId,
      user.id,
      true,
    );
    expect(executed?.status).toBe("completed");
    expect(sender.sent).toHaveLength(1);
    db.close();
  });
});
