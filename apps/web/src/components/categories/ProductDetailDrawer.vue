<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { ExternalLink, X } from "@lucide/vue";
import { useCategoryStore } from "../../stores/category";
import { formatCount, formatMoney, iceTypeLabel, imgFallback } from "../../utils/formatters";
import PriceTimelineCard from "../action-center/PriceTimelineCard.vue";
import type { BestsellerRankSnapshot } from "@amazon-monitor/shared";

const props = defineProps<{
  asin: string | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const store = useCategoryStore();
const { categoryDetail, priceHistory, activityEvents } = storeToRefs(store);

const snapshot = computed<BestsellerRankSnapshot | null>(() => {
  if (!props.asin || !categoryDetail.value?.snapshots) return null;
  return categoryDetail.value.snapshots.find((s) => s.asin === props.asin) ?? null;
});

const asinPriceHistory = computed(() =>
  props.asin ? priceHistory.value.filter((p) => p.asin === props.asin) : []
);

const asinActivityEvents = computed(() =>
  props.asin ? activityEvents.value.filter((e) => e.asin === props.asin) : []
);

const productUrl = computed(() => {
  return snapshot.value?.productUrl ?? null;
});

function openProduct(): void {
  if (productUrl.value) {
    window.open(productUrl.value, "_blank", "noopener,noreferrer");
  }
}

function couponLabel(item: BestsellerRankSnapshot): string {
  const parts: string[] = [];
  if (item.couponText) parts.push(item.couponText);
  if (item.couponValue && item.couponValue > 0) parts.push(`-$ ${item.couponValue.toFixed(2)}`);
  if (item.couponRate && item.couponRate > 0) parts.push(`-${(item.couponRate * 100).toFixed(0)}%`);
  return parts.length ? parts.join(" / ") : "-";
}
</script>

<template>
  <div v-if="asin && snapshot" class="drawer-backdrop" @click="emit('close')"></div>
  <aside v-if="asin && snapshot" class="product-drawer" @click.stop>
    <button class="icon-button drawer-close" type="button" aria-label="关闭" @click="emit('close')">
      <X :size="18" />
    </button>

    <!-- Header: image + ASIN/title/brand -->
    <div class="drawer-product">
      <img
        v-if="snapshot.imageUrl"
        class="drawer-image"
        :src="snapshot.imageUrl"
        :alt="snapshot.title"
        loading="lazy"
        decoding="async"
        @error="imgFallback"
      />
      <div v-else class="drawer-image-fallback drawer-image-fallback--large">无图片</div>
      <div class="drawer-product-info">
        <strong>{{ snapshot.asin }}</strong>
        <h2>{{ snapshot.title }}</h2>
        <span class="drawer-tag">{{ snapshot.brand || "未知品牌" }}</span>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="drawer-stats">
      <article>
        <span>排名</span>
        <strong>#{{ snapshot.rank }}</strong>
      </article>
      <article>
        <span>价格</span>
        <strong>{{ formatMoney(snapshot.currentPrice) }}</strong>
      </article>
      <article>
        <span>评分</span>
        <strong>{{ snapshot.rating || "-" }}</strong>
      </article>
      <article>
        <span>Reviews</span>
        <strong>{{ formatCount(snapshot.reviewCount) }}</strong>
      </article>
      <article>
        <span>BSR 排名</span>
        <strong>{{ snapshot.bsrRank ? `#${snapshot.bsrRank}` : "-" }}</strong>
      </article>
      <article>
        <span>BSR 类目</span>
        <strong>{{ snapshot.bsrCategory || "-" }}</strong>
      </article>
      <article>
        <span>ICE Type</span>
        <strong>{{ iceTypeLabel(snapshot.iceType) }}</strong>
      </article>
      <article>
        <span>Prime</span>
        <strong>{{ snapshot.isPrime ? "是" : "否" }}</strong>
      </article>
    </div>

    <!-- Deal badge -->
    <div v-if="snapshot.dealBadge" class="drawer-section">
      <h3>Deal</h3>
      <p>{{ snapshot.dealBadge }}</p>
    </div>

    <!-- Coupon info -->
    <div v-if="snapshot.couponText || snapshot.couponValue || snapshot.couponRate" class="drawer-section">
      <h3>Coupon</h3>
      <p>{{ couponLabel(snapshot) }}</p>
    </div>

    <!-- Activity events -->
    <div v-if="asinActivityEvents.length" class="drawer-section">
      <h3>近期活动 ({{ asinActivityEvents.length }})</h3>
      <ul>
        <li v-for="event in asinActivityEvents" :key="event.id">
          <small>{{ event.eventDate }}</small>
          <strong>{{ event.eventType }}</strong>
          <span v-if="event.eventSummary"> — {{ event.eventSummary }}</span>
        </li>
      </ul>
    </div>

    <!-- Price timeline -->
    <PriceTimelineCard
      v-if="asinPriceHistory.length"
      class="drawer-section"
      :rows="asinPriceHistory"
      :loading="false"
    />

    <!-- Open Amazon button -->
    <button v-if="productUrl" class="drawer-link" type="button" @click="openProduct">
      <ExternalLink :size="16" />
      <span>打开 Amazon</span>
    </button>
  </aside>
</template>

<style scoped>
.drawer-backdrop {
  background: rgba(15, 23, 42, 0.32);
  inset: 0;
  position: fixed;
  z-index: 40;
}

.product-drawer {
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
  display: grid;
  gap: 14px;
  grid-template-columns: 96px minmax(0, 1fr);
  padding-right: 32px;
}

.drawer-image {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  height: 96px;
  object-fit: contain;
  width: 96px;
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

.drawer-product-info {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.drawer-product-info strong {
  color: #64748b;
  font-size: 12px;
}

.drawer-product-info h2 {
  color: #0f172a;
  font-size: 16px;
  line-height: 1.3;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-tag {
  background: #e0f2fe;
  border-radius: 999px;
  color: #075985;
  display: inline-block;
  font-size: 11px;
  padding: 4px 8px;
  width: fit-content;
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
  font-size: 14px;
  font-weight: 700;
  margin-top: 4px;
}

.drawer-section {
  border-top: 1px solid #e2e8f0;
  margin-top: 18px;
  padding-top: 16px;
}

.drawer-section h3 {
  color: #0f172a;
  font-size: 15px;
  margin: 0 0 10px;
}

.drawer-section p {
  color: #475569;
  font-size: 13px;
  margin: 0;
}

.drawer-section ul {
  color: #475569;
  font-size: 13px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.drawer-section li {
  align-items: baseline;
  display: flex;
  gap: 8px;
  line-height: 1.6;
}

.drawer-section li small {
  color: #64748b;
  flex-shrink: 0;
  font-size: 11px;
}

.drawer-link {
  align-items: center;
  background: #0f172a;
  border: none;
  border-radius: 8px;
  color: #ffffff;
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  gap: 8px;
  justify-content: center;
  margin-top: 18px;
  padding: 10px 14px;
  width: 100%;
}

.drawer-link:hover {
  background: #1e293b;
}

.drawer-link:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
</style>
