import type {
  AlertLog,
  BsrRankChange,
  BestsellerRankSnapshot,
  CategorySignalLog,
  CompetitorActivityEvent,
  DailyChange,
  DashboardSummary,
  InsightEvent,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { insightEventTypeLabels } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { collectDailyInsightReportData, type DailyInsightReportData } from "../reports/insight-report.js";

const MAX_CRITICAL_EVENTS = 5;
const MAX_MOVERS = 3;
const MAX_PRICE_ALERTS = 5;
const MAX_KEYWORD_MOVEMENTS = 5;

export interface NotificationBriefMetric {
  label: string;
  before: string;
  now: string;
  delta?: string;
}

export interface NotificationBriefEvent {
  id: string;
  severity: "critical" | "important";
  tag: string;
  title: string;
  asin: string | null;
  brand: string | null;
  productTitle: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  primaryMetric: NotificationBriefMetric | null;
  metrics: NotificationBriefMetric[];
  insight: string;
  action: string;
  priority: number;
}

export interface NotificationBriefRankingMover {
  direction: "up" | "down";
  label: string;
  asin: string;
  previousRank: number | null;
  currentRank: number | null;
  rankChange: number | null;
  productUrl: string | null;
}

export interface NotificationBriefPriceAlert {
  label: string;
  asin: string;
  brand: string | null;
  title: string;
  before: string | null;
  now: string | null;
  detail: string;
  productUrl: string | null;
  priority: number;
}

export interface NotificationBriefKeywordMovement {
  keyword: string;
  asin: string;
  brand: string | null;
  previousRank: number | null;
  currentRank: number | null;
  rankChange: number | null;
  title: string;
}

export interface NotificationBriefData {
  date: string;
  summary: DashboardSummary;
  monitorScope: string;
  insightData: DailyInsightReportData;
  criticalEvents: NotificationBriefEvent[];
  criticalCount: number;
  productsChanged: number;
  marketMetrics: {
    priceDrops: number;
    rankingSurges: number;
    newListings: number;
    keywordMovements: number;
    couponChanges: number;
    activityLevel: "high" | "medium" | "low" | "quiet";
    activityInsight: string;
  };
  rankingMovers: { gainers: NotificationBriefRankingMover[]; losers: NotificationBriefRankingMover[] };
  priceAlerts: NotificationBriefPriceAlert[];
  keywordMovements: NotificationBriefKeywordMovement[];
  otherChanges: { total: number; counts: Array<{ label: string; count: number }> };
}

export interface NotificationBriefLinks {
  dashboardUrl?: string | null;
  reportUrl?: string | null;
}

export function collectNotificationBriefData(
  store: Store,
  date: string,
  summary?: DashboardSummary,
  orgId = 1
): NotificationBriefData {
  const dashboardSummary = summary ?? store.getDashboardSummary(date, orgId);
  const insightData = collectDailyInsightReportData(store, date, orgId);
  const dailyChanges = store.listDailyChanges({ orgId, date });
  const bsrChanges = store.listBsrRankChanges({ orgId, date, includeUnchanged: false, limit: 5000 });
  const categorySignals = store.listCategorySignals({ orgId, date, limit: 2000 });
  const activityEvents = store.listCategoryActivityEvents({ orgId, date, limit: 3000 });
  const priceHistory = store.listProductPriceHistory({ orgId, date, limit: 3000 });
  const categorySnapshots = store.listCategorySnapshots({ orgId, date, limit: 2000 });
  const alerts = store.listAlerts({ orgId, date, limit: 2000 });
  const criticalCandidates = buildCriticalEvents(insightData.insightEvents, categorySignals, alerts, bsrChanges);
  const criticalEvents = criticalCandidates.slice(0, MAX_CRITICAL_EVENTS);
  const keywordMovements = buildKeywordMovements(dailyChanges, insightData.insightEvents);
  const marketMetrics = buildMarketMetrics({ insightEvents: insightData.insightEvents, categorySignals, activityEvents, dailyChanges, bsrChanges, keywordMovements });

  return {
    date,
    summary: dashboardSummary,
    monitorScope: buildMonitorScope(store, orgId),
    insightData,
    criticalEvents,
    criticalCount: criticalCandidates.filter((event) => event.severity === "critical").length,
    productsChanged: countChangedProducts({ insightEvents: insightData.insightEvents, categorySignals, activityEvents, dailyChanges, bsrChanges, alerts }),
    marketMetrics,
    rankingMovers: buildRankingMovers(bsrChanges),
    priceAlerts: buildPriceAlerts({ priceHistory, categorySnapshots, activityEvents, insightEvents: insightData.insightEvents, dailyChanges }),
    keywordMovements,
    otherChanges: buildOtherChanges({ insightEvents: insightData.insightEvents, categorySignals, activityEvents, dailyChanges })
  };
}

export function buildNotificationBriefText(data: NotificationBriefData, links: NotificationBriefLinks = {}): string {
  return [
    "# Amazon Competitive Intelligence Brief",
    "",
    `${data.date} · ${data.monitorScope}`,
    `${data.criticalCount} Critical Changes · ${data.productsChanged} Products Changed`,
    "",
    "## Today in 30 seconds",
    ...buildExecutiveSummary(data).map((line) => `- ${line}`),
    "",
    "## Critical Alerts",
    ...(data.criticalEvents.length ? data.criticalEvents.map(formatEventText) : ["- No critical or important events recorded"]),
    "",
    "## Market Movement",
    `- Products Changed: ${data.productsChanged}`,
    `- Price Drops: ${data.marketMetrics.priceDrops}`,
    `- Ranking Surges: ${data.marketMetrics.rankingSurges}`,
    `- New Listings: ${data.marketMetrics.newListings}`,
    `- Market read: ${data.marketMetrics.activityInsight}`,
    "",
    "## Leaderboard Movers",
    ...formatMoversText(data.rankingMovers),
    "",
    "## Price & Promotion Watch (BSR Coupon / Deal)",
    ...(data.priceAlerts.length ? data.priceAlerts.map(formatPriceAlertText) : ["- No price or promotion alerts recorded"]),
    "",
    "## Keyword Movement",
    ...(data.keywordMovements.length ? data.keywordMovements.map(formatKeywordMovementText) : ["- No keyword ranking movement recorded"]),
    "",
    `## Other Changes (${data.otherChanges.total})`,
    ...formatOtherChangesText(data.otherChanges),
    "",
    "## Email actions",
    links.dashboardUrl ? `- View full market brief: ${links.dashboardUrl}` : "- View full market brief: configure PUBLIC_BASE_URL",
    links.reportUrl ? `- Download Excel evidence: ${links.reportUrl}` : "- Download Excel evidence: included as attachment"
  ].join("\n");
}

export function buildExecutiveSummary(data: NotificationBriefData): string[] {
  const lines = data.criticalEvents.slice(0, 3).map((event, index) => {
    const prefix = event.severity === "critical" ? "🔴" : index === 1 ? "🟠" : "🟡";
    const headline = event.primaryMetric
      ? `${event.primaryMetric.label} ${event.primaryMetric.before} → ${event.primaryMetric.now}`
      : event.insight;
    return `${prefix} ${event.title}: ${compactText(headline, 150)}`;
  });
  if (data.marketMetrics.rankingSurges > 0 && lines.length < 4) {
    lines.push(`🟠 ${data.marketMetrics.rankingSurges} ranking movements recorded; ${data.marketMetrics.priceDrops} price drops and ${data.marketMetrics.couponChanges} promotion changes need context.`);
  }
  if (data.keywordMovements.length > 0 && lines.length < 4) {
    lines.push(`🟢 ${data.keywordMovements.length} monitored keyword movements are ready for review in the dashboard.`);
  }
  return lines.length ? lines.slice(0, 4) : ["🟢 No material critical changes were recorded; review the full brief for the latest market state."];
}

function buildCriticalEvents(insightEvents: InsightEvent[], categorySignals: CategorySignalLog[], alerts: AlertLog[], bsrChanges: BsrRankChange[]): NotificationBriefEvent[] {
  const selectedByAsin = new Map<string, InsightEvent>();
  for (const event of insightEvents.filter(isImportantInsight)) {
    const key = event.asin ?? event.id;
    const current = selectedByAsin.get(key);
    if (!current || insightPriority(event) > insightPriority(current)) selectedByAsin.set(key, event);
  }
  const selected = [...selectedByAsin.values()].map(buildInsightEvent);
  const occupied = new Set(selected.map((event) => event.asin).filter((asin): asin is string => Boolean(asin)));
  const fallback = [
    ...categorySignals.filter((signal) => isImportantLevel(signal.alertLevel) && (!signal.asin || !occupied.has(signal.asin))).map(buildCategorySignalEvent),
    ...alerts.filter((alert) => isImportantLevel(alert.alertLevel) && !occupied.has(alert.asin)).map(buildAlertEvent),
    ...bsrChanges.filter((change) => (change.changeType === "new_entry" || (change.rankChange ?? 0) >= 10) && !occupied.has(change.asin)).map(buildBsrEvent)
  ];
  const unique = new Map<string, NotificationBriefEvent>();
  for (const event of [...selected, ...fallback]) {
    const key = event.asin ? `${event.severity}|${event.asin}` : event.id;
    const current = unique.get(key);
    if (!current || event.priority > current.priority) unique.set(key, event);
  }
  return [...unique.values()].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

function buildInsightEvent(event: InsightEvent): NotificationBriefEvent {
  const metrics = insightMetrics(event).filter((metric): metric is NotificationBriefMetric => metric !== null);
  return {
    id: event.id,
    severity: event.eventLevel === "P0" || event.scoreLevel === "S" ? "critical" : "important",
    tag: eventTag(event.eventType),
    title: `${eventTag(event.eventType)} ${event.brand ?? event.asin ?? "Market signal"}`,
    asin: event.asin,
    brand: event.brand,
    productTitle: event.evidence.title ?? null,
    imageUrl: event.evidence.imageUrl ?? null,
    productUrl: event.evidence.productUrl ?? null,
    primaryMetric: metrics[0] ?? null,
    metrics,
    insight: compactText(event.eventSummary, 210),
    action: compactText(event.suggestedAction, 180),
    priority: insightPriority(event)
  };
}

function buildCategorySignalEvent(signal: CategorySignalLog): NotificationBriefEvent {
  const metrics = [rankMetric(signal.previousRank, signal.rank), priceMetric(signal.previousPrice, signal.price)].filter((metric): metric is NotificationBriefMetric => metric !== null);
  return {
    id: `category:${signal.id ?? `${signal.signalDate}:${signal.categoryId}:${signal.asin ?? signal.signalType}`}`,
    severity: signal.alertLevel === "critical" || signal.alertLevel === "high" ? "critical" : "important",
    tag: signalTag(signal.signalType),
    title: `${signalTag(signal.signalType)} ${signal.brand ?? signal.asin ?? signal.categoryName}`,
    asin: signal.asin,
    brand: signal.brand,
    productTitle: signal.title,
    imageUrl: null,
    productUrl: null,
    primaryMetric: metrics[0] ?? null,
    metrics,
    insight: compactText(signal.content, 210),
    action: signalAction(signal.signalType),
    priority: alertLevelPriority(signal.alertLevel) + Math.max(0, 100 - (signal.rank ?? 100))
  };
}

function buildAlertEvent(alert: AlertLog): NotificationBriefEvent {
  return {
    id: `alert:${alert.id ?? `${alert.alertDate}:${alert.keyword}:${alert.asin}:${alert.alertType}`}`,
    severity: alert.alertLevel === "critical" || alert.alertLevel === "high" ? "critical" : "important",
    tag: "⚠ Market Alert / 市场告警",
    title: `⚠ Market Alert / 市场告警 ${alert.brand ?? alert.asin}`,
    asin: alert.asin,
    brand: alert.brand,
    productTitle: alert.title,
    imageUrl: null,
    productUrl: null,
    primaryMetric: null,
    metrics: [],
    insight: compactText(alert.alertContent, 210),
    action: `检查关键词“${alert.keyword}”的自然位、Sponsored 位和商品历史。`,
    priority: alertLevelPriority(alert.alertLevel)
  };
}

function buildBsrEvent(change: BsrRankChange): NotificationBriefEvent {
  const metric = rankMetric(change.previousRank, change.currentRank, change.rankChange);
  const up = change.changeType === "new_entry" || (change.rankChange ?? 0) > 0;
  const tag = up ? "🚀 Ranking Surge / 排名拉升" : "⚠ Ranking Drop / 排名下滑";
  return {
    id: `bsr:${change.sourceType}:${change.sourceId ?? ""}:${change.category}:${change.asin}`,
    severity: up && (change.rankChange ?? 0) >= 20 ? "critical" : "important",
    tag,
    title: `${tag} ${change.brand ?? change.asin}`,
    asin: change.asin,
    brand: change.brand,
    productTitle: change.title,
    imageUrl: null,
    productUrl: change.productUrl,
    primaryMetric: metric,
    metrics: metric ? [metric] : [],
    insight: `${change.category} BSR changed ${formatRank(change.previousRank)} → ${formatRank(change.currentRank)}.`,
    action: "检查该 ASIN 的价格、Coupon 与核心关键词走势，确认排名变化是否可持续。",
    priority: (up ? 250 : 150) + Math.abs(change.rankChange ?? 0)
  };
}

function insightMetrics(event: InsightEvent): Array<NotificationBriefMetric | null> {
  const evidence = event.evidence;
  return [
    rankMetric(evidence.previousRank ?? null, evidence.currentRank ?? null, evidence.rankChange ?? null),
    priceMetric(evidence.priceBefore ?? null, evidence.priceAfter ?? null, evidence.priceChangeRate ?? null),
    reviewMetric(evidence.reviewCountBefore ?? null, evidence.reviewCountAfter ?? null, evidence.reviewCountChange ?? null),
    textMetric("Coupon", evidence.couponBefore ?? null, evidence.couponAfter ?? null),
    numberMetric("Rating", evidence.ratingBefore ?? null, evidence.ratingAfter ?? null, evidence.ratingChange ?? null)
  ];
}

function buildRankingMovers(changes: BsrRankChange[]): NotificationBriefData["rankingMovers"] {
  const gainers = changes.filter((change) => change.changeType === "rank_up" || change.changeType === "new_entry").sort((left, right) => (right.rankChange ?? 999999) - (left.rankChange ?? 999999) || (left.currentRank ?? 999999) - (right.currentRank ?? 999999)).slice(0, MAX_MOVERS).map((change) => rankingMover(change, "up"));
  const losers = changes.filter((change) => change.changeType === "rank_down" || change.changeType === "dropped").sort((left, right) => (left.rankChange ?? -999999) - (right.rankChange ?? -999999) || (right.currentRank ?? 0) - (left.currentRank ?? 0)).slice(0, MAX_MOVERS).map((change) => rankingMover(change, "down"));
  return { gainers, losers };
}

function rankingMover(change: BsrRankChange, direction: "up" | "down"): NotificationBriefRankingMover {
  return { direction, label: change.brand ?? (change.title.slice(0, 28) || change.asin), asin: change.asin, previousRank: change.previousRank, currentRank: change.currentRank, rankChange: change.rankChange, productUrl: change.productUrl };
}

function buildPriceAlerts(input: { priceHistory: ProductPriceHistory[]; categorySnapshots: BestsellerRankSnapshot[]; activityEvents: CompetitorActivityEvent[]; insightEvents: InsightEvent[]; dailyChanges: DailyChange[] }): NotificationBriefPriceAlert[] {
  const alerts: NotificationBriefPriceAlert[] = [];
  for (const item of input.priceHistory) {
    if (item.currentPrice !== null && item.t90LowPrice !== null && item.currentPrice <= item.t90LowPrice) alerts.push({ label: "90D Low", asin: item.asin, brand: item.brand, title: item.title, before: null, now: formatPrice(item.currentPrice), detail: "Current price is at or below the recorded 90-day low.", productUrl: item.productUrl ?? null, priority: 80 });
    if (item.couponText || item.dealBadge) alerts.push({ label: item.dealBadge ? "Deal Active" : "Coupon Active", asin: item.asin, brand: item.brand, title: item.title, before: null, now: promotionText(item.couponText, item.dealBadge), detail: "Promotion is active in the latest category snapshot.", productUrl: item.productUrl ?? null, priority: 55 });
  }
  for (const item of input.categorySnapshots.filter((snapshot) => snapshot.couponText || snapshot.dealBadge)) alerts.push({ label: item.dealBadge ? "Deal Active" : "Coupon Active", asin: item.asin, brand: item.brand, title: item.title, before: null, now: promotionText(item.couponText, item.dealBadge), detail: "Promotion is active in the latest BSR snapshot.", productUrl: item.productUrl ?? null, priority: 50 });
  for (const event of input.activityEvents.filter((item) => ["price_drop", "coupon_start", "coupon_increase", "deal_start"].includes(item.eventType))) alerts.push({ label: activityLabel(event.eventType), asin: event.asin ?? "-", brand: event.brand, title: event.title ?? event.asin ?? "Market event", before: event.priceBefore === null ? null : formatPrice(event.priceBefore), now: event.priceAfter === null ? event.couponAfter ?? event.dealType : formatPrice(event.priceAfter), detail: compactText(event.eventSummary, 160), productUrl: null, priority: eventLevelPriority(event.eventLevel) });
  for (const event of input.insightEvents.filter((item) => ["PRICE_DROP", "PRICE_NEW_LOW", "COUPON_ADDED", "DEAL_ADDED"].includes(item.eventType))) {
    const price = insightMetrics(event).find((metric) => metric?.label === "Price") ?? null;
    alerts.push({ label: event.eventType === "PRICE_NEW_LOW" ? "New Low" : event.eventType === "COUPON_ADDED" ? "Coupon Added" : event.eventType === "DEAL_ADDED" ? "Deal Started" : "Price Drop", asin: event.asin ?? "-", brand: event.brand, title: event.evidence.title ?? event.eventTitle, before: price?.before ?? null, now: price?.now ?? null, detail: compactText(event.eventSummary, 160), productUrl: event.evidence.productUrl ?? null, priority: insightPriority(event) });
  }
  for (const change of input.dailyChanges.filter((item) => ["price_drop", "historical_low", "new_coupon"].includes(item.changeType))) alerts.push({ label: change.changeType === "historical_low" ? "New Low" : change.changeType === "new_coupon" ? "Coupon Added" : "Price Drop", asin: change.asin, brand: change.brand, title: change.title, before: formatPrice(change.yesterdayPrice), now: formatPrice(change.todayPrice), detail: `${change.keyword} · ${change.changeType}`, productUrl: null, priority: 60 });
  const unique = new Map<string, NotificationBriefPriceAlert>();
  for (const alert of alerts) {
    if (alert.asin === "-") continue;
    const key = `${alert.label}|${alert.asin}`;
    const current = unique.get(key);
    if (!current || alert.priority > current.priority) unique.set(key, alert);
  }
  return [...unique.values()].sort((left, right) => right.priority - left.priority || left.asin.localeCompare(right.asin)).slice(0, MAX_PRICE_ALERTS);
}

function buildKeywordMovements(changes: DailyChange[], events: InsightEvent[]): NotificationBriefKeywordMovement[] {
  const movements = changes.filter((change) => change.rankChange !== null && change.rankChange !== 0).map((change) => ({ keyword: change.keyword, asin: change.asin, brand: change.brand, previousRank: change.yesterdayRank, currentRank: change.todayRank, rankChange: change.rankChange, title: change.title }));
  for (const event of events.filter((item) => item.eventType === "KEYWORD_PAGE_DROP" && item.evidence.keyword)) movements.push({ keyword: event.evidence.keyword!, asin: event.asin ?? "-", brand: event.brand, previousRank: event.evidence.previousRank ?? null, currentRank: event.evidence.currentRank ?? null, rankChange: event.evidence.rankChange ?? null, title: event.evidence.title ?? event.eventTitle });
  const unique = new Map<string, NotificationBriefKeywordMovement>();
  for (const movement of movements) unique.set(`${movement.keyword}|${movement.asin}`, movement);
  return [...unique.values()].sort((left, right) => Math.abs(right.rankChange ?? 0) - Math.abs(left.rankChange ?? 0) || (right.rankChange ?? 0) - (left.rankChange ?? 0)).slice(0, MAX_KEYWORD_MOVEMENTS);
}

function buildMarketMetrics(input: { insightEvents: InsightEvent[]; categorySignals: CategorySignalLog[]; activityEvents: CompetitorActivityEvent[]; dailyChanges: DailyChange[]; bsrChanges: BsrRankChange[]; keywordMovements: NotificationBriefKeywordMovement[] }): NotificationBriefData["marketMetrics"] {
  const sets = { priceDrops: new Set<string>(), rankingSurges: new Set<string>(), newListings: new Set<string>(), couponChanges: new Set<string>() };
  for (const change of input.dailyChanges) {
    const key = `${change.asin}|${change.keyword}`;
    if (["price_drop", "historical_low"].includes(change.changeType)) sets.priceDrops.add(key);
    if (["new_coupon", "coupon_disappeared", "coupon_strengthened", "coupon_weakened"].includes(change.changeType)) sets.couponChanges.add(key);
    if ((change.rankChange ?? 0) > 0) sets.rankingSurges.add(key);
  }
  for (const change of input.bsrChanges) {
    const key = `${change.asin}|${change.category}`;
    if (change.changeType === "rank_up" || change.changeType === "new_entry") sets.rankingSurges.add(key);
    if (change.changeType === "new_entry") sets.newListings.add(key);
  }
  for (const signal of input.categorySignals) {
    const key = `${signal.asin ?? signal.categoryId}|${signal.signalType}`;
    if (signal.signalType === "price_drop") sets.priceDrops.add(key);
    if (signal.signalType === "major_rank_up" || signal.signalType.startsWith("new_top")) sets.rankingSurges.add(key);
    if (signal.signalType === "new_product_breakout" || signal.signalType === "new_top_100") sets.newListings.add(key);
    if (signal.signalType === "new_coupon" || signal.signalType === "new_deal") sets.couponChanges.add(key);
  }
  for (const event of input.activityEvents) {
    const key = `${event.asin ?? event.categoryId}|${event.eventType}`;
    if (event.eventType === "price_drop") sets.priceDrops.add(key);
    if (["rank_surge", "new_entry_top100", "new_entry_top50"].includes(event.eventType)) sets.rankingSurges.add(key);
    if (["coupon_start", "coupon_end", "coupon_increase", "deal_start", "deal_end"].includes(event.eventType)) sets.couponChanges.add(key);
    if (["new_entry_top100", "new_entry_top50"].includes(event.eventType)) sets.newListings.add(key);
  }
  for (const event of input.insightEvents) {
    const key = `${event.asin ?? event.id}|${event.eventType}`;
    if (["PRICE_DROP", "PRICE_NEW_LOW"].includes(event.eventType)) sets.priceDrops.add(key);
    if (["RANK_SURGE", "NEW_TOP100_ENTRY", "NEW_TOP50_ENTRY", "NEW_TOP20_ENTRY", "NEW_PRODUCT_BREAKOUT"].includes(event.eventType)) sets.rankingSurges.add(key);
    if (["NEW_TOP100_ENTRY", "NEW_TOP50_ENTRY", "NEW_TOP20_ENTRY", "NEW_PRODUCT_BREAKOUT"].includes(event.eventType)) sets.newListings.add(key);
    if (["COUPON_ADDED", "COUPON_REMOVED", "DEAL_ADDED", "DEAL_REMOVED"].includes(event.eventType)) sets.couponChanges.add(key);
  }
  const signalCount = sets.priceDrops.size + sets.rankingSurges.size + sets.newListings.size + sets.couponChanges.size + input.keywordMovements.length;
  const activityLevel = signalCount >= 20 ? "high" : signalCount >= 8 ? "medium" : signalCount > 0 ? "low" : "quiet";
  const drivers = [{ count: sets.priceDrops.size, label: "pricing" }, { count: sets.rankingSurges.size, label: "ranking" }, { count: sets.couponChanges.size, label: "promotion" }].sort((left, right) => right.count - left.count).filter((item) => item.count > 0).slice(0, 2).map((item) => item.label);
  return { priceDrops: sets.priceDrops.size, rankingSurges: sets.rankingSurges.size, newListings: sets.newListings.size, keywordMovements: input.keywordMovements.length, couponChanges: sets.couponChanges.size, activityLevel, activityInsight: activityLevel === "quiet" ? "No material movement was recorded." : `Activity is ${capitalize(activityLevel)}, mainly driven by ${drivers.length ? drivers.join(" and ") : "mixed signals"}.` };
}

function buildOtherChanges(input: { insightEvents: InsightEvent[]; categorySignals: CategorySignalLog[]; activityEvents: CompetitorActivityEvent[]; dailyChanges: DailyChange[] }): NotificationBriefData["otherChanges"] {
  const buckets = new Map<string, Set<string>>([["Price changes", new Set<string>()], ["Review changes", new Set<string>()], ["Listing updates", new Set<string>()], ["Coupon / Deal updates", new Set<string>()], ["Rating changes", new Set<string>()]]);
  for (const change of input.dailyChanges) {
    if (change.changeType.includes("price") || change.changeType === "historical_low") buckets.get("Price changes")!.add(`${change.asin}|${change.keyword}`);
    if (change.changeType.includes("coupon")) buckets.get("Coupon / Deal updates")!.add(`${change.asin}|${change.keyword}`);
  }
  for (const signal of input.categorySignals) {
    if (signal.signalType === "price_drop") buckets.get("Price changes")!.add(`${signal.asin}|${signal.categoryId}`);
    if (["new_coupon", "new_deal"].includes(signal.signalType)) buckets.get("Coupon / Deal updates")!.add(`${signal.asin}|${signal.categoryId}`);
  }
  for (const event of input.activityEvents) {
    if (event.eventType === "price_drop") buckets.get("Price changes")!.add(`${event.asin}|${event.eventKey}`);
    if (event.eventType === "review_growth") buckets.get("Review changes")!.add(`${event.asin}|${event.eventKey}`);
    if (["coupon_start", "coupon_end", "coupon_increase", "deal_start", "deal_end"].includes(event.eventType)) buckets.get("Coupon / Deal updates")!.add(`${event.asin}|${event.eventKey}`);
  }
  for (const event of input.insightEvents) {
    if (["REVIEW_SPIKE", "REVIEW_NEGATIVE_CLUSTER"].includes(event.eventType)) buckets.get("Review changes")!.add(`${event.asin}|${event.id}`);
    if (event.eventType === "LISTING_CHANGED") buckets.get("Listing updates")!.add(`${event.asin}|${event.id}`);
    if (["COUPON_ADDED", "COUPON_REMOVED", "DEAL_ADDED", "DEAL_REMOVED"].includes(event.eventType)) buckets.get("Coupon / Deal updates")!.add(`${event.asin}|${event.id}`);
    if (["RATING_DROP", "OWNED_RATING_DROP"].includes(event.eventType)) buckets.get("Rating changes")!.add(`${event.asin}|${event.id}`);
  }
  const counts = [...buckets.entries()].map(([label, values]) => ({ label, count: values.size })).filter((item) => item.count > 0);
  return { total: counts.reduce((sum, item) => sum + item.count, 0), counts };
}

function countChangedProducts(input: { insightEvents: InsightEvent[]; categorySignals: CategorySignalLog[]; activityEvents: CompetitorActivityEvent[]; dailyChanges: DailyChange[]; bsrChanges: BsrRankChange[]; alerts: AlertLog[] }): number {
  return new Set([...input.insightEvents.map((event) => event.asin ?? event.id), ...input.categorySignals.map((signal) => signal.asin ?? `${signal.categoryId}:${signal.signalType}`), ...input.activityEvents.map((event) => event.asin ?? event.eventKey), ...input.dailyChanges.map((change) => change.asin), ...input.bsrChanges.map((change) => change.asin), ...input.alerts.map((alert) => alert.asin)]).size;
}

function buildMonitorScope(store: Store, orgId: number): string {
  const categories = store.listCategoryMonitors({ orgId, status: "enabled" }).map((item) => item.name.trim()).filter(Boolean);
  const keywords = store.listKeywords({ orgId, status: "enabled" }).map((item) => item.keyword.trim()).filter(Boolean);
  if (categories.length) return categories.length > 2 ? `${categories.slice(0, 2).join(" · ")} + ${categories.length - 2} more markets` : categories.join(" · ");
  if (keywords.length) return keywords.length > 2 ? `${keywords.slice(0, 2).join(" · ")} + ${keywords.length - 2} more keywords` : keywords.join(" · ");
  return "Current monitored scope";
}

function formatEventText(event: NotificationBriefEvent): string {
  const metric = event.primaryMetric ? `${event.primaryMetric.label} ${event.primaryMetric.before} -> ${event.primaryMetric.now}` : "No primary metric";
  return `- [${event.severity}] ${event.title} / ${event.asin ?? "market"}：${metric}。Why it matters: ${event.insight} Next action: ${event.action}`;
}
function formatMoversText(movers: NotificationBriefData["rankingMovers"]): string[] { const lines = [...movers.gainers.map((mover) => `- ↑ ${mover.label} ${formatRank(mover.previousRank)} -> ${formatRank(mover.currentRank)}`), ...movers.losers.map((mover) => `- ↓ ${mover.label} ${formatRank(mover.previousRank)} -> ${formatRank(mover.currentRank)}`)]; return lines.length ? lines : ["- No BSR movers recorded"]; }
function formatPriceAlertText(alert: NotificationBriefPriceAlert): string { return `- [${alert.label}] ${alert.brand ?? alert.asin} ${alert.asin}：${alert.before ?? "-"} -> ${alert.now ?? "-"}。${alert.detail}`; }
function formatKeywordMovementText(movement: NotificationBriefKeywordMovement): string { return `- ${movement.keyword} / ${movement.brand ?? movement.asin}：${formatRank(movement.previousRank)} -> ${formatRank(movement.currentRank)}${movement.rankChange === null ? "" : ` ${movement.rankChange > 0 ? "↑" : "↓"}${Math.abs(movement.rankChange)}`}`; }
function formatOtherChangesText(otherChanges: NotificationBriefData["otherChanges"]): string[] { return otherChanges.counts.length ? otherChanges.counts.map((item) => `- ${item.count} ${item.label}`) : ["- No additional changes recorded"]; }

function isImportantInsight(event: InsightEvent): boolean { return event.eventLevel !== "P2" && (event.scoreLevel === "S" || event.scoreLevel === "A" || event.eventLevel === "P0" || event.eventLevel === "P1"); }
function isImportantLevel(level: AlertLog["alertLevel"]): boolean { return level === "critical" || level === "high"; }
function insightPriority(event: InsightEvent): number { return (event.eventLevel === "P0" ? 300 : event.eventLevel === "P1" ? 200 : 100) + (event.scoreLevel === "S" ? 40 : event.scoreLevel === "A" ? 30 : 0) + event.scoreTotal; }
function alertLevelPriority(level: AlertLog["alertLevel"]): number { return level === "critical" ? 350 : level === "high" ? 260 : level === "medium" ? 160 : 80; }
function eventLevelPriority(level: CompetitorActivityEvent["eventLevel"]): number { return level === "critical" ? 85 : level === "high" ? 75 : level === "medium" ? 60 : 45; }

function eventTag(eventType: InsightEvent["eventType"]): string {
  if (["RANK_SURGE", "NEW_TOP100_ENTRY", "NEW_TOP50_ENTRY", "NEW_TOP20_ENTRY", "BRAND_MATRIX_SURGE"].includes(eventType)) return "🚀 Ranking Surge / 排名拉升";
  if (["PRICE_DROP", "PRICE_NEW_LOW"].includes(eventType)) return "💰 Price War / 价格异动";
  if (["COUPON_ADDED", "COUPON_REMOVED", "DEAL_ADDED", "DEAL_REMOVED"].includes(eventType)) return "🎟 Promotion Change / 促销变化";
  if (eventType === "NEW_PRODUCT_BREAKOUT") return "🆕 New Launch / 新品突破";
  if (["REVIEW_SPIKE", "REVIEW_NEGATIVE_CLUSTER"].includes(eventType)) return "⭐ Review Spike / Review 异动";
  if (["LISTING_CHANGED", "LISTING_HEALTH_LOW"].includes(eventType)) return "📝 Listing Updated / Listing 变化";
  if (["CORE_COMPETITOR_RISK", "RANK_DROP", "DROPPED_FROM_TOP100"].includes(eventType)) return "⚠ Market Threat / 市场威胁";
  return `${insightEventTypeLabels[eventType]} / Market Signal`;
}
function signalTag(signalType: CategorySignalLog["signalType"]): string { if (signalType === "major_rank_up" || signalType.startsWith("new_top")) return "🚀 Ranking Surge / 排名拉升"; if (signalType === "price_drop") return "💰 Price War / 价格异动"; if (["new_coupon", "new_deal"].includes(signalType)) return "🎟 Promotion Change / 促销变化"; if (signalType === "new_product_breakout") return "🆕 New Launch / 新品突破"; return "⚠ Market Signal / 市场信号"; }
function signalAction(signalType: CategorySignalLog["signalType"]): string { return signalType === "price_drop" || signalType === "new_coupon" || signalType === "new_deal" ? "检查该 ASIN 的价格、Coupon、Deal 与 Sponsored Ads 是否同步变化。" : "检查该 ASIN 的核心关键词和排名历史，确认信号是否形成持续趋势。"; }
function activityLabel(eventType: CompetitorActivityEvent["eventType"]): string { return eventType === "price_drop" ? "Price Drop" : eventType === "deal_start" ? "Deal Started" : "Coupon Added"; }

function rankMetric(before: number | null, now: number | null, change?: number | null): NotificationBriefMetric | null { if (before === null && now === null) return null; const delta = change ?? (before !== null && now !== null ? before - now : null); return { label: "BSR", before: formatRank(before), now: formatRank(now), delta: delta && delta !== 0 ? `${delta > 0 ? "↑" : "↓"}${Math.abs(delta)} positions` : undefined }; }
function priceMetric(before: number | null, now: number | null, changeRate?: number | null): NotificationBriefMetric | null { if (before === null && now === null) return null; const rate = changeRate ?? (before !== null && before !== 0 && now !== null ? (now - before) / before : null); return { label: "Price", before: formatPrice(before), now: formatPrice(now), delta: rate && rate !== 0 ? `${rate > 0 ? "↑" : "↓"}${formatPercent(Math.abs(rate))}` : undefined }; }
function reviewMetric(before: number | null, now: number | null, change?: number | null): NotificationBriefMetric | null { if (before === null && now === null) return null; const delta = change ?? (before !== null && now !== null ? now - before : null); return { label: "Reviews", before: formatCount(before), now: formatCount(now), delta: delta && delta !== 0 ? `${delta > 0 ? "+" : ""}${formatCount(delta)}` : undefined }; }
function numberMetric(label: string, before: number | null, now: number | null, change?: number | null): NotificationBriefMetric | null { if (before === null && now === null) return null; const delta = change ?? (before !== null && now !== null ? now - before : null); return { label, before: before === null ? "-" : formatNumber(before, 1), now: now === null ? "-" : formatNumber(now, 1), delta: delta && delta !== 0 ? `${delta > 0 ? "+" : ""}${formatNumber(delta, 1)}` : undefined }; }
function textMetric(label: string, before: string | null, now: string | null): NotificationBriefMetric | null { return before || now ? { label, before: before || "None", now: now || "None" } : null; }
function formatRank(value: number | null): string { return value === null ? "-" : `#${formatNumber(value)}`; }
function formatPrice(value: number | null): string { return value === null ? "-" : `$${value.toFixed(2)}`; }
function formatCount(value: number | null): string { return value === null ? "-" : formatNumber(value); }
function formatPercent(value: number): string { return `${(value * 100).toFixed(1)}%`; }
function formatNumber(value: number, maximumFractionDigits = 0): string { return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value); }
function promotionText(couponText: string | null | undefined, dealBadge: string | null | undefined): string | null { const values = [couponText?.trim(), dealBadge?.trim()].filter((value): value is string => Boolean(value)); return values.length ? values.join(" / ") : null; }
function compactText(value: string, maxLength: number): string { const normalized = value.replace(/\s+/g, " ").trim(); return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized; }
function capitalize(value: string): string { return value.slice(0, 1).toUpperCase() + value.slice(1); }
