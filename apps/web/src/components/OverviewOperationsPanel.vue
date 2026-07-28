<script setup lang="ts">
import { computed, type Component } from "vue";
import {
  Activity,
  BadgePercent,
  CircleDollarSign,
  ListTodo,
  Megaphone,
  Package,
  Percent,
  ShoppingCart
} from "@lucide/vue";
import type { DashboardMarketplaceOperations, DashboardOperationsSummary } from "@amazon-monitor/shared";
import { formatLocalDateTime } from "../utils/formatters-time";
import { formatMarketplaceMoney } from "../utils/marketplace-money";

const props = defineProps<{
  summary: DashboardOperationsSummary | null;
  majorEventCount: number;
}>();

interface MetricCard {
  label: string;
  value: string;
  detail: string;
  icon: Component;
  tone?: "risk" | "attention";
}

const marketplaces = computed(() => props.summary?.marketplaces ?? []);
const singleMarketplace = computed(() => marketplaces.value.length === 1 ? marketplaces.value[0] : null);
const showEmptyState = computed(() => props.summary?.activeProductCount === 0);
const coverageText = computed(() => {
  if (!props.summary || props.summary.activeProductCount === 0) return "尚未添加自营 SKU";
  return `${props.summary.productMetricCount}/${props.summary.activeProductCount} 个 SKU 有当日指标`;
});
const updatedText = computed(() => props.summary?.lastSyncedAt
  ? `更新于 ${formatLocalDateTime(props.summary.lastSyncedAt)}`
  : "暂无当日同步记录");

const salesTrend = computed(() => {
  const points = singleMarketplace.value?.sevenDaySales ?? [];
  const max = Math.max(...points.map((point) => point.salesAmount ?? 0), 0);
  return points.map((point) => ({
    ...point,
    height: point.salesAmount === null || max === 0 ? 4 : Math.max(8, Math.round((point.salesAmount / max) * 30))
  }));
});

const cards = computed<MetricCard[]>(() => {
  const operations = props.summary;
  const todaySales = moneyMetric("salesAmount");
  const previousSales = moneyMetric("previousSalesAmount");
  const adSpend = moneyMetric("adSpend");
  return [
    { label: "今日销售", ...todaySales, detail: salesChangeDetail() || todaySales.detail, icon: CircleDollarSign },
    { label: "昨日销售", ...previousSales, icon: CircleDollarSign },
    { label: "今日订单", value: formatNumber(sumMetric("orders")), detail: coverageText.value, icon: ShoppingCart },
    { label: "广告花费", ...adSpend, icon: Megaphone },
    { label: "ACOS", ...percentageMetric("acos"), icon: Percent },
    { label: "毛利率", ...percentageMetric("grossMargin"), icon: BadgePercent },
    {
      label: "库存风险",
      value: String(operations?.inventoryRiskSkuCount ?? 0),
      detail: "进入补货窗口或库存为 0",
      icon: Package,
      tone: operations?.inventoryRiskSkuCount ? "risk" : undefined
    },
    {
      label: "重点异动",
      value: String(props.majorEventCount),
      detail: "P0 / P1 优先跟进",
      icon: Activity,
      tone: props.majorEventCount ? "attention" : undefined
    },
    {
      label: "待处理任务",
      value: String(operations?.openTaskCount ?? 0),
      detail: "待处理、进行中、待复核",
      icon: ListTodo,
      tone: operations?.openTaskCount ? "attention" : undefined
    }
  ];
});
const primaryCards = computed(() => cards.value.slice(0, 4));
const secondaryCards = computed(() => cards.value.slice(4));

function moneyMetric(key: "salesAmount" | "previousSalesAmount" | "adSpend"): Pick<MetricCard, "value" | "detail"> {
  const available = marketplaces.value.filter((item) => item[key] !== null);
  if (available.length === 0) return { value: "--", detail: "录入当日经营指标后显示" };
  if (marketplaces.value.length === 1) {
    const item = marketplaces.value[0];
    return { value: formatMarketplaceMoney(item[key], item.marketplace), detail: item.marketplace };
  }
  return { value: `${available.length} 个站点`, detail: marketplaceValues(available, key, false) };
}

function percentageMetric(key: "acos" | "grossMargin"): Pick<MetricCard, "value" | "detail"> {
  const available = marketplaces.value.filter((item) => item[key] !== null);
  if (available.length === 0) return { value: "--", detail: "暂无可用口径" };
  if (marketplaces.value.length === 1) return { value: formatPercent(available[0][key]), detail: available[0].marketplace };
  return { value: "按站点", detail: marketplaceValues(available, key, true) };
}

function marketplaceValues(items: DashboardMarketplaceOperations[], key: "salesAmount" | "previousSalesAmount" | "adSpend" | "acos" | "grossMargin", percent: boolean): string {
  const visible = items.slice(0, 2).map((item) => `${item.marketplace} ${percent ? formatPercent(item[key]) : formatMarketplaceMoney(item[key], item.marketplace)}`);
  return `${visible.join(" · ")}${items.length > 2 ? ` · +${items.length - 2}` : ""}`;
}

function sumMetric(key: "orders"): number | null {
  const values = marketplaces.value.map((item) => item[key]).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function salesChangeDetail(): string {
  const item = singleMarketplace.value;
  if (!item || item.salesAmount === null || item.previousSalesAmount === null || item.previousSalesAmount === 0) return "";
  const change = (item.salesAmount - item.previousSalesAmount) / item.previousSalesAmount;
  return `较昨日 ${change >= 0 ? "+" : ""}${formatPercent(change)}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "--" : `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null): string {
  return value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}
</script>

<template>
  <section class="overview-operations">
    <header class="overview-operations__header">
      <div>
        <span>经营指标</span>
        <h2>今日经营概览</h2>
      </div>
      <p>{{ coverageText }} · {{ updatedText }}</p>
    </header>

    <div class="overview-operations__primary-grid">
      <article v-for="(card, index) in primaryCards" :key="card.label" :class="['operations-metric', card.tone && `operations-metric--${card.tone}`]">
        <div class="operations-metric__label">
          <component :is="card.icon" :size="15" />
          <span>{{ card.label }}</span>
        </div>
        <strong>{{ card.value }}</strong>
        <small>{{ card.detail }}</small>
        <div v-if="index === 0 && salesTrend.length" class="operations-trend" aria-label="近 7 日销售趋势">
          <i v-for="point in salesTrend" :key="point.date" :style="{ height: `${point.height}px` }" :title="`${point.date}: ${point.salesAmount ?? '--'}`" />
        </div>
      </article>
    </div>

    <div class="overview-operations__secondary-grid">
      <article v-for="card in secondaryCards" :key="card.label" :class="['operations-metric', card.tone && `operations-metric--${card.tone}`]">
        <div class="operations-metric__label">
          <component :is="card.icon" :size="15" />
          <span>{{ card.label }}</span>
        </div>
        <strong>{{ card.value }}</strong>
        <small>{{ card.detail }}</small>
      </article>
    </div>

    <div v-if="showEmptyState" class="overview-operations__empty">
      <img src="/operations-empty-state.png" alt="" />
      <div>
        <strong>尚无经营指标</strong>
        <p>添加自营 SKU 并完成首次数据同步后，这里会呈现销售、广告与库存状态。</p>
      </div>
    </div>
  </section>
</template>

<style src="../styles/overview-operations.css"></style>
