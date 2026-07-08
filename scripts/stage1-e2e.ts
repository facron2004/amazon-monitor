// Stage 1 e2e: event → task → review → SOP loop
// Run: node --import tsx scripts/stage1-e2e.ts
import { createApiApp } from "../apps/api/src/server.js";
import { createStore, initSchema } from "../apps/api/src/store.js";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";

async function main() {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  const store = createStore(db);
  const app = createApiApp(store);
  const r = request(app);

  console.log("[1] admin login");
  const login = await r.post("/api/auth/login").send({ username: "admin", password: "admin123" });
  const token = login.body.token as string;
  const headers = { "x-amazon-monitor-session": token };
  console.log("  ok role=" + login.body.context.user.role);

  console.log("[2] seed a P0 insight event manually");
  const today = new Date().toISOString().slice(0, 10);
  const ev = store.upsertInsightEvent({
    id: "evt-stage1-1",
    eventDate: today,
    asin: "B0STAGE1",
    brand: "BrandX",
    categoryId: null,
    keywordId: null,
    eventType: "PRICE_DROP",
    eventLevel: "P0",
    eventTitle: "对手降 10%",
    eventSummary: "测试用",
    attributionTags: ["PRICE_DRIVEN"],
    evidence: { marketplace: "US", evidenceItems: [] },
    scoreTotal: 95,
    scoreLevel: "S",
    scoreBreakdown: { rankingScore: 0, productScore: 0, promoScore: 0, brandScore: 0, riskScore: 0, reasons: [] },
    suggestedAction: "跟进",
    status: "TODO",
    reviewDueDate: null,
    reviewResult: null,
    userNote: null
  } as unknown as Parameters<typeof store.upsertInsightEvent>[0]);
  console.log("  event id=" + ev.id + " status=" + ev.status);

  console.log("[3] convert event to task");
  const conv = await r.post("/api/tasks").set(headers).send({
    sourceType: "insight_event",
    sourceId: ev.id,
    title: ev.eventTitle,
    description: "需要关注",
    taskType: "price",
    priority: "P0"
  });
  const taskId = conv.body.id as number;
  console.log("  task id=" + taskId + " status=" + conv.body.status);
  if (conv.body.status !== "pending") throw new Error("expected pending");

  console.log("[4] transition pending → in_progress → awaiting_review → done");
  await r.post(`/api/tasks/${taskId}/transition`).set(headers).send({ status: "in_progress" });
  await r.post(`/api/tasks/${taskId}/transition`).set(headers).send({ status: "awaiting_review" });
  const done = await r.post(`/api/tasks/${taskId}/transition`).set(headers).send({ status: "done" });
  if (done.body.status !== "done") throw new Error("expected done");
  console.log("  ok completedAt=" + done.body.completedAt);

  console.log("[5] review with CONFIRMED");
  const reviewed = await r.post(`/api/tasks/${taskId}/review`).set(headers).send({
    reviewResult: "CONFIRMED",
    reviewNote: "已调整价格"
  });
  if (reviewed.body.reviewResult !== "CONFIRMED") throw new Error("review failed");
  console.log("  ok reviewedAt=" + reviewed.body.reviewedAt);

  console.log("[6] verify insight event is now CONVERTED_TO_TASK");
  const after = store.getInsightEvent(ev.id);
  if (after?.status !== "CONVERTED_TO_TASK") throw new Error("event status not updated: " + after?.status);
  console.log("  event status=" + after.status);

  console.log("[7] create SOP from reviewed task (manual)");
  const sop = await r.post("/api/sops").set(headers).send({
    title: "调价 SOP：对手降 10%",
    category: "price_action",
    bodyMd: "# Step 1\n降价 5%",
    sourceTaskId: taskId,
    tags: ["price", "P0"]
  });
  if (sop.body.status !== "draft") throw new Error("SOP not draft");
  console.log("  sop id=" + sop.body.id + " status=" + sop.body.status);

  console.log("[8] publish SOP");
  const pub = await r.post(`/api/sops/${sop.body.id}/publish`).set(headers);
  if (pub.body.status !== "published") throw new Error("publish failed");
  console.log("  ok status=" + pub.body.status);

  console.log("\n✅ Stage 1 event→task→review→SOP loop PASSED");
}

main().catch((err) => {
  console.error("❌ e2e failed:", err);
  process.exit(1);
});
