<script setup lang="ts">
import { computed } from "vue";
import { ElButton, ElTag } from "element-plus";
import { ArrowRight, BadgeDollarSign, Megaphone, PackageCheck, ScanText, Star } from "@lucide/vue";
import type {
  OwnedProductOperationsDetail,
  ProductDataFreshness,
} from "@amazon-monitor/shared";
import type { TabKey } from "../../constants/tabs";
import { formatCount, formatPercent } from "../../utils/formatters";

const props = defineProps<{ operations: OwnedProductOperationsDetail }>();
const emit = defineEmits<{ navigate: [tab: TabKey] }>();

const healthItems = computed(() => [
  {
    key: "listing",
    label: "Listing 健康",
    value: props.operations.listingHealth
      ? `${props.operations.listingHealth.health.score}/100`
      : "待补数据",
    state: props.operations.listingHealth?.health.level ?? "data_gap",
    meta: freshnessText(props.operations.listingHealth?.freshness),
    icon: ScanText,
    tab: "listing-health" as TabKey,
  },
  {
    key: "review",
    label: "Review VOC",
    value: props.operations.reviewVoc
      ? `${formatPercent(props.operations.reviewVoc.negativeRate)} 负面`
      : "待补数据",
    state: props.operations.reviewVoc?.level ?? "data_gap",
    meta: props.operations.reviewVoc
      ? `${props.operations.reviewVoc.reviewCount} 条样本 · ${freshnessText(props.operations.reviewVoc.freshness)}`
      : "暂无 Review 样本",
    icon: Star,
    tab: "review-voc" as TabKey,
  },
  {
    key: "inventory",
    label: "库存安全",
    value: props.operations.inventory?.inventoryDays === null || !props.operations.inventory
      ? "待补数据"
      : `${props.operations.inventory.inventoryDays.toFixed(1)} 天`,
    state: props.operations.inventory?.level ?? "data_gap",
    meta: props.operations.inventory
      ? `可售 ${formatCount(props.operations.inventory.inventoryAvailable)} · ${freshnessText(props.operations.inventory.freshness)}`
      : "暂无库存计划",
    icon: PackageCheck,
    tab: "inventory" as TabKey,
  },
  {
    key: "profit",
    label: "利润安全",
    value: props.operations.access.profit === "denied"
      ? "无权限"
      : formatPercent(props.operations.profit?.grossMargin ?? null),
    state: props.operations.profit?.level ?? "data_gap",
    meta: props.operations.profit
      ? `安全价 ${props.operations.profit.minimumSafePrice?.toFixed(2) ?? "待测算"}`
      : "暂无利润计划",
    icon: BadgeDollarSign,
    tab: "profit" as TabKey,
  },
  {
    key: "ads",
    label: "广告效率",
    value: props.operations.access.ads === "denied"
      ? "无权限"
      : formatPercent(props.operations.ads?.averageAcos ?? null),
    state: props.operations.ads?.riskCount ? "risk" : "healthy",
    meta: props.operations.ads
      ? `${props.operations.ads.riskCount} 项风险 · ${props.operations.ads.scaleCount} 项机会`
      : "暂无广告证据",
    icon: Megaphone,
    tab: "ads" as TabKey,
  },
]);

function freshnessText(freshness: ProductDataFreshness | undefined): string {
  if (!freshness) return "未同步";
  return `${freshness.dataSource} · ${freshness.lastSyncedAt?.slice(0, 16).replace("T", " ") ?? "未同步"}`;
}

function tone(state: string): "success" | "warning" | "danger" | "info" {
  if (state === "healthy" || state === "low") return "success";
  if (state === "risk" || state === "critical" || state === "high") return "danger";
  if (state === "watch" || state === "medium" || state === "overstock") return "warning";
  return "info";
}

function stateLabel(state: string): string {
  const labels: Record<string, string> = {
    healthy: "健康",
    low: "低",
    watch: "关注",
    medium: "中",
    risk: "风险",
    critical: "紧急",
    high: "高",
    overstock: "滞销",
    data_gap: "数据缺口",
  };
  return labels[state] ?? state;
}
</script>

<template>
  <section class="product-operations-section">
    <div class="product-operations-section__head">
      <div>
        <h3>专项健康</h3>
        <p>同一证据日的经营安全线</p>
      </div>
    </div>
    <div class="product-health-list">
      <button
        v-for="item in healthItems"
        :key="item.key"
        type="button"
        class="product-health-row"
        @click="emit('navigate', item.tab)"
      >
        <component :is="item.icon" :size="17" />
        <span>
          <small>{{ item.label }}</small>
          <strong>{{ item.value }}</strong>
        </span>
        <span class="product-health-row__meta">{{ item.meta }}</span>
        <ElTag
          size="small"
          effect="plain"
          :type="tone(item.state)"
        >
          {{ stateLabel(item.state) }}
        </ElTag>
        <ArrowRight :size="15" />
      </button>
    </div>

    <div class="product-score-evidence">
      <section>
        <header>
          <h4>风险评分 {{ operations.product.riskScore.score }}</h4>
          <ElTag size="small" :type="tone(operations.product.riskScore.level)">
            {{ stateLabel(operations.product.riskScore.level) }}
          </ElTag>
        </header>
        <div
          v-for="dimension in operations.product.riskScore.dimensions"
          :key="dimension.key"
          class="product-score-evidence__row"
        >
          <span>{{ dimension.label }}</span>
          <strong>{{ dimension.score }}</strong>
          <small>{{ dimension.reason }}</small>
        </div>
      </section>
      <section>
        <header>
          <h4>机会评分 {{ operations.product.opportunityScore.score }}</h4>
          <ElTag size="small" :type="tone(operations.product.opportunityScore.level)">
            {{ stateLabel(operations.product.opportunityScore.level) }}
          </ElTag>
        </header>
        <div
          v-for="dimension in operations.product.opportunityScore.dimensions"
          :key="dimension.key"
          class="product-score-evidence__row"
        >
          <span>{{ dimension.label }}</span>
          <strong>{{ dimension.score }}</strong>
          <small>{{ dimension.reason }}</small>
        </div>
      </section>
    </div>

    <section class="product-competitor-section">
      <div class="product-operations-section__head">
        <div>
          <h3>同类竞品对比</h3>
          <p>仅匹配同站点、同类目竞品池证据</p>
        </div>
        <ElButton text size="small" @click="emit('navigate', 'competitors')">
          查看竞品池
          <template #icon><ArrowRight :size="13" /></template>
        </ElButton>
      </div>
      <div v-if="operations.competitors.length" class="table-wrap compact-scroll product-competitor-table">
        <table>
          <thead>
            <tr><th>竞品</th><th>价格</th><th>排名</th><th>Review</th><th>活动</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in operations.competitors" :key="item.id">
              <td><strong>{{ item.brand || "未知品牌" }}</strong><small>{{ item.asin }}</small></td>
              <td>{{ item.latestPrice?.toFixed(2) ?? "—" }}</td>
              <td>{{ item.latestRank ? `#${item.latestRank}` : "—" }}</td>
              <td>{{ formatCount(item.latestReviewCount) }}</td>
              <td>{{ item.dealBadge || item.couponText || "无" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="product-inline-state">
        当前 SKU 没有同站点、同类目的竞品池证据，请先补齐商品类目或加入竞品。
      </p>
    </section>
  </section>
</template>
