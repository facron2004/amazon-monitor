<script setup lang="ts">
import { BarChart3, Layers3, PackageSearch, Percent, TrendingUp } from "@lucide/vue";
import type { BrandPlaybookProfile } from "@amazon-monitor/shared";

const props = defineProps<{
  profile: BrandPlaybookProfile | null;
  loading: boolean;
}>();

function formatMoney(value: number | null): string {
  return value === null ? "-" : `$${value.toFixed(2)}`;
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : String(value);
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 1000) / 10}%`;
}
</script>

<template>
  <section class="brand-playbook-card">
    <header>
      <Layers3 :size="16" />
      <div>
        <h3>品牌 Playbook</h3>
        <small v-if="props.profile">{{ props.profile.windowDays }}d · {{ props.profile.observedDays }} 个证据日</small>
      </div>
    </header>

    <p v-if="props.loading" class="muted">画像加载中...</p>
    <p v-else-if="!props.profile" class="muted">暂无可用品牌画像证据</p>
    <template v-else>
      <div class="playbook-grid">
        <span>
          <BarChart3 :size="14" />
          <small>价格带</small>
          <strong>{{ formatMoney(props.profile.commonPriceBand.minPrice) }} - {{ formatMoney(props.profile.commonPriceBand.maxPrice) }}</strong>
        </span>
        <span>
          <Percent :size="14" />
          <small>Coupon 强度</small>
          <strong>{{ formatPercent(props.profile.couponIntensity.activeRate) }}</strong>
        </span>
        <span>
          <TrendingUp :size="14" />
          <small>活动频率</small>
          <strong>{{ props.profile.activityFrequency.dailyAverage }}/d</strong>
        </span>
        <span>
          <PackageSearch :size="14" />
          <small>Top100 ASIN</small>
          <strong>{{ formatNumber(props.profile.asinCountChanges.latestTop100Count) }}</strong>
        </span>
      </div>

      <dl class="playbook-facts">
        <div>
          <dt>新品节奏</dt>
          <dd>{{ props.profile.newProductLaunchFrequency.newEntryCount }} 个新进入 · {{ props.profile.newProductLaunchFrequency.newEntryDays }} 天</dd>
        </div>
        <div>
          <dt>冲榜周期</dt>
          <dd>{{ props.profile.surgeCycle.surgeDays }} 天上攻 · {{ props.profile.surgeCycle.dropDays }} 天回落</dd>
        </div>
        <div>
          <dt>活动结构</dt>
          <dd>Coupon {{ props.profile.activityFrequency.couponEventCount }} · Deal {{ props.profile.activityFrequency.dealEventCount }} · Review {{ props.profile.activityFrequency.reviewGrowthCount }}</dd>
        </div>
      </dl>

      <div v-if="props.profile.historicalStrongAsins.length" class="strong-asins">
        <small>历史强 ASIN</small>
        <a
          v-for="item in props.profile.historicalStrongAsins"
          :key="item.asin"
          :href="item.productUrl || undefined"
          target="_blank"
          rel="noreferrer"
        >
          <span>{{ item.asin }}</span>
          <strong>#{{ item.bestRank ?? "-" }}</strong>
          <em>{{ item.daysInTop20 }}d Top20</em>
        </a>
      </div>
    </template>
  </section>
</template>

<style scoped>
.brand-playbook-card {
  display: grid;
  gap: 10px;
}

.brand-playbook-card > header {
  align-items: center;
  color: #0f172a;
  display: flex;
  gap: 8px;
}

.brand-playbook-card h3 {
  font-size: 15px;
  margin: 0;
}

.brand-playbook-card small,
.muted,
.playbook-facts dt,
.strong-asins em {
  color: #64748b;
  font-size: 12px;
}

.muted {
  margin: 0;
}

.playbook-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.playbook-grid span {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
}

.playbook-grid svg {
  color: #0f766e;
}

.playbook-grid strong,
.playbook-facts dd,
.strong-asins strong {
  color: #0f172a;
  font-weight: 700;
}

.playbook-facts {
  display: grid;
  gap: 7px;
  margin: 0;
}

.playbook-facts div {
  display: grid;
  gap: 2px;
}

.playbook-facts dd {
  margin: 0;
}

.strong-asins {
  display: grid;
  gap: 6px;
}

.strong-asins a {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: inherit;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto auto;
  padding: 8px 10px;
  text-decoration: none;
}

.strong-asins span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>