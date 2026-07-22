<script setup lang="ts">
import { X } from "@lucide/vue";
import {
  formatCount,
  formatMoney,
  formatSignedCount,
  imgFallback,
  localizeGeneratedText,
  promoText,
} from "../utils/formatters";
import { rankPath } from "../utils/category-intelligence";
import type { DrawerState } from "../composables/useCategoryDailyBriefing";

const drawer = defineModel<DrawerState | null>("drawer", { default: null });

defineProps<{
  formatRankDelta: (value: number | null) => string;
  formatPriceDelta: (before: number | null, after: number | null) => string;
  brandJudgement: (
    brand: import("@amazon-monitor/shared").BrandMatrixSnapshot,
  ) => string;
  openExternal: (url: string | null | undefined) => void;
}>();

function closeDrawer(): void {
  drawer.value = null;
}
</script>

<template>
  <!--
    Single root <div> so the drawer prop (consumed via v-model) doesn't trip Vue's
    "non-props attributes cannot be inherited" warning on a fragment root.
    Children render only when `drawer` is non-null; the wrapper itself stays
    mounted so v-model and the backdrop click-outside area keep working.
  -->
  <div class="drawer-host" :data-open="drawer ? 'true' : 'false'">
    <div v-if="drawer" class="drawer-backdrop" @click="closeDrawer"></div>
    <aside v-if="drawer" class="drawer" @click.stop>
      <button
        class="icon-button drawer-close"
        title="关闭"
        type="button"
        @click="closeDrawer"
      >
        <X :size="18" />
      </button>

      <template v-if="drawer.mode === 'event'">
        <div class="drawer-product">
          <img
            v-if="drawer.item.snapshot?.imageUrl"
            :src="drawer.item.snapshot.imageUrl"
            :alt="drawer.item.title"
            loading="lazy"
            decoding="async"
            @error="imgFallback"
          />
          <div
            v-else
            class="drawer-image-fallback drawer-image-fallback--large"
          >
            品牌
          </div>
          <div>
            <span class="drawer-tag">{{ drawer.item.tag }}</span>
            <h3>{{ drawer.item.asin || drawer.item.brand }}</h3>
            <p>{{ drawer.item.title }}</p>
          </div>
        </div>
        <div class="drawer-stats">
          <article>
            <span>品牌</span><strong>{{ drawer.item.brand }}</strong>
          </article>
          <article>
            <span>BSR</span
            ><strong>{{
              rankPath(drawer.item.rankBefore, drawer.item.rankAfter)
            }}</strong>
          </article>
          <article>
            <span>排名变化</span
            ><strong>{{ formatRankDelta(drawer.item.rankDelta) }}</strong>
          </article>
          <article>
            <span>价格变化</span
            ><strong>{{
              formatPriceDelta(drawer.item.priceBefore, drawer.item.priceAfter)
            }}</strong>
          </article>
          <article>
            <span>Deal/Coupon</span><strong>{{ drawer.item.promo }}</strong>
          </article>
          <article>
            <span>Review 增量</span
            ><strong>{{ formatSignedCount(drawer.item.reviewDelta) }}</strong>
          </article>
        </div>
        <div class="drawer-ai">
          <h4>发生了什么</h4>
          <p>{{ localizeGeneratedText(drawer.item.event.eventSummary) }}</p>
          <h4>可能原因</h4>
          <p>{{ localizeGeneratedText(drawer.item.event.possibleStrategy) }}</p>
          <h4>影响判断</h4>
          <p>
            结合排名
            {{ rankPath(drawer.item.rankBefore, drawer.item.rankAfter) }}、价格
            {{
              formatPriceDelta(drawer.item.priceBefore, drawer.item.priceAfter)
            }}、活动 {{ drawer.item.promo }} 和 Review
            {{ formatSignedCount(drawer.item.reviewDelta) }} 判断。
          </p>
          <h4>建议动作</h4>
          <p>{{ localizeGeneratedText(drawer.item.event.suggestedAction) }}</p>
        </div>
        <button
          v-if="drawer.item.snapshot?.productUrl"
          class="primary drawer-action"
          type="button"
          @click="openExternal(drawer.item.snapshot.productUrl)"
        >
          打开 Amazon
        </button>
      </template>

      <template v-else-if="drawer.mode === 'brand'">
        <div class="drawer-title">
          <span class="drawer-tag">品牌矩阵</span>
          <h3>{{ drawer.item.brand }}</h3>
          <p>{{ brandJudgement(drawer.item) }}</p>
        </div>
        <div class="drawer-stats">
          <article>
            <span>Top100</span
            ><strong>{{ drawer.item.productCountTop100 }}</strong>
          </article>
          <article>
            <span>Top50</span
            ><strong>{{ drawer.item.productCountTop50 }}</strong>
          </article>
          <article>
            <span>Top20</span
            ><strong>{{ drawer.item.productCountTop20 }}</strong>
          </article>
          <article>
            <span>最佳排名</span
            ><strong>{{
              drawer.item.bestRank ? `#${drawer.item.bestRank}` : "-"
            }}</strong>
          </article>
          <article>
            <span>上升 ASIN</span><strong>{{ drawer.item.rankUpCount }}</strong>
          </article>
          <article>
            <span>下滑 ASIN</span
            ><strong>{{ drawer.item.rankDownCount }}</strong>
          </article>
          <article>
            <span>新进 ASIN</span
            ><strong>{{ drawer.item.newEntryCount }}</strong>
          </article>
          <article>
            <span>活动 ASIN</span
            ><strong>{{
              drawer.item.couponCount + drawer.item.dealCount
            }}</strong>
          </article>
        </div>
        <div class="drawer-ai">
          <h4>Top ASIN</h4>
          <p>{{ drawer.item.topAsins.slice(0, 8).join(" · ") || "-" }}</p>
          <h4>建议动作</h4>
          <p>
            优先查看该品牌 Top50 链接的价格、Coupon/Deal 与 Review
            变化，判断是矩阵活动还是自然占位提升。
          </p>
        </div>
      </template>

      <template v-else>
        <div class="drawer-product">
          <img
            :src="drawer.item.snapshot.imageUrl"
            :alt="drawer.item.snapshot.title"
            loading="lazy"
            decoding="async"
            @error="imgFallback"
          />
          <div>
            <span class="drawer-tag">新品黑马</span>
            <h3>{{ drawer.item.snapshot.asin }}</h3>
            <p>{{ drawer.item.snapshot.title }}</p>
          </div>
        </div>
        <div class="drawer-stats">
          <article>
            <span>机会分</span><strong>{{ drawer.item.score }}</strong>
          </article>
          <article>
            <span>当前 BSR</span
            ><strong>#{{ drawer.item.snapshot.rank }}</strong>
          </article>
          <article>
            <span>Review</span
            ><strong>{{
              formatCount(drawer.item.snapshot.reviewCount)
            }}</strong>
          </article>
          <article>
            <span>价格</span
            ><strong>{{
              formatMoney(drawer.item.snapshot.currentPrice)
            }}</strong>
          </article>
          <article>
            <span>Deal/Coupon</span
            ><strong>{{ promoText(drawer.item.snapshot) }}</strong>
          </article>
          <article>
            <span>品牌</span
            ><strong>{{ drawer.item.snapshot.brand || "未知品牌" }}</strong>
          </article>
        </div>
        <div class="drawer-ai">
          <h4>机会判断</h4>
          <p>
            {{ drawer.item.reason }}。建议连续观察 3-7
            天，看活动结束后是否仍能维持排名。
          </p>
        </div>
        <button
          class="primary drawer-action"
          type="button"
          @click="openExternal(drawer.item.snapshot.productUrl)"
        >
          打开 Amazon
        </button>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.drawer-backdrop {
  background: rgba(15, 23, 42, 0.32);
  inset: 0;
  position: fixed;
  z-index: 40;
}

.drawer {
  background: #ffffff;
  border-left: 1px solid #d9e2ec;
  bottom: 0;
  box-shadow: -12px 0 32px rgba(15, 23, 42, 0.14);
  overflow-y: auto;
  padding: 22px;
  position: fixed;
  right: 0;
  top: 0;
  width: min(520px, 100vw);
  z-index: 41;
}

.drawer-close {
  position: absolute;
  right: 14px;
  top: 14px;
}

.drawer-product {
  align-items: center;
  display: grid;
  gap: 14px;
  grid-template-columns: 96px minmax(0, 1fr);
  padding-right: 32px;
}

.drawer-product img {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  height: 96px;
  object-fit: contain;
  width: 96px;
}

.drawer-product h3 {
  color: #0f172a;
  font-size: 18px;
  margin: 4px 0;
}

.drawer-product p {
  color: #475569;
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

.drawer-title {
  padding-right: 32px;
}

.drawer-title h3 {
  color: #0f172a;
  font-size: 22px;
  margin: 6px 0;
}

.drawer-title p {
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

.drawer-stats {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 18px;
}

.drawer-stats article {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
}

.drawer-stats span {
  color: #64748b;
  display: block;
  font-size: 12px;
}

.drawer-stats strong {
  color: #0f172a;
  display: block;
  font-size: 14px;
  margin-top: 4px;
}

.drawer-ai {
  border-top: 1px solid #e2e8f0;
  margin-top: 18px;
  padding-top: 16px;
}

.drawer-ai h4 {
  color: #0f172a;
  font-size: 13px;
  margin: 12px 0 4px;
}

.drawer-ai h4:first-child {
  margin-top: 0;
}

.drawer-ai p {
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}

.drawer-image-fallback {
  align-items: center;
  background: #eef2f7;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  color: #64748b;
  display: flex;
  font-size: 12px;
  justify-content: center;
}

.drawer-image-fallback--large {
  height: 96px;
  width: 96px;
}

.drawer-tag {
  background: #e0f2fe;
  border-radius: 999px;
  color: #075985;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 8px;
}

.icon-button {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  padding: 6px;
}

.icon-button:hover {
  background: #f1f5f9;
}

.primary.drawer-action {
  background: #0f172a;
  border-radius: 8px;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  margin-top: 18px;
  padding: 10px 14px;
  width: 100%;
}
</style>
