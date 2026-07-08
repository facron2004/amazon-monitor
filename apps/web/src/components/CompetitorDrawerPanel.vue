<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, ExternalLink, Star, StarOff, X } from "@lucide/vue";
import { ElOption, ElSelect, ElTag } from "element-plus";
import type { AsinWatchLevel, AsinWatchState, CompetitorPoolItem } from "@amazon-monitor/shared";
import {
  competitorSourceLabel,
  competitorTierLabel,
  formatCount,
  formatMoney,
  iceTypeLabel,
  imgFallback,
  validCouponText,
  validDealBadge
} from "../utils/formatters";
import {
  competitorWatchLabel,
  competitorWatchLevel,
  competitorWatchLevelOptions,
  competitorWatchTagType,
  findCompetitorWatchState,
  normalizeCompetitorWatchLevel
} from "../utils/competitorWatchState";

interface Props {
  selectedCompetitor: CompetitorPoolItem | null;
  watchStates: AsinWatchState[];
  watchStateUpdatingAsin: string | null;
}

interface Emits {
  (e: "close-competitor-drawer"): void;
  (e: "toggle-key-competitor", item: CompetitorPoolItem): void;
  (e: "set-watch-state", item: CompetitorPoolItem, level: AsinWatchLevel): void;
  (e: "open-product-activity-calendar", item: CompetitorPoolItem): void;
  (e: "open-amazon", item: CompetitorPoolItem): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedWatchState = computed(() => {
  const competitor = props.selectedCompetitor;
  return competitor ? findCompetitorWatchState(props.watchStates, competitor.asin) : null;
});
const selectedWatchLevel = computed(() => competitorWatchLevel(selectedWatchState.value));

function updateWatchLevel(value: unknown): void {
  if (!props.selectedCompetitor) return;
  emit("set-watch-state", props.selectedCompetitor, normalizeCompetitorWatchLevel(value));
}
</script>

<template>
  <div v-if="selectedCompetitor" class="drawer-backdrop" @click="emit('close-competitor-drawer')"></div>
  <aside v-if="selectedCompetitor" class="competitor-drawer" @click.stop>
    <div class="drawer-head">
      <div class="drawer-product">
        <img :src="selectedCompetitor.imageUrl" :alt="selectedCompetitor.title" loading="lazy" decoding="async" @error="imgFallback" />
        <div>
          <strong>{{ selectedCompetitor.asin }}</strong>
          <span>{{ selectedCompetitor.title }}</span>
          <small
            v-if="validDealBadge(selectedCompetitor.dealBadge)"
            class="promo-inline"
            :title="validDealBadge(selectedCompetitor.dealBadge) ?? ''"
          >
            促销: {{ validDealBadge(selectedCompetitor.dealBadge) }}
          </small>
          <small
            v-else-if="validCouponText(selectedCompetitor.couponText)"
            class="promo-inline"
            :title="validCouponText(selectedCompetitor.couponText) ?? ''"
          >
            促销: {{ validCouponText(selectedCompetitor.couponText) }}
          </small>
        </div>
      </div>
      <button class="icon-button drawer-close" title="关闭" type="button" @click="emit('close-competitor-drawer')">
        <X :size="18" />
      </button>
    </div>

    <div class="drawer-stats">
      <article>
        <span>品牌</span>
        <strong>{{ selectedCompetitor.brand || "未知品牌" }}</strong>
      </article>
      <article>
        <span>冰型</span>
        <strong>{{ iceTypeLabel(selectedCompetitor.iceType) }}</strong>
      </article>
      <article>
        <span>来源</span>
        <strong>{{ competitorSourceLabel(selectedCompetitor.sourceType) }}</strong>
      </article>
      <article>
        <span>分层</span>
        <strong>{{ competitorTierLabel(selectedCompetitor.competitorTier) }}</strong>
      </article>
      <article>
        <span>观察优先级</span>
        <strong>
          <ElTag :type="competitorWatchTagType(selectedWatchLevel)" effect="light" round>
            {{ competitorWatchLabel(selectedWatchState) }}
          </ElTag>
        </strong>
      </article>
      <article>
        <span>类目排名</span>
        <strong>{{ selectedCompetitor.latestCategoryRank ? `#${selectedCompetitor.latestCategoryRank}` : "-" }}</strong>
        <small>{{ selectedCompetitor.latestCategoryName || "-" }}</small>
      </article>
      <article>
        <span>关键词排名</span>
        <strong>{{ selectedCompetitor.latestRank ? `#${selectedCompetitor.latestRank}` : "-" }}</strong>
        <small>{{ selectedCompetitor.appearKeywordCount }} 个关键词</small>
      </article>
      <article>
        <span>最新价 / 最低价</span>
        <strong>{{ formatMoney(selectedCompetitor.latestPrice) }}</strong>
        <small>{{ formatMoney(selectedCompetitor.lowestPrice) }}</small>
      </article>
      <article>
        <span>评论数</span>
        <strong>{{ formatCount(selectedCompetitor.latestReviewCount) }}</strong>
      </article>
      <article>
        <span>BSR</span>
        <strong>{{ selectedCompetitor.latestBsrRank ? `#${selectedCompetitor.latestBsrRank}` : "-" }}</strong>
        <small>{{ selectedCompetitor.latestBsrCategory || "-" }}</small>
      </article>
    </div>

    <div class="drawer-section">
      <h3>运营观察层级</h3>
      <ElSelect
        class="drawer-watch-select"
        :model-value="selectedWatchLevel"
        :disabled="watchStateUpdatingAsin === selectedCompetitor.asin"
        :loading="watchStateUpdatingAsin === selectedCompetitor.asin"
        @update:model-value="updateWatchLevel"
      >
        <ElOption
          v-for="option in competitorWatchLevelOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
      <p v-if="selectedWatchState?.watchReason" class="watch-reason">{{ selectedWatchState.watchReason }}</p>
    </div>

    <div class="drawer-section">
      <h3>入池原因</h3>
      <ul v-if="selectedCompetitor.competitorReasons.length" class="reason-list">
        <li v-for="reason in selectedCompetitor.competitorReasons" :key="reason">{{ reason }}</li>
      </ul>
      <p v-else>-</p>
    </div>

    <div class="drawer-actions">
      <button type="button" @click="emit('toggle-key-competitor', selectedCompetitor)">
        <Star v-if="selectedCompetitor.isKeyCompetitor" :size="17" />
        <StarOff v-else :size="17" />
        <span>{{ selectedCompetitor.isKeyCompetitor ? "取消重点标记" : "标记为重点" }}</span>
      </button>
      <button type="button" @click="emit('open-product-activity-calendar', selectedCompetitor)">
        <CalendarDays :size="17" />
        <span>活动日历</span>
      </button>
      <button class="primary" type="button" @click="emit('open-amazon', selectedCompetitor)">
        <ExternalLink :size="17" />
        <span>打开 Amazon</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.drawer-watch-select {
  width: 100%;
}

.watch-reason {
  color: var(--text-muted, #64748b);
  font-size: 12px;
  margin: 8px 0 0;
}
</style>
