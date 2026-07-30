<script setup lang="ts">
import { Boxes, RefreshCw, Save } from "@lucide/vue";
import { ElButton, ElTag } from "element-plus";
import type {
  CommerceStore,
  OwnedProductListItem,
  ProductScoreLevel,
} from "@amazon-monitor/shared";
import {
  formatCount,
  formatMoney,
  formatPercent,
} from "../../utils/formatters";

defineProps<{
  products: OwnedProductListItem[];
  selectedProductId: number | null;
  stores: CommerceStore[];
  loading: boolean;
  date: string;
}>();

const emit = defineEmits<{
  select: [item: OwnedProductListItem];
  editMetric: [item: OwnedProductListItem];
}>();

function scoreClass(level: ProductScoreLevel): string {
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  return "low";
}

function syncLabel(status: string): string {
  if (status === "success") return "成功";
  if (status === "partial") return "部分";
  if (status === "failed") return "失败";
  if (status === "pending") return "等待";
  return "手动";
}

function storeName(stores: CommerceStore[], id: number | null): string {
  if (id === null) return "未分配店铺";
  return stores.find((item) => item.id === id)?.name ?? `店铺 #${id}`;
}

function salesAmount(item: OwnedProductListItem): number | null {
  return item.spApiEvidence.sales?.salesAmount ?? item.latestMetric?.salesAmount ?? null;
}

function orders(item: OwnedProductListItem): number | null {
  return item.spApiEvidence.sales?.orders ?? item.latestMetric?.orders ?? null;
}

function inventoryAvailable(item: OwnedProductListItem): number | null {
  return item.spApiEvidence.inventory?.fulfillableQuantity ?? item.latestMetric?.inventoryAvailable ?? null;
}

function operationalSyncLabel(item: OwnedProductListItem): string {
  if (item.spApiEvidence.sales || item.spApiEvidence.inventory) return "SP-API";
  return syncLabel(item.latestMetric?.syncStatus ?? item.syncStatus);
}

function operationalSyncedAt(item: OwnedProductListItem): string {
  return item.spApiEvidence.inventory?.lastSyncedAt
    ?? item.spApiEvidence.sales?.lastSyncedAt
    ?? item.latestMetric?.lastSyncedAt
    ?? item.lastSyncedAt
    ?? "未同步";
}

function operationalTrace(item: OwnedProductListItem): string | null {
  const evidence = item.spApiEvidence.inventory ?? item.spApiEvidence.sales;
  return evidence ? `来源 #${evidence.dataSourceId} · 运行 #${evidence.syncRunId}` : null;
}
</script>

<template>
  <section class="panel products-list-panel">
    <div class="panel-head">
      <div>
        <h2>SKU 列表</h2>
        <span>数据日期 {{ date }}</span>
      </div>
    </div>

    <div
      v-if="loading && products.length === 0"
      class="empty-state compact-empty"
    >
      <RefreshCw :size="22" class="spinning" />
      <p>正在加载 SKU 数据</p>
    </div>

    <div v-else-if="products.length === 0" class="empty-state">
      <Boxes :size="28" />
      <p>暂无自营 SKU，先新增一个经营对象再录入指标。</p>
    </div>

    <div v-else class="table-wrap compact-scroll products-table-wrap">
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>销售 / 订单</th>
            <th>库存</th>
            <th>广告</th>
            <th>风险</th>
            <th>机会</th>
            <th>新鲜度</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in products"
            :key="item.id"
            :class="{ selected: selectedProductId === item.id }"
            @click="emit('select', item)"
          >
            <td class="product-cell">
              <img
                v-if="item.imageUrl"
                :src="item.imageUrl"
                :alt="item.title"
              />
              <span v-else class="img-fallback">SKU</span>
              <div>
                <strong>{{ item.sku }}</strong>
                <span>{{ item.title }}</span>
                <small>
                  {{ storeName(stores, item.storeId) }} ·
                  {{ item.marketplace }} · {{ item.asin }} ·
                  {{ item.brand || "未标品牌" }}
                </small>
              </div>
            </td>
            <td>
              <strong>{{ formatMoney(salesAmount(item)) }}</strong>
              <small>{{ formatCount(orders(item)) }} 单</small>
            </td>
            <td>
              <strong>{{ item.latestMetric?.inventoryDays ?? "-" }} 天</strong>
              <small
                >{{
                  formatCount(inventoryAvailable(item))
                }}
                件</small
              >
            </td>
            <td>
              <strong>{{ formatPercent(item.latestMetric?.acos) }}</strong>
              <small>{{ formatMoney(item.latestMetric?.adSpend) }}</small>
            </td>
            <td>
              <span :class="['level', scoreClass(item.riskScore.level)]">
                {{ item.riskScore.score }}
              </span>
            </td>
            <td>
              <span
                :class="[
                  'pill',
                  item.opportunityScore.level === 'high'
                    ? 'success'
                    : 'neutral',
                ]"
              >
                {{ item.opportunityScore.score }}
              </span>
            </td>
            <td>
              <ElTag size="small">
                {{ operationalSyncLabel(item) }}
              </ElTag>
              <small>{{
                operationalSyncedAt(item)
              }}{{ operationalTrace(item) ? ` · ${operationalTrace(item)}` : "" }}
              }}</small>
            </td>
            <td>
              <ElButton size="small" @click.stop="emit('editMetric', item)">
                <template #icon><Save :size="12" /></template>
                指标
              </ElButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
