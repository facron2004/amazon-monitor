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
    expect(store.updateInsightEventAssignee(event.id, "  Alice  ")).toMatchObject({ assignee: "Alice" });
    store.upsertInsightEvent({ ...event, scoreTotal: 92, scoreLevel: "S" });
    expect(store.getInsightEvent(event.id)).toMatchObject({ assignee: "Alice", scoreTotal: 92 });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0TEST0002|NEW_TOP50_ENTRY",
      asin: "B0TEST0002",
      eventTitle: "Bob owner event",
      status: "FOLLOWED",
      reviewDueDate: null,
      assignee: "Bob"
    });
    store.upsertInsightEvent({
      ...event,
      id: "2026-06-19|category:1|asin:B0TEST0003|NEW_TOP50_ENTRY",
      asin: "B0TEST0003",
      eventTitle: "Unassigned owner event",
      status: "FOLLOWED",
      reviewDueDate: null
    });
    expect(store.listInsightEvents({ date: "2026-06-19", assignee: "Alice" }).map((item) => item.id)).toEqual([event.id]);
    expect(store.listInsightEvents({ date: "2026-06-19", unassignedOnly: true }).map((item) => item.asin)).toEqual(["B0TEST0003"]);
    expect(store.updateInsightEventAssignee(event.id, " ")).toMatchObject({ assignee: null });

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

  it("filters and paginates due review events as a first-class queue", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const base = sampleInsightEvent();

    store.upsertInsightEvent({
      ...base,
      id: "2026-06-19|cat1|asin:B0DUEA|NEW_TOP50_ENTRY",
      asin: "B0DUEA",
      brand: "Acme",
      eventTitle: "Acme due event",
      assignee: "Alice",
      reviewDueDate: "2026-06-22",
      scoreTotal: 80
    });
    store.upsertInsightEvent({
      ...base,
      id: "2026-06-18|cat1|asin:B0DUEB|RANK_SURGE",
      eventDate: "2026-06-18",
      asin: "B0DUEB",
      brand: "Beta",
      eventType: "RANK_SURGE",
      eventLevel: "P1",
      eventTitle: "Beta due event",
      status: "REVIEW_PENDING",
      reviewDueDate: "2026-06-20",
      scoreTotal: 70
    });
    store.upsertInsightEvent({
      ...base,
      id: "2026-06-19|cat1|asin:B0DONE|NEW_TOP50_ENTRY",
      asin: "B0DONE",
      brand: "Acme",
      eventTitle: "Followed event",
      status: "FOLLOWED",
      reviewDueDate: "2026-06-20"
    });
    store.upsertInsightEvent({
      ...base,
      id: "2026-06-19|cat1|asin:B0FUTURE|NEW_TOP50_ENTRY",
      asin: "B0FUTURE",
      brand: "Acme",
      eventTitle: "Future due event",
      reviewDueDate: "2026-06-23"
    });

    expect(store.listReviewDueEvents("2026-06-22").map((event) => event.asin)).toEqual(["B0DUEB", "B0DUEA"]);
    expect(store.listReviewDueEvents("2026-06-22", { brand: "Acme" }).map((event) => event.asin)).toEqual(["B0DUEA"]);
    expect(store.listReviewDueEvents("2026-06-22", { asin: "B0DUEB" }).map((event) => event.asin)).toEqual(["B0DUEB"]);
    expect(store.listReviewDueEvents("2026-06-22", { status: "REVIEW_PENDING" }).map((event) => event.asin)).toEqual(["B0DUEB"]);
    expect(store.listReviewDueEvents("2026-06-22", { level: "P1", eventType: "RANK_SURGE" }).map((event) => event.asin)).toEqual(["B0DUEB"]);
    expect(store.listReviewDueEvents("2026-06-22", { assignee: "Alice" }).map((event) => event.asin)).toEqual(["B0DUEA"]);
    expect(store.listReviewDueEvents("2026-06-22", { unassignedOnly: true }).map((event) => event.asin)).toEqual(["B0DUEB"]);
    expect(store.listReviewDueEvents("2026-06-22", { limit: 1, offset: 1 }).map((event) => event.asin)).toEqual(["B0DUEA"]);
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

  it("claims due review events in queue priority order when a batch limit applies", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const base = sampleInsightEvent();

    store.upsertInsightEvent({
      ...base,
      id: "2026-06-18|cat1|asin:OLDEST|NEW_TOP50_ENTRY",
      asin: "OLDEST",
      eventTitle: "oldest due",
      eventLevel: "P2",
      reviewDueDate: "2026-06-18",
      scoreTotal: 40
    });
    store.upsertInsightEvent({
      ...base,
      id: "2026-06-20|cat1|asin:EARLYP2|NEW_TOP50_ENTRY",
      asin: "EARLYP2",
      eventTitle: "same date lower level",
      eventLevel: "P2",
      reviewDueDate: "2026-06-20",
      scoreTotal: 99
    });
    store.upsertInsightEvent({
      ...base,
      id: "2026-06-20|cat1|asin:EARLYP0|NEW_TOP50_ENTRY",
      asin: "EARLYP0",
      eventTitle: "same date higher level",
      eventLevel: "P0",
      reviewDueDate: "2026-06-20",
      scoreTotal: 50
    });
    store.upsertInsightEvent({
      ...base,
      id: "2026-06-22|cat1|asin:LATERP0|NEW_TOP50_ENTRY",
      asin: "LATERP0",
      eventTitle: "later high priority",
      eventLevel: "P0",
      reviewDueDate: "2026-06-22",
      scoreTotal: 100
    });

    expect(store.listReviewDueEvents("2026-06-22").map((event) => event.asin)).toEqual([
      "OLDEST",
      "EARLYP0",
      "EARLYP2",
      "LATERP0"
    ]);
    expect(store.claimReviewDueEvents("2026-06-22", "priority-claim", { limit: 2 }).map((event) => event.asin)).toEqual([
      "OLDEST",
      "EARLYP0"
    ]);
  });

  describe("listTopInsights", () => {
    it("returns top actionable events for the date, deduped by ASIN", () => {
      const db = new DatabaseSync(":memory:");
      initSchema(db);
      const store = createStore(db);

      // Two events for the same ASIN — only the higher-scoring one should surface
      store.upsertInsightEvent({
        ...sampleInsightEvent(),
        asin: "B0DUPE",
        eventTitle: "low",
        eventLevel: "P2",
        scoreTotal: 40
      });
      store.upsertInsightEvent({
        ...sampleInsightEvent(),
        id: "2026-06-19|cat1|asin:B0DUPE|COUPON",
        asin: "B0DUPE",
        eventTitle: "high",
        eventType: "COUPON_ADDED",
        eventLevel: "P0",
        scoreTotal: 90
      });

      // Core competitor rank surge should rank above a passive P2 entry
      store.upsertInsightEvent({
        ...sampleInsightEvent(),
        id: "2026-06-19|cat1|asin:B0CORE|RANK",
        asin: "B0CORE",
        eventTitle: "core surge",
        eventType: "RANK_SURGE",
        eventLevel: "P1",
        evidence: { marketplace: "amazon.com", rankChange: 60, evidenceItems: [] }
      });

      // A brand-level event without ASIN should be excluded from the feed
      store.upsertInsightEvent({
        ...sampleInsightEvent(),
        id: "2026-06-19|cat1|BRAND",
        asin: null,
        eventTitle: "brand event",
        eventType: "BRAND_MATRIX_SURGE",
        eventLevel: "P0",
        scoreTotal: 99
      });

      const top = store.listTopInsights("2026-06-19", 3);
      const asins = top.map((event) => event.asin);
      // B0DUPE should appear exactly once (the high-scoring variant), B0CORE next, brand excluded
      expect(asins).toContain("B0DUPE");
      expect(asins.filter((asin) => asin === "B0DUPE")).toHaveLength(1);
      expect(asins).not.toContain(null);
      expect(top[0].asin).toBe("B0DUPE");
    });

    it("excludes events that are not actionable", () => {
      const db = new DatabaseSync(":memory:");
      initSchema(db);
      const store = createStore(db);

      store.upsertInsightEvent({
        ...sampleInsightEvent(),
        asin: "B0ACTIVE",
        eventTitle: "todo"
      });
      store.upsertInsightEvent({
        ...sampleInsightEvent(),
        id: "2026-06-19|cat1|asin:B0IGNORED|IGN",
        asin: "B0IGNORED",
        eventTitle: "ignored",
        status: "IGNORED"
      });

      const top = store.listTopInsights("2026-06-19", 5);
      expect(top.map((event) => event.asin)).toEqual(["B0ACTIVE"]);
    });

    it("honors the limit parameter", () => {
      const db = new DatabaseSync(":memory:");
      initSchema(db);
      const store = createStore(db);

      for (let i = 0; i < 8; i += 1) {
        store.upsertInsightEvent({
          ...sampleInsightEvent(),
          id: `2026-06-19|cat1|asin:B0${i}|RANK`,
          asin: `B0${i}`,
          eventTitle: `event ${i}`,
          scoreTotal: 80 - i,
          eventLevel: "P1"
        });
      }
      const top = store.listTopInsights("2026-06-19", 3);
      expect(top).toHaveLength(3);
    });
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
