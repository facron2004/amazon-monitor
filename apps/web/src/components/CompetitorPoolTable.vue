<script setup lang="ts">
import { CalendarDays, ExternalLink, Star, StarOff } from "@lucide/vue";
import { ElButton, ElOption, ElSelect, ElTag, ElTooltip } from "element-plus";
import type { AsinWatchLevel, AsinWatchState, CompetitorPoolItem } from "@amazon-monitor/shared";
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
import {
  competitorWatchLabel,
  competitorWatchLevel,
  competitorWatchLevelOptions,
  competitorWatchTagType,
  findCompetitorWatchState,
  normalizeCompetitorWatchLevel
} from "../utils/competitorWatchState";

interface Props {
  visibleCompetitors: CompetitorPoolItem[];
  selectedCompetitor: CompetitorPoolItem | null;
  watchStates: AsinWatchState[];
  watchStateUpdatingAsin: string | null;
}

interface Emits {
  (e: "open-competitor-drawer", item: CompetitorPoolItem): void;
  (e: "toggle-key-competitor", item: CompetitorPoolItem): void;
  (e: "set-watch-state", item: CompetitorPoolItem, level: AsinWatchLevel): void;
  (e: "open-product-activity-calendar", item: CompetitorPoolItem): void;
  (e: "open-amazon", item: CompetitorPoolItem): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function watchStateFor(item: CompetitorPoolItem): AsinWatchState | null {
  return findCompetitorWatchState(props.watchStates, item.asin);
}

function watchLevelFor(item: CompetitorPoolItem): AsinWatchLevel {
  return competitorWatchLevel(watchStateFor(item));
}

function updateWatchLevel(item: CompetitorPoolItem, value: unknown): void {
  emit("set-watch-state", item, normalizeCompetitorWatchLevel(value));
}

function promoLabel(item: CompetitorPoolItem): string | null {
  if (validDealBadge(item.dealBadge)) return "价格活动";
  if (validCouponText(item.couponText)) return "促销中";
  return null;
}

function monitorLabel(item: CompetitorPoolItem): string {
  if (item.status === "ignored") return "已忽略";
  if (item.isKeyCompetitor) return "高优先跟进";
  return "监控中";
}

function monitorTagType(item: CompetitorPoolItem): "success" | "warning" | "info" {
  if (item.status === "ignored") return "info";
  if (item.isKeyCompetitor) return "warning";
  return "success";
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
          <th class="rating-col">评分/评论</th>
          <th class="status-col">优先级/状态</th>
          <th class="link-col">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in visibleCompetitors"
          :key="item.asin"
          :class="{ selected: selectedCompetitor?.asin === item.asin }"
          @click="emit('open-competitor-drawer', item)"
        >
          <td class="product-cell">
            <div class="product-cell-content">
              <img :src="item.imageUrl" :alt="item.title" loading="lazy" decoding="async" @error="imgFallback" />
              <div>
                <strong>{{ item.asin }}</strong>
                <span>{{ item.title }}</span>
                <small v-if="promoText(item) !== '-'" class="promo-inline competitor-promo" :title="promoText(item)">
                  促销: {{ promoText(item) }}
                </small>
                <small>{{ item.brand || "未知品牌" }} | {{ iceTypeLabel(item.iceType) }} | {{ competitorSourceLabel(item.sourceType) }}</small>
              </div>
            </div>
          </td>
          <td>
            <ElTag effect="light" round>{{ competitorTierLabel(item.competitorTier) }}</ElTag>
          </td>
          <td>
            {{ item.latestCategoryRank ? `#${item.latestCategoryRank}` : "-" }}
            <small>{{ categoryLabel(item.latestCategoryName) }}</small>
          </td>
          <td class="price-col">{{ formatMoney(item.latestPrice) }}</td>
          <td class="rating-col">
            <span class="rating-value">{{ formatCount(item.latestReviewCount) }}</span>
            <small>评论</small>
          </td>
          <td class="status-col">
            <div class="watch-priority" @click.stop>
              <ElSelect
                class="watch-select"
                size="small"
                :model-value="watchLevelFor(item)"
                :disabled="watchStateUpdatingAsin === item.asin"
                :loading="watchStateUpdatingAsin === item.asin"
                @update:model-value="updateWatchLevel(item, $event)"
              >
                <ElOption
                  v-for="option in competitorWatchLevelOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
              <ElTag :type="competitorWatchTagType(watchLevelFor(item))" effect="light" round>
                {{ competitorWatchLabel(watchStateFor(item)) }}
              </ElTag>
            </div>
            <div class="status-tags">
              <ElTag v-if="promoLabel(item)" type="warning" effect="light" round>{{ promoLabel(item) }}</ElTag>
              <ElTag :type="monitorTagType(item)" effect="plain" round>{{ monitorLabel(item) }}</ElTag>
            </div>
            <small v-if="item.status === 'ignored'" class="status-text">{{ statusText(item.status) }}</small>
          </td>
          <td class="link-col">
            <ElTooltip content="切换重点竞品" placement="top">
              <ElButton circle text class="table-icon-button" @click.stop="emit('toggle-key-competitor', item)">
                <Star v-if="item.isKeyCompetitor" :size="17" />
                <StarOff v-else :size="17" />
              </ElButton>
            </ElTooltip>
            <ElTooltip content="打开活动日历" placement="top">
              <ElButton circle text class="table-icon-button" @click.stop="emit('open-product-activity-calendar', item)">
                <CalendarDays :size="17" />
              </ElButton>
            </ElTooltip>
            <ElTooltip content="打开 Amazon" placement="top">
              <ElButton circle text class="table-icon-button" @click.stop="emit('open-amazon', item)">
                <ExternalLink :size="17" />
              </ElButton>
            </ElTooltip>
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

.watch-priority {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.watch-select {
  width: 118px;
}

.status-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.status-text {
  color: var(--text-muted, #64748b);
  display: block;
  font-size: 11px;
  margin-top: 4px;
}

.table-icon-button {
  color: #475569;
}

.table-icon-button:hover {
  color: var(--color-primary, #2563eb);
}
</style>
