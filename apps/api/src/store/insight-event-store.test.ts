import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { InsightEventInput } from "@amazon-monitor/shared";
import { createStore, initSchema } from "../store.js";

describe("insight event store", () => {
  it("persists insight events, preserves workflow state on upsert, and exposes review/watch queues", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const event = sampleInsightEvent();

    store.upsertInsightEvent(event);
    expect(store.listInsightEvents({ date: "2026-06-19" })).toHaveLength(1);

    expect(store.updateInsightEventStatus(event.id, "WATCHING")).toMatchObject({ status: "WATCHING" });
    store.upsertInsightEvent({ ...event, scoreTotal: 91, scoreLevel: "S" });
    expect(store.getInsightEvent(event.id)).toMatchObject({ status: "WATCHING", scoreTotal: 91 });

    expect(store.updateInsightEventNote(event.id, "跟进竞品价格")).toMatchObject({ userNote: "跟进竞品价格" });

    // 用户把事件标成 WATCHING 后,自动复盘队列不应再把它捞回——
    // 否则 markInsightEventReviewed 会把 WATCHING 强制刷成 REVIEW_PENDING/REVIEWED,
    // 用户的"观察中"决定会被悄悄覆盖。
    expect(store.listReviewDueEvents("2026-06-22")).toEqual([]);

    // 把状态退回到 TODO,事件应当重新进入 due 队列。
    store.updateInsightEventStatus(event.id, "TODO");
    expect(store.listReviewDueEvents("2026-06-22")[0]).toMatchObject({ id: event.id });
    expect(store.markInsightEventReviewed(event.id, "CONTINUING", "首次复盘仍在持续", "2026-06-26")).toMatchObject({
      status: "REVIEW_PENDING",
      reviewDueDate: "2026-06-26",
      reviewResult: "CONTINUING",
      userNote: "首次复盘仍在持续"
    });
    expect(store.listReviewDueEvents("2026-06-22")).toEqual([]);
    expect(store.listReviewDueEvents("2026-06-26")[0]).toMatchObject({ id: event.id });
    expect(store.markInsightEventReviewed(event.id, "CONFIRMED", "最终判断成立")).toMatchObject({
      status: "REVIEWED",
      reviewResult: "CONFIRMED",
      userNote: "最终判断成立"
    });

    const watchState = store.upsertAsinWatchState({
      asin: "B0TEST0001",
      watchLevel: "POTENTIAL",
      watchReason: "低 Review 高排名",
      firstWatchDate: "2026-06-19",
      lastEventDate: "2026-06-19",
      note: null
    });
    expect(watchState).toMatchObject({ asin: "B0TEST0001", watchLevel: "POTENTIAL" });
  });

  it("preserves user-set WATCHING/FOLLOWED/IGNORED status and existing note on auto-review", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const event = sampleInsightEvent();
    store.upsertInsightEvent(event);

    // 用户决定"已跟进"——即使 evaluator 通过 stale claim 或历史数据调用
    // markInsightEventReviewed,status 也不应被刷成 REVIEW_PENDING。
    store.updateInsightEventStatus(event.id, "FOLLOWED");
    store.updateInsightEventNote(event.id, "用户原备注");

    const reviewed = store.markInsightEventReviewed(event.id, "CONFIRMED", null, "2026-06-26");
    expect(reviewed).toMatchObject({
      status: "FOLLOWED",
      reviewResult: "CONFIRMED",
      reviewDueDate: "2026-06-26",
      userNote: "用户原备注" // note=null 没被错刷成 null
    });
  });

  it("normalizes whitespace-only note to null and does not insert a history row", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const event = sampleInsightEvent();
    store.upsertInsightEvent(event);
    store.updateInsightEventNote(event.id, "原始备注");
    // 用户清空了输入框,前端传 ""——不应该覆盖已有备注,也不应该写一条空 history
    store.updateInsightEventNote(event.id, "   ");
    expect(store.getInsightEvent(event.id)).toMatchObject({ userNote: "原始备注" });
    const notes = db.prepare("SELECT * FROM insight_event_notes WHERE event_id = ?").all(event.id);
    expect(notes).toHaveLength(1);
  });

  it("claimReviewDueEvents atomically claims each due event to a single claim id, releases on demand, and reclaims after stale expiry", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const baseEvent = sampleInsightEvent();
    store.upsertInsightEvent({ ...baseEvent, id: "2026-06-19|cat1|asin:A|NEW_TOP50_ENTRY", asin: "A", eventTitle: "A" });
    store.upsertInsightEvent({ ...baseEvent, id: "2026-06-19|cat1|asin:B|NEW_TOP50_ENTRY", asin: "B", eventTitle: "B" });
    store.upsertInsightEvent({ ...baseEvent, id: "2026-06-19|cat1|asin:C|REVIEW_PENDING|DONE", asin: "C", eventTitle: "C", status: "REVIEWED", reviewDueDate: null });

    const claimedA = store.claimReviewDueEvents("2026-06-22", "claim-A");
    expect(claimedA.map((event) => event.asin).sort()).toEqual(["A", "B"]);

    // 第二个 claim_id 不应再拿到 A/B,因为第一次 claim 的 claim_id 还活着
    const claimedB = store.claimReviewDueEvents("2026-06-22", "claim-B");
    expect(claimedB).toEqual([]);

    // 释放 claim-A 后,claim-B 应该能重新拿到
    store.releaseReviewClaim("claim-A");
    const claimedC = store.claimReviewDueEvents("2026-06-22", "claim-C");
    expect(claimedC.map((event) => event.asin).sort()).toEqual(["A", "B"]);

    // 直接更新 claimed_at 到 2 小时前,模拟 evaluator 中途崩溃留下的 stale claim
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE insight_review_claims SET claimed_at = ?").run(twoHoursAgo);
    const claimedD = store.claimReviewDueEvents("2026-06-22", "claim-D");
    expect(claimedD.map((event) => event.asin).sort()).toEqual(["A", "B"]);
  });
});

function sampleInsightEvent(): InsightEventInput {
  return {
    id: "2026-06-19|category:1|asin:B0TEST0001|NEW_TOP50_ENTRY",
    eventDate: "2026-06-19",
    asin: "B0TEST0001",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "NEW_TOP50_ENTRY",
    eventLevel: "P0",
    eventTitle: "【新进 Top50】Acme B0TEST0001 进入 #20",
    eventSummary: "发生了什么：BSR 未上榜 -> #20。",
    attributionTags: ["NEW_PRODUCT_PUSH"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      currentRank: 20,
      previousRank: null,
      evidenceItems: ["BSR 未上榜 -> #20"]
    },
    scoreTotal: 88,
    scoreLevel: "S",
    scoreBreakdown: {
      rankingScore: 35,
      productScore: 25,
      promoScore: 8,
      brandScore: 10,
      riskScore: 10,
      reasons: ["排名分 35"]
    },
    suggestedAction: "加入观察",
    status: "TODO",
    reviewDueDate: "2026-06-22",
    reviewResult: null,
    userNote: null
  };
}
