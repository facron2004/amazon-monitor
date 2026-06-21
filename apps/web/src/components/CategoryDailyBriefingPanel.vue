<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  ExternalLink,
  Flame,
  Search,
  Sparkles,
  Tags,
  Target,
  X
} from "@lucide/vue";
import type {
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrRankChange,
  CompetitorActivityEvent,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { useCategoryStore } from "../stores/category";
import { compactText, levelWeight } from "../utils/category-intelligence";
import {
  changeLabel,
  formatCount,
  formatMoney,
  formatPercent,
  formatSignedCount,
  imgFallback,
  localizeGeneratedText,
  promoText
} from "../utils/formatters";

interface InsightCard {
  key: string;
  event: CompetitorActivityEvent;
  snapshot: BestsellerRankSnapshot | null;
  title: string;
  asin: string | null;
  brand: string;
  tag: string;
  rankBefore: number | null;
  rankAfter: number | null;
  rankDelta: number | null;
  priceBefore: number | null;
  priceAfter: number | null;
  promo: string;
  reviewDelta: number | null;
  score: number;
}

interface OpportunityCard {
  snapshot: BestsellerRankSnapshot;
  score: number;
  reason: string;
}

type DrawerState =
  | { mode: "event"; item: InsightCard }
  | { mode: "brand"; item: BrandMatrixSnapshot }
  | { mode: "opportunity"; item: OpportunityCard }
  | null;

const store = useCategoryStore();
const {
  categoryDetail,
  selectedCategory,
  categoryDataDate,
  topBrandMatrix,
  categorySignals,
  bsrRankChanges,
  activityEvents,
  priceHistory
} = storeToRefs(store);

const drawer = ref<DrawerState>(null);

const snapshots = computed(() => categoryDetail.value?.snapshots ?? []);
const snapshotByAsin = computed(
  () => new Map(snapshots.value.map((item) => [item.asin, item]))
);

const top100Count = computed(() => snapshots.value.filter((item) => item.rank <= 100).length);
const top50Count = computed(() => snapshots.value.filter((item) => item.rank <= 50).length);
const promoActiveCount = computed(() => snapshots.value.filter((item) => promoText(item) !== "-").length);
const highPriorityCount = computed(() => activityEvents.value.filter((item) => levelWeight(item.eventLevel) >= 3).length);

const newTop100Count = computed(() => activityEvents.value.filter((item) => item.eventType === "new_entry_top100").length);
const newTop50Count = computed(() => activityEvents.value.filter((item) => item.eventType === "new_entry_top50").length);
const droppedTop100Count = computed(() => bsrRankChanges.value.filter((item) => item.changeType === "dropped").length);
const couponStartCount = computed(() => activityEvents.value.filter((item) => item.eventType === "coupon_start").length);
const dealStartCount = computed(() => activityEvents.value.filter((item) => item.eventType === "deal_start").length);
const priceDownCount = computed(() => activityEvents.value.filter((item) => item.eventType === "price_drop").length);
const priceLowCount = computed(() => priceHistory.value.filter((item) => isAtLowPrice(item)).length);

const strongestBrand = computed(() => topBrandMatrix.value[0] ?? null);
const brandConcentration = computed(() => {
  const topFiveCount = topBrandMatrix.value.slice(0, 5).reduce((sum, item) => sum + item.productCountTop100, 0);
  return top100Count.value ? Math.round((topFiveCount / top100Count.value) * 100) : 0;
});

// 单次遍历同时算出 maxRise / maxFall,避免对 bsrRankChanges 做两次 clone + 两次 sort。
// 用 for-of 一次性记录最大值/最小值,O(n) 替代之前的 2×O(n log n)。
const rankExtremes = computed(() => {
  let maxRiseEntry: { item: BsrRankChange; delta: number } | null = null;
  let maxFallEntry: { item: BsrRankChange; delta: number } | null = null;
  for (const item of bsrRankChanges.value) {
    const delta = rankDelta(item.previousRank, item.currentRank);
    if (delta === null) continue;
    if (delta > 0 && (maxRiseEntry === null || delta > maxRiseEntry.delta)) {
      maxRiseEntry = { item, delta };
    } else if (delta < 0 && (maxFallEntry === null || delta < maxFallEntry.delta)) {
      maxFallEntry = { item, delta };
    }
  }
  return { maxRise: maxRiseEntry, maxFall: maxFallEntry };
});
const maxRise = computed(() => rankExtremes.value.maxRise);
const maxFall = computed(() => rankExtremes.value.maxFall);

const battleKpis = computed(() => [
  {
    label: "新进 Top100",
    value: newTop100Count.value,
    note: `${formatPercent(top100Count.value ? newTop100Count.value / top100Count.value : 0)} 换血率`,
    tone: "new",
    icon: Sparkles
  },
  {
    label: "新进 Top50",
    value: newTop50Count.value,
    note: `Top50 覆盖 ${top50Count.value} 个 ASIN`,
    tone: "rise",
    icon: ArrowUpRight
  },
  {
    label: "跌出 Top100",
    value: droppedTop100Count.value,
    note: "需要复盘掉队对象",
    tone: "fall",
    icon: ArrowDownRight
  },
  {
    label: "最大上升",
    value: maxRise.value ? maxRise.value.item.asin : "-",
    note: maxRise.value ? rankPath(maxRise.value.item.previousRank, maxRise.value.item.currentRank) : "暂无明显上升",
    tone: "rise",
    icon: Flame
  },
  {
    label: "新增 Coupon",
    value: couponStartCount.value,
    note: `${promoActiveCount.value} 个商品带活动`,
    tone: "activity",
    icon: BadgePercent
  },
  {
    label: "价格新低",
    value: priceLowCount.value,
    note: `${priceDownCount.value} 个价格下降事件`,
    tone: "price",
    icon: Target
  },
  {
    label: "品牌集中度",
    value: `${brandConcentration.value}%`,
    note: strongestBrand.value ? `${strongestBrand.value.brand} 占 ${strongestBrand.value.productCountTop100} 席` : "暂无品牌矩阵",
    tone: "brand",
    icon: Tags
  }
]);

const aiSummary = computed(() => {
  const riseText = maxRise.value
    ? `${maxRise.value.item.asin} ${rankPath(maxRise.value.item.previousRank, maxRise.value.item.currentRank)}`
    : "暂无单个 ASIN 大幅上升";
  const fallText = maxFall.value
    ? `${maxFall.value.item.asin} ${rankPath(maxFall.value.item.previousRank, maxFall.value.item.currentRank)}`
    : "暂无单个 ASIN 大幅下滑";
  const brandText = strongestBrand.value
    ? `${strongestBrand.value.brand} 以 Top100 ${strongestBrand.value.productCountTop100} 席、Top50 ${strongestBrand.value.productCountTop50} 席保持最高占位`
    : "当前还没有足够品牌矩阵数据";

  return [
    `发生了什么：Top100 新进 ${newTop100Count.value} 个 ASIN，Top50 新进 ${newTop50Count.value} 个，跌出 Top100 ${droppedTop100Count.value} 个；${riseText}，${fallText}。`,
    `可能原因：新增 Coupon ${couponStartCount.value} 个、新增 Deal ${dealStartCount.value} 个、价格下降事件 ${priceDownCount.value} 个，价格新低 ${priceLowCount.value} 个。`,
    `影响判断：${brandText}；Top5 品牌集中度约 ${brandConcentration.value}%，高优事件 ${highPriorityCount.value} 条。`,
    `建议动作：先处理重点异动卡片中的高优 ASIN，再复核新品黑马和价格活动雷达，最后进入完整 BSR 榜单做批量筛选。`
  ];
});

const insightCards = computed<InsightCard[]>(() => {
  return activityEvents.value
    .map((event) => {
      const snapshot = event.asin ? snapshotByAsin.value.get(event.asin) ?? null : null;
      const rankAfter = event.rankAfter ?? snapshot?.rank ?? null;
      const rankBefore = event.rankBefore;
      const priceAfter = event.priceAfter ?? snapshot?.currentPrice ?? null;
      const priceBefore = event.priceBefore;
      const delta = rankDelta(rankBefore, rankAfter);
      return {
        key: event.eventKey,
        event,
        snapshot,
        title: event.title || snapshot?.title || localizeGeneratedText(event.eventSummary),
        asin: event.asin,
        brand: event.brand || snapshot?.brand || "未知品牌",
        tag: changeLabel(event.eventType),
        rankBefore,
        rankAfter,
        rankDelta: delta,
        priceBefore,
        priceAfter,
        promo: event.couponAfter || event.dealType || (snapshot ? promoText(snapshot) : "-"),
        reviewDelta: event.reviewCountChange ?? null,
        score: eventScore(event)
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
});

const opportunityCards = computed<OpportunityCard[]>(() => {
  const signalAsins = new Set(categorySignals.value.filter((item) => item.signalType === "new_product_breakout").map((item) => item.asin));
  return snapshots.value
    .filter((item) => {
      const lowReview = item.reviewCount !== null && item.reviewCount < 100;
      return signalAsins.has(item.asin) || (item.rank <= 100 && lowReview) || (item.rank <= 50 && promoText(item) !== "-");
    })
    .map((snapshot) => {
      const score = opportunityScore(snapshot, signalAsins.has(snapshot.asin));
      return {
        snapshot,
        score,
        reason: opportunityReason(snapshot, signalAsins.has(snapshot.asin))
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
});

const priceRadarItems = computed(() => [
  { label: "新增 Coupon", value: couponStartCount.value, note: "活动增强信号" },
  { label: "取消 Coupon", value: activityEvents.value.filter((item) => item.eventType === "coupon_end").length, note: "活动结束风险" },
  { label: "新增 Deal", value: dealStartCount.value, note: "促销节奏变化" },
  { label: "价格下降", value: priceDownCount.value, note: "价格战观察" },
  { label: "价格新低", value: priceLowCount.value, note: "T30/T60/T90 或监控低价" },
  {
    label: "降价后上升",
    value: activityEvents.value.filter((item) => item.eventType === "price_drop" && (rankDelta(item.rankBefore, item.rankAfter) ?? 0) > 0).length,
    note: "可能存在价格驱动"
  }
]);

function eventScore(event: CompetitorActivityEvent): number {
  const typeScore: Record<CompetitorActivityEvent["eventType"], number> = {
    new_entry_top50: 100,
    rank_surge: 92,
    brand_matrix_push: 86,
    new_entry_top100: 82,
    price_drop: 74,
    coupon_start: 70,
    deal_start: 70,
    review_growth: 64,
    activity_end_rank_drop: 62,
    coupon_increase: 58,
    coupon_end: 48,
    deal_end: 48
  };

  return (typeScore[event.eventType] ?? 40) + levelWeight(event.eventLevel) * 8 - (event.rankAfter ?? 120) / 10;
}

function rankDelta(previousRank: number | null | undefined, currentRank: number | null | undefined): number | null {
  if (!previousRank || !currentRank) {
    return null;
  }
  return previousRank - currentRank;
}

function rankPath(previousRank: number | null | undefined, currentRank: number | null | undefined): string {
  return `${previousRank ? `#${previousRank}` : "-"} -> ${currentRank ? `#${currentRank}` : "-"}`;
}

function formatRankDelta(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return value > 0 ? `上升 ${value}` : value < 0 ? `下滑 ${Math.abs(value)}` : "持平";
}

function formatPriceDelta(before: number | null, after: number | null): string {
  if (before === null || after === null) {
    return "-";
  }

  const delta = after - before;
  if (delta === 0) {
    return "持平";
  }

  return `${delta > 0 ? "上涨" : "下降"} ${formatMoney(Math.abs(delta))}`;
}

function isAtLowPrice(item: ProductPriceHistory): boolean {
  if (item.currentPrice === null) {
    return false;
  }

  return [item.t30LowPrice, item.t60LowPrice, item.t90LowPrice, item.monitoringLowPrice].some(
    (price) => price !== null && item.currentPrice !== null && item.currentPrice <= price
  );
}

function opportunityScore(snapshot: BestsellerRankSnapshot, hasBreakoutSignal: boolean): number {
  const rankScore = Math.max(0, 45 - Math.round(snapshot.rank / 3));
  const reviewScore = snapshot.reviewCount === null ? 10 : snapshot.reviewCount < 100 ? 28 : snapshot.reviewCount < 500 ? 14 : 0;
  const promoScore = promoText(snapshot) !== "-" ? 14 : 0;
  const signalScore = hasBreakoutSignal ? 24 : 0;
  return Math.min(100, rankScore + reviewScore + promoScore + signalScore);
}

function opportunityReason(snapshot: BestsellerRankSnapshot, hasBreakoutSignal: boolean): string {
  if (hasBreakoutSignal) {
    return "系统已识别为新品爆发信号";
  }
  if (snapshot.reviewCount !== null && snapshot.reviewCount < 100) {
    return `Review 仅 ${formatCount(snapshot.reviewCount)}，但已进入 #${snapshot.rank}`;
  }
  if (promoText(snapshot) !== "-") {
    return "排名靠前且存在 Deal/Coupon 活动";
  }
  return "排名靠前，建议继续观察";
}

function brandJudgement(brand: BrandMatrixSnapshot): string {
  if (brand.rankUpCount + brand.newEntryCount >= 3 && brand.couponCount + brand.dealCount >= 2) {
    return "多 ASIN 上升叠加活动，疑似品牌矩阵推进";
  }
  if (brand.rankDownCount >= 3) {
    return "多个链接下滑，建议复核活动是否结束";
  }
  if (brand.newEntryCount > 0) {
    return "有新链接进入榜单，适合观察是否扩大战线";
  }
  return "占位稳定，继续观察 Top50/Top20 份额";
}

function openExternal(url: string | null | undefined): void {
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <section id="daily-briefing" class="daily-briefing category-anchor">
    <div class="briefing-hero">
      <div>
        <span class="briefing-kicker">每日竞争情报</span>
        <h2>今日 BSR 战报</h2>
        <p>
          {{ selectedCategory?.name || "当前类目" }} · {{ categoryDataDate || "待加载" }}
          · 用战报、异动、品牌、机会和活动雷达先回答今天该看什么。
        </p>
      </div>
      <a class="briefing-board-link" href="#category-board">
        <Search :size="16" />
        <span>进入完整榜单</span>
      </a>
    </div>

    <div class="briefing-kpi-grid">
      <article v-for="item in battleKpis" :key="item.label" :class="['briefing-kpi', `briefing-kpi--${item.tone}`]">
        <span class="briefing-kpi-icon">
          <component :is="item.icon" :size="17" />
        </span>
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.note }}</small>
      </article>
    </div>

    <section class="briefing-ai-card">
      <div class="briefing-section-head">
        <div>
          <span class="briefing-kicker">AI 今日总结</span>
          <h3>基于排名、活动、价格与品牌矩阵的四段判断</h3>
        </div>
        <span>{{ highPriorityCount }} 条高优事件</span>
      </div>
      <ol>
        <li v-for="item in aiSummary" :key="item">{{ item }}</li>
      </ol>
    </section>

    <div class="briefing-main-grid">
      <section class="briefing-card-panel">
        <div class="briefing-section-head">
          <div>
            <span class="briefing-kicker">重点异动信息流</span>
            <h3>按重要性排序的 ASIN 卡片</h3>
          </div>
          <span>{{ insightCards.length }} 条</span>
        </div>

        <div class="insight-card-list">
          <article v-for="item in insightCards" :key="item.key" class="insight-card" @click="drawer = { mode: 'event', item }">
            <img v-if="item.snapshot?.imageUrl" :src="item.snapshot.imageUrl" :alt="item.title" loading="lazy" decoding="async" @error="imgFallback" />
            <div v-else class="briefing-image-fallback">品牌</div>
            <div class="insight-card-body">
              <div class="insight-card-topline">
                <span class="briefing-tag">{{ item.tag }}</span>
                <span :class="['rank-delta', item.rankDelta !== null && item.rankDelta >= 0 ? 'is-up' : 'is-down']">
                  {{ formatRankDelta(item.rankDelta) }}
                </span>
              </div>
              <strong>{{ compactText(item.title, 86) }}</strong>
              <small>{{ item.brand }} · {{ item.asin || "品牌事件" }}</small>
              <div class="insight-card-facts">
                <span>BSR {{ rankPath(item.rankBefore, item.rankAfter) }}</span>
                <span>{{ formatMoney(item.priceAfter) }}</span>
                <span>{{ item.promo }}</span>
                <span>Review {{ formatSignedCount(item.reviewDelta) }}</span>
              </div>
              <p>{{ compactText(localizeGeneratedText(item.event.possibleStrategy), 118) }}</p>
              <div class="briefing-actions">
                <button type="button" @click.stop="drawer = { mode: 'event', item }">查看详情</button>
                <button
                  v-if="item.snapshot?.productUrl"
                  class="icon-button"
                  title="打开 Amazon"
                  type="button"
                  @click.stop="openExternal(item.snapshot?.productUrl)"
                >
                  <ExternalLink :size="16" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="briefing-card-panel">
        <div class="briefing-section-head">
          <div>
            <span class="briefing-kicker">品牌矩阵变化</span>
            <h3>看品牌是否在集体动作</h3>
          </div>
          <span>{{ topBrandMatrix.length }} 个品牌</span>
        </div>

        <div class="brand-brief-list">
          <button v-for="brand in topBrandMatrix.slice(0, 7)" :key="brand.brand" type="button" @click="drawer = { mode: 'brand', item: brand }">
            <span>
              <strong>{{ brand.brand }}</strong>
              <small>{{ brandJudgement(brand) }}</small>
            </span>
            <span class="brand-brief-metrics">
              <b>Top100 {{ brand.productCountTop100 }}</b>
              <b>Top50 {{ brand.productCountTop50 }}</b>
              <b>{{ brand.averageRank ? `均排 #${Math.round(brand.averageRank)}` : "均排 -" }}</b>
            </span>
          </button>
        </div>
      </section>
    </div>

    <div class="briefing-radar-grid">
      <section class="briefing-card-panel">
        <div class="briefing-section-head">
          <div>
            <span class="briefing-kicker">新品黑马雷达</span>
            <h3>低 Review、高排名或爆发信号</h3>
          </div>
          <span>{{ opportunityCards.length }} 个机会</span>
        </div>
        <div class="opportunity-grid">
          <article v-for="item in opportunityCards" :key="item.snapshot.asin" class="opportunity-card" @click="drawer = { mode: 'opportunity', item }">
            <div>
              <span class="opportunity-score">{{ item.score }}</span>
              <small>机会分</small>
            </div>
            <strong>{{ item.snapshot.asin }}</strong>
            <span>{{ compactText(item.snapshot.title, 62) }}</span>
            <small>{{ item.reason }}</small>
          </article>
        </div>
      </section>

      <section class="briefing-card-panel">
        <div class="briefing-section-head">
          <div>
            <span class="briefing-kicker">价格与活动雷达</span>
            <h3>判断排名变化可能驱动</h3>
          </div>
          <span>{{ promoActiveCount }} 个活动商品</span>
        </div>
        <div class="price-radar-grid">
          <article v-for="item in priceRadarItems" :key="item.label">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>
        </div>
      </section>
    </div>

    <div v-if="drawer" class="briefing-drawer-backdrop" @click="drawer = null"></div>
    <aside v-if="drawer" class="briefing-drawer" @click.stop>
      <button class="icon-button briefing-drawer-close" title="关闭" type="button" @click="drawer = null">
        <X :size="18" />
      </button>

      <template v-if="drawer.mode === 'event'">
        <div class="briefing-drawer-product">
          <img v-if="drawer.item.snapshot?.imageUrl" :src="drawer.item.snapshot.imageUrl" :alt="drawer.item.title" loading="lazy" decoding="async" @error="imgFallback" />
          <div v-else class="briefing-image-fallback briefing-image-fallback--large">品牌</div>
          <div>
            <span class="briefing-tag">{{ drawer.item.tag }}</span>
            <h3>{{ drawer.item.asin || drawer.item.brand }}</h3>
            <p>{{ drawer.item.title }}</p>
          </div>
        </div>
        <div class="briefing-drawer-stats">
          <article><span>品牌</span><strong>{{ drawer.item.brand }}</strong></article>
          <article><span>BSR</span><strong>{{ rankPath(drawer.item.rankBefore, drawer.item.rankAfter) }}</strong></article>
          <article><span>排名变化</span><strong>{{ formatRankDelta(drawer.item.rankDelta) }}</strong></article>
          <article><span>价格变化</span><strong>{{ formatPriceDelta(drawer.item.priceBefore, drawer.item.priceAfter) }}</strong></article>
          <article><span>Deal/Coupon</span><strong>{{ drawer.item.promo }}</strong></article>
          <article><span>Review 增量</span><strong>{{ formatSignedCount(drawer.item.reviewDelta) }}</strong></article>
        </div>
        <div class="briefing-ai-detail">
          <h4>发生了什么</h4>
          <p>{{ localizeGeneratedText(drawer.item.event.eventSummary) }}</p>
          <h4>可能原因</h4>
          <p>{{ localizeGeneratedText(drawer.item.event.possibleStrategy) }}</p>
          <h4>影响判断</h4>
          <p>结合排名 {{ rankPath(drawer.item.rankBefore, drawer.item.rankAfter) }}、价格 {{ formatPriceDelta(drawer.item.priceBefore, drawer.item.priceAfter) }}、活动 {{ drawer.item.promo }} 和 Review {{ formatSignedCount(drawer.item.reviewDelta) }} 判断。</p>
          <h4>建议动作</h4>
          <p>{{ localizeGeneratedText(drawer.item.event.suggestedAction) }}</p>
        </div>
        <button v-if="drawer.item.snapshot?.productUrl" class="primary" type="button" @click="openExternal(drawer?.mode === 'event' ? drawer.item.snapshot?.productUrl : null)">
          打开 Amazon
        </button>
      </template>

      <template v-else-if="drawer.mode === 'brand'">
        <div class="briefing-drawer-title">
          <span class="briefing-tag">品牌矩阵</span>
          <h3>{{ drawer.item.brand }}</h3>
          <p>{{ brandJudgement(drawer.item) }}</p>
        </div>
        <div class="briefing-drawer-stats">
          <article><span>Top100</span><strong>{{ drawer.item.productCountTop100 }}</strong></article>
          <article><span>Top50</span><strong>{{ drawer.item.productCountTop50 }}</strong></article>
          <article><span>Top20</span><strong>{{ drawer.item.productCountTop20 }}</strong></article>
          <article><span>最佳排名</span><strong>{{ drawer.item.bestRank ? `#${drawer.item.bestRank}` : "-" }}</strong></article>
          <article><span>上升 ASIN</span><strong>{{ drawer.item.rankUpCount }}</strong></article>
          <article><span>下滑 ASIN</span><strong>{{ drawer.item.rankDownCount }}</strong></article>
          <article><span>新进 ASIN</span><strong>{{ drawer.item.newEntryCount }}</strong></article>
          <article><span>活动 ASIN</span><strong>{{ drawer.item.couponCount + drawer.item.dealCount }}</strong></article>
        </div>
        <div class="briefing-ai-detail">
          <h4>Top ASIN</h4>
          <p>{{ drawer.item.topAsins.slice(0, 8).join(" · ") || "-" }}</p>
          <h4>建议动作</h4>
          <p>优先查看该品牌 Top50 链接的价格、Coupon/Deal 与 Review 变化，判断是矩阵活动还是自然占位提升。</p>
        </div>
      </template>

      <template v-else>
        <div class="briefing-drawer-product">
          <img :src="drawer.item.snapshot.imageUrl" :alt="drawer.item.snapshot.title" loading="lazy" decoding="async" @error="imgFallback" />
          <div>
            <span class="briefing-tag">新品黑马</span>
            <h3>{{ drawer.item.snapshot.asin }}</h3>
            <p>{{ drawer.item.snapshot.title }}</p>
          </div>
        </div>
        <div class="briefing-drawer-stats">
          <article><span>机会分</span><strong>{{ drawer.item.score }}</strong></article>
          <article><span>当前 BSR</span><strong>#{{ drawer.item.snapshot.rank }}</strong></article>
          <article><span>Review</span><strong>{{ formatCount(drawer.item.snapshot.reviewCount) }}</strong></article>
          <article><span>价格</span><strong>{{ formatMoney(drawer.item.snapshot.currentPrice) }}</strong></article>
          <article><span>Deal/Coupon</span><strong>{{ promoText(drawer.item.snapshot) }}</strong></article>
          <article><span>品牌</span><strong>{{ drawer.item.snapshot.brand || "未知品牌" }}</strong></article>
        </div>
        <div class="briefing-ai-detail">
          <h4>机会判断</h4>
          <p>{{ drawer.item.reason }}。建议连续观察 3-7 天，看活动结束后是否仍能维持排名。</p>
        </div>
        <button class="primary" type="button" @click="openExternal(drawer?.mode === 'opportunity' ? drawer.item.snapshot.productUrl : null)">
          打开 Amazon
        </button>
      </template>
    </aside>
  </section>
</template>
