<script setup lang="ts">
import { computed } from "vue";
import { BarChart3, Layers3, PackageSearch, Percent, TrendingUp } from "@lucide/vue";
import { ElProgress, ElTag } from "element-plus";
import type { BrandPlaybookProfile } from "@amazon-monitor/shared";
import {
  getBrandPlaybookActivityMix,
  getBrandPlaybookTactics,
  type BrandPlaybookTacticTone
} from "../../utils/actionCenterBrandPlaybook";

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

const tactics = computed(() => props.profile ? getBrandPlaybookTactics(props.profile) : []);
const activityMix = computed(() => props.profile ? getBrandPlaybookActivityMix(props.profile) : []);

function tagType(tone: BrandPlaybookTacticTone): "success" | "warning" | "danger" | "info" {
  return tone;
}

function progressStatus(tone: BrandPlaybookTacticTone): "success" | "warning" | "exception" | undefined {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "danger") return "exception";
  return undefined;
}
</script>

<template>
  <section class="brand-playbook-card">
    <header>
      <Layers3 :size="16" />
      <div>
        <h3>品牌打法档案</h3>
        <small v-if="props.profile">{{ props.profile.windowDays }} 天窗口 / {{ props.profile.observedDays }} 个证据日</small>
      </div>
    </header>

    <p v-if="props.loading" class="muted">档案加载中...</p>
    <p v-else-if="!props.profile" class="muted">暂无可用品牌打法证据</p>
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

      <div class="activity-mix">
        <div class="activity-mix-head">
          <strong>动作结构</strong>
          <small>{{ props.profile.activityFrequency.totalEvents }} 条证据事件</small>
        </div>
        <div v-if="activityMix.length" class="activity-stack" aria-label="品牌打法动作结构">
          <span
            v-for="row in activityMix"
            :key="row.key"
            :style="{ width: `${row.percent}%`, backgroundColor: row.color }"
            :title="`${row.label}: ${row.value} (${row.percent}%)`"
          ></span>
        </div>
        <p v-else class="activity-empty">当前窗口暂无动作结构证据。</p>
        <div v-if="activityMix.length" class="activity-legend">
          <span v-for="row in activityMix" :key="row.key">
            <i :style="{ backgroundColor: row.color }"></i>
            <em>{{ row.label }}</em>
            <strong>{{ row.value }}</strong>
            <small>{{ row.percent }}%</small>
          </span>
        </div>
      </div>

      <div class="playbook-tactics">
        <article v-for="tactic in tactics" :key="tactic.key" class="playbook-tactic">
          <span class="playbook-tactic-head">
            <ElTag :type="tagType(tactic.tone)" effect="light" round>{{ tactic.label }}</ElTag>
            <strong>{{ tactic.title }}</strong>
          </span>
          <small>{{ tactic.detail }}</small>
          <ElProgress :percentage="tactic.strength" :show-text="false" :status="progressStatus(tactic.tone)" />
        </article>
      </div>

      <dl class="playbook-facts">
        <div>
          <dt>新品节奏</dt>
          <dd>{{ props.profile.newProductLaunchFrequency.newEntryCount }} 个新进 ASIN / {{ props.profile.newProductLaunchFrequency.newEntryDays }} 天</dd>
        </div>
        <div>
          <dt>冲榜周期</dt>
          <dd>{{ props.profile.surgeCycle.surgeDays }} 天上攻 / {{ props.profile.surgeCycle.dropDays }} 天回落</dd>
        </div>
        <div>
          <dt>活动结构</dt>
          <dd>Coupon {{ props.profile.activityFrequency.couponEventCount }} / Deal {{ props.profile.activityFrequency.dealEventCount }} / Review {{ props.profile.activityFrequency.reviewGrowthCount }}</dd>
        </div>
      </dl>

      <div v-if="props.profile.historicalStrongAsins.length" class="strong-asins">
        <small>历史强势 ASIN</small>
        <a
          v-for="item in props.profile.historicalStrongAsins"
          :key="item.asin"
          :href="item.productUrl || undefined"
          target="_blank"
          rel="noreferrer"
        >
          <span>{{ item.asin }}</span>
          <strong>#{{ item.bestRank ?? "-" }}</strong>
          <em>{{ item.daysInTop20 }} 天 Top20</em>
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
.playbook-tactic strong,
.strong-asins strong {
  color: #0f172a;
  font-weight: 700;
}

.playbook-tactics {
  display: grid;
  gap: 8px;
}

.activity-mix {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
}

.activity-mix-head {
  align-items: baseline;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
}

.activity-mix-head strong {
  color: #0f172a;
  font-size: 13px;
}

.activity-stack {
  background: #e2e8f0;
  border-radius: 999px;
  display: flex;
  height: 12px;
  min-width: 0;
  overflow: hidden;
}

.activity-stack span {
  flex: 0 0 auto;
  min-width: 4px;
}

.activity-empty {
  color: #64748b;
  font-size: 12px;
  margin: 0;
}

.activity-legend {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.activity-legend span {
  align-items: center;
  color: #475569;
  display: grid;
  font-size: 12px;
  gap: 6px;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  min-width: 0;
}

.activity-legend i {
  border-radius: 999px;
  display: inline-block;
  height: 8px;
  width: 8px;
}

.activity-legend em {
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-legend strong {
  color: #0f172a;
  font-weight: 700;
}

.playbook-tactic {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 9px 10px;
}

.playbook-tactic-head {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.playbook-tactic-head strong {
  line-height: 1.3;
  min-width: 0;
  overflow-wrap: anywhere;
}

.playbook-tactic small {
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

.playbook-tactic :deep(.el-progress-bar__outer) {
  background-color: #e2e8f0;
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

@media (max-width: 520px) {
  .activity-legend {
    grid-template-columns: 1fr;
  }
}
</style>
