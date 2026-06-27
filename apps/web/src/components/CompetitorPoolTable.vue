<script setup lang="ts">
import { CalendarDays, ExternalLink, Star, StarOff } from "@lucide/vue";
import type { CompetitorPoolItem } from "@amazon-monitor/shared";
import {
  categoryLabel,
  competitorSourceLabel,
  competitorTierLabel,
  formatCount,
  formatMoney,
  iceTypeLabel,
  imgFallback,
  promoText,
  statusText
} from "../utils/formatters";
import { validCouponText, validDealBadge } from "../utils/formatters-promotions";

interface Props {
  visibleCompetitors: CompetitorPoolItem[];
  selectedCompetitor: CompetitorPoolItem | null;
}

interface Emits {
  (e: "open-competitor-drawer", item: CompetitorPoolItem): void;
  (e: "toggle-key-competitor", item: CompetitorPoolItem): void;
  (e: "open-product-activity-calendar", item: CompetitorPoolItem): void;
  (e: "open-amazon", item: CompetitorPoolItem): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

function statusTags(item: CompetitorPoolItem): string[] {
  const tags: string[] = [];
  if (validDealBadge(item.dealBadge)) {
    tags.push("价格活跃");
  } else if (validCouponText(item.couponText)) {
    tags.push("促销中");
  }
  if (item.status === "ignored") {
    tags.push("已忽略");
  } else if (item.isKeyCompetitor) {
    tags.push("高优跟进");
  } else {
    tags.push("监控中");
  }
  return tags;
}

function tagClass(tag: string): string {
  switch (tag) {
    case "价格活跃":
      return "is-price";
    case "促销中":
      return "is-promo";
    case "高优先跟进":
      return "is-key";
    case "已忽略":
      return "is-ignored";
    default:
      return "is-monitor";
  }
}
</script>

<template>
  <div class="table-wrap compact-scroll competitor-pool-wrap">
    <table>
      <thead>
        <tr>
          <th>商品信息</th>
          <th>分层</th>
          <th>类目排名</th>
          <th class="price-col">最新价格</th>
          <th class="rating-col">评分&评论</th>
          <th class="status-col">标签/状态</th>
          <th class="link-col">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in visibleCompetitors" :key="item.asin" :class="{ selected: selectedCompetitor?.asin === item.asin }" @click="emit('open-competitor-drawer', item)">
          <td class="product-cell">
            <div class="product-cell-content">
              <img :src="item.imageUrl" :alt="item.title" loading="lazy" decoding="async" @error="imgFallback" />
              <div>
                <strong>{{ item.asin }}</strong>
                <span>{{ item.title }}</span>
                <small v-if="promoText(item) !== '-'" class="promo-inline competitor-promo" :title="promoText(item)">促销：{{ promoText(item) }}</small>
                <small>{{ item.brand || "未知品牌" }} | {{ iceTypeLabel(item.iceType) }} | {{ competitorSourceLabel(item.sourceType) }}</small>
              </div>
            </div>
          </td>
          <td><span :class="['tier-pill', item.competitorTier]">{{ competitorTierLabel(item.competitorTier) }}</span></td>
          <td>
            {{ item.latestCategoryRank ? `#${item.latestCategoryRank}` : "-" }}
            <small>{{ categoryLabel(item.latestCategoryName) }}</small>
          </td>
          <td class="price-col">{{ formatMoney(item.latestPrice) }}</td>
          <td class="rating-col">
            <span class="rating-value">{{ item.latestReviewCount ?? "—" }}</span>
            <small>评论</small>
          </td>
          <td class="status-col">
            <div class="status-tags">
              <span v-for="tag in statusTags(item)" :key="tag" :class="['status-tag', tagClass(tag)]">
                {{ tag }}
              </span>
            </div>
            <small v-if="item.status === 'ignored'" class="status-text">{{ statusText(item.status) }}</small>
          </td>
          <td class="link-col">
            <button class="icon-button" title="切换重点竞品" type="button" @click.stop="emit('toggle-key-competitor', item)">
              <Star v-if="item.isKeyCompetitor" :size="17" />
              <StarOff v-else :size="17" />
            </button>
            <button class="icon-button" title="打开活动日历" type="button" @click.stop="emit('open-product-activity-calendar', item)">
              <CalendarDays :size="17" />
            </button>
            <button class="icon-button" title="打开 Amazon" type="button" @click.stop="emit('open-amazon', item)">
              <ExternalLink :size="17" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.rating-value {
  color: var(--text-primary, #0f172a);
  font-size: 13px;
  font-weight: 600;
}

.rating-col small {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 10.5px;
  margin-top: 2px;
}

.status-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.status-tag {
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 7px;
}

.status-tag.is-price {
  background: #fef3c7;
  color: #92400e;
}

.status-tag.is-promo {
  background: #ffedd5;
  color: #b45309;
}

.status-tag.is-key {
  background: #ede9fe;
  color: #6d28d9;
}

.status-tag.is-monitor {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-tag.is-ignored {
  background: #f1f5f9;
  color: #64748b;
}

.status-text {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11px;
  margin-top: 4px;
}
</style>