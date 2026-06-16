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
  promoText
} from "../utils/formatters";

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
</script>

<template>
  <div class="table-wrap compact-scroll competitor-pool-wrap">
    <table>
      <thead>
        <tr>
          <th>商品</th>
          <th>分层</th>
          <th>类目排名</th>
          <th>最新价格</th>
          <th>评价数</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in visibleCompetitors" :key="item.asin" :class="{ selected: selectedCompetitor?.asin === item.asin }" @click="emit('open-competitor-drawer', item)">
          <td class="product-cell">
            <img :src="item.imageUrl" :alt="item.title" loading="lazy" decoding="async" @error="imgFallback" />
            <div>
              <strong>{{ item.asin }}</strong>
              <span>{{ item.title }}</span>
              <small v-if="promoText(item) !== '-'" class="promo-inline competitor-promo" :title="promoText(item)">促销：{{ promoText(item) }}</small>
              <small>{{ item.brand || "未知品牌" }} | {{ iceTypeLabel(item.iceType) }} | {{ competitorSourceLabel(item.sourceType) }}</small>
            </div>
          </td>
          <td><span :class="['tier-pill', item.competitorTier]">{{ competitorTierLabel(item.competitorTier) }}</span></td>
          <td>{{ item.latestCategoryRank ? `#${item.latestCategoryRank}` : "-" }}<small>{{ categoryLabel(item.latestCategoryName) }}</small></td>
          <td>{{ formatMoney(item.latestPrice) }}</td>
          <td>{{ formatCount(item.latestReviewCount) }}</td>
          <td class="row-actions">
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
