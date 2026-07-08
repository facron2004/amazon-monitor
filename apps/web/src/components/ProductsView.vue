<script setup lang="ts">
import { computed, onMounted, reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { AlertTriangle, BarChart3, Boxes, PackagePlus, RefreshCw, Save, TrendingUp } from "@lucide/vue";
import type { OwnedProductListItem, ProductScoreLevel } from "@amazon-monitor/shared";
import { useProductStore } from "../stores/products";
import { formatCount, formatMoney, formatPercent } from "../utils/formatters";

const props = defineProps<{ date: string }>();

const store = useProductStore();
const { products, selectedProduct, loading, saving, error, query, status } = storeToRefs(store);

const createDialogOpen = reactive({ value: false });
const metricDialogOpen = reactive({ value: false });

const productForm = reactive({
  marketplace: "US",
  sku: "",
  asin: "",
  brand: "",
  title: "",
  category: ""
});

const metricForm = reactive({
  date: props.date,
  salesAmount: null as number | null,
  orders: null as number | null,
  inventoryDays: null as number | null,
  adSpend: null as number | null,
  acos: null as number | null,
  grossMargin: null as number | null,
  bsrRank: null as number | null,
  keywordRank: null as number | null,
  rating: null as number | null,
  reviewCount: null as number | null
});

const highRiskCount = computed(() => products.value.filter((item) => item.riskScore.level === "high").length);
const lowInventoryCount = computed(() =>
  products.value.filter((item) => {
    const days = item.latestMetric?.inventoryDays;
    return days !== null && days !== undefined && days < 21;
  }).length
);
const totalSales = computed(() => products.value.reduce((sum, item) => sum + (item.latestMetric?.salesAmount ?? 0), 0));
const avgOpportunity = computed(() => {
  if (products.value.length === 0) return 0;
  return Math.round(products.value.reduce((sum, item) => sum + item.opportunityScore.score, 0) / products.value.length);
});

watch(() => props.date, async (date) => {
  metricForm.date = date;
  await store.fetchProducts(date);
  if (selectedProduct.value) {
    await store.selectProduct(selectedProduct.value.id, date);
  }
});

onMounted(async () => {
  await store.fetchProducts(props.date);
});

function scoreClass(level: ProductScoreLevel): string {
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  return "low";
}

function syncLabel(statusValue: string): string {
  if (statusValue === "success") return "成功";
  if (statusValue === "partial") return "部分";
  if (statusValue === "failed") return "失败";
  if (statusValue === "pending") return "等待";
  return "手动";
}

function openCreateDialog(): void {
  productForm.marketplace = "US";
  productForm.sku = "";
  productForm.asin = "";
  productForm.brand = "";
  productForm.title = "";
  productForm.category = "";
  createDialogOpen.value = true;
}

async function submitProduct(): Promise<void> {
  if (!productForm.sku.trim() || !productForm.asin.trim() || !productForm.title.trim()) {
    ElMessage.warning("请填写 SKU、ASIN 和标题");
    return;
  }
  try {
    await store.createProduct({
      marketplace: productForm.marketplace.trim(),
      sku: productForm.sku.trim(),
      asin: productForm.asin.trim(),
      brand: productForm.brand.trim() || null,
      title: productForm.title.trim(),
      category: productForm.category.trim() || null,
      syncStatus: "manual",
      dataSource: "manual"
    }, props.date);
    createDialogOpen.value = false;
    ElMessage.success("已新增 SKU");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function selectProduct(item: OwnedProductListItem): Promise<void> {
  await store.selectProduct(item.id, props.date);
}

function openMetricDialog(item: OwnedProductListItem): void {
  void store.selectProduct(item.id, props.date);
  metricForm.date = props.date;
  metricForm.salesAmount = item.latestMetric?.salesAmount ?? null;
  metricForm.orders = item.latestMetric?.orders ?? null;
  metricForm.inventoryDays = item.latestMetric?.inventoryDays ?? null;
  metricForm.adSpend = item.latestMetric?.adSpend ?? null;
  metricForm.acos = item.latestMetric?.acos ?? null;
  metricForm.grossMargin = item.latestMetric?.grossMargin ?? null;
  metricForm.bsrRank = item.latestMetric?.bsrRank ?? null;
  metricForm.keywordRank = item.latestMetric?.keywordRank ?? null;
  metricForm.rating = item.latestMetric?.rating ?? null;
  metricForm.reviewCount = item.latestMetric?.reviewCount ?? null;
  metricDialogOpen.value = true;
}

async function submitMetric(): Promise<void> {
  if (!selectedProduct.value) return;
  try {
    await store.upsertMetric(selectedProduct.value.id, {
      date: metricForm.date,
      salesAmount: metricForm.salesAmount,
      orders: metricForm.orders,
      inventoryDays: metricForm.inventoryDays,
      adSpend: metricForm.adSpend,
      acos: metricForm.acos,
      grossMargin: metricForm.grossMargin,
      bsrRank: metricForm.bsrRank,
      keywordRank: metricForm.keywordRank,
      rating: metricForm.rating,
      reviewCount: metricForm.reviewCount,
      syncStatus: "manual",
      dataSource: "manual"
    }, props.date);
    metricDialogOpen.value = false;
    ElMessage.success("已保存指标");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}
</script>

<template>
  <section class="view products-view">
    <header class="products-toolbar panel">
      <div>
        <p class="eyebrow">Owned SKU Center</p>
        <h2>自营 SKU 经营中心</h2>
      </div>
      <div class="products-toolbar__actions">
        <ElInput v-model="query" clearable placeholder="搜索 SKU / ASIN / 标题" style="width: 240px" @keyup.enter="store.fetchProducts(props.date)" />
        <ElSelect v-model="status" style="width: 120px" @change="store.fetchProducts(props.date)">
          <ElOption label="活跃" value="active" />
          <ElOption label="暂停" value="paused" />
          <ElOption label="归档" value="archived" />
          <ElOption label="全部" value="all" />
        </ElSelect>
        <ElButton :loading="loading" @click="store.fetchProducts(props.date)">
          <template #icon><RefreshCw :size="14" /></template>
          刷新
        </ElButton>
        <ElButton type="primary" @click="openCreateDialog">
          <template #icon><PackagePlus :size="14" /></template>
          新增 SKU
        </ElButton>
      </div>
    </header>

    <div class="metrics products-metrics">
      <article class="metric">
        <span>自营 SKU</span>
        <strong>{{ products.length }}</strong>
      </article>
      <article class="metric hot">
        <span>高风险 SKU</span>
        <strong>{{ highRiskCount }}</strong>
      </article>
      <article class="metric">
        <span>库存低于 21 天</span>
        <strong>{{ lowInventoryCount }}</strong>
      </article>
      <article class="metric">
        <span>当日销售额</span>
        <strong>{{ formatMoney(totalSales) }}</strong>
      </article>
      <article class="metric review-metric">
        <span>平均机会分</span>
        <strong>{{ avgOpportunity }}</strong>
      </article>
    </div>

    <p v-if="error" class="products-error">{{ error }}</p>

    <div class="products-layout">
      <section class="panel products-list-panel">
        <div class="panel-head">
          <div>
            <h2>SKU 列表</h2>
            <span>数据日期 {{ props.date }}</span>
          </div>
        </div>

        <div v-if="loading && products.length === 0" class="empty-state compact-empty">
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
                :class="{ selected: selectedProduct?.id === item.id }"
                @click="selectProduct(item)"
              >
                <td class="product-cell">
                  <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.title" />
                  <span v-else class="img-fallback">SKU</span>
                  <div>
                    <strong>{{ item.sku }}</strong>
                    <span>{{ item.title }}</span>
                    <small>{{ item.marketplace }} · {{ item.asin }} · {{ item.brand || "未标品牌" }}</small>
                  </div>
                </td>
                <td>
                  <strong>{{ formatMoney(item.latestMetric?.salesAmount) }}</strong>
                  <small>{{ formatCount(item.latestMetric?.orders) }} 单</small>
                </td>
                <td>
                  <strong>{{ item.latestMetric?.inventoryDays ?? "-" }} 天</strong>
                  <small>{{ formatCount(item.latestMetric?.inventoryAvailable) }} 件</small>
                </td>
                <td>
                  <strong>{{ formatPercent(item.latestMetric?.acos) }}</strong>
                  <small>{{ formatMoney(item.latestMetric?.adSpend) }}</small>
                </td>
                <td>
                  <span :class="['level', scoreClass(item.riskScore.level)]">{{ item.riskScore.score }}</span>
                </td>
                <td>
                  <span :class="['pill', item.opportunityScore.level === 'high' ? 'success' : 'neutral']">{{ item.opportunityScore.score }}</span>
                </td>
                <td>
                  <ElTag size="small">{{ syncLabel(item.latestMetric?.syncStatus ?? item.syncStatus) }}</ElTag>
                  <small>{{ item.latestMetric?.lastSyncedAt ?? item.lastSyncedAt ?? "未同步" }}</small>
                </td>
                <td>
                  <ElButton size="small" @click.stop="openMetricDialog(item)">
                    <template #icon><Save :size="12" /></template>
                    指标
                  </ElButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel products-detail-panel">
        <div v-if="!selectedProduct" class="empty-state">
          <BarChart3 :size="28" />
          <p>选择一个 SKU 查看评分依据和近期指标。</p>
        </div>
        <template v-else>
          <div class="panel-head">
            <div>
              <h2>{{ selectedProduct.sku }}</h2>
              <span>{{ selectedProduct.asin }} · {{ selectedProduct.brand || "未标品牌" }}</span>
            </div>
            <ElButton size="small" type="primary" @click="openMetricDialog(selectedProduct)">
              <template #icon><Save :size="12" /></template>
              录入指标
            </ElButton>
          </div>

          <div class="score-grid">
            <article>
              <AlertTriangle :size="18" />
              <span>风险分</span>
              <strong>{{ selectedProduct.riskScore.score }}</strong>
            </article>
            <article>
              <TrendingUp :size="18" />
              <span>机会分</span>
              <strong>{{ selectedProduct.opportunityScore.score }}</strong>
            </article>
          </div>

          <section class="score-section">
            <h3>风险评分依据</h3>
            <div
              v-for="dimension in selectedProduct.riskScore.dimensions"
              :key="dimension.key"
              class="score-row"
            >
              <span>{{ dimension.label }}</span>
              <strong>{{ dimension.score }}</strong>
              <small>{{ dimension.reason }}</small>
            </div>
          </section>

          <section class="score-section">
            <h3>机会评分依据</h3>
            <div
              v-for="dimension in selectedProduct.opportunityScore.dimensions"
              :key="dimension.key"
              class="score-row"
            >
              <span>{{ dimension.label }}</span>
              <strong>{{ dimension.score }}</strong>
              <small>{{ dimension.reason }}</small>
            </div>
          </section>

          <section class="score-section">
            <h3>近期指标</h3>
            <div class="table-wrap compact-scroll product-metric-history">
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>销售额</th>
                    <th>库存天数</th>
                    <th>ACOS</th>
                    <th>BSR</th>
                    <th>核心词</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="metric in selectedProduct.metrics.slice(0, 10)" :key="metric.id">
                    <td>{{ metric.date }}</td>
                    <td>{{ formatMoney(metric.salesAmount) }}</td>
                    <td>{{ metric.inventoryDays ?? "-" }}</td>
                    <td>{{ formatPercent(metric.acos) }}</td>
                    <td>{{ formatCount(metric.bsrRank) }}</td>
                    <td>{{ formatCount(metric.keywordRank) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>
      </aside>
    </div>

    <ElDialog v-model="createDialogOpen.value" title="新增自营 SKU" width="560px">
      <div class="product-form-grid">
        <ElInput v-model="productForm.sku" placeholder="SKU" />
        <ElInput v-model="productForm.asin" placeholder="ASIN" />
        <ElInput v-model="productForm.marketplace" placeholder="站点" />
        <ElInput v-model="productForm.brand" placeholder="品牌" />
        <ElInput v-model="productForm.title" class="wide" placeholder="标题" />
        <ElInput v-model="productForm.category" class="wide" placeholder="类目" />
      </div>
      <template #footer>
        <ElButton @click="createDialogOpen.value = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="submitProduct">创建</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="metricDialogOpen.value" title="录入经营指标" width="680px">
      <div class="metric-form-grid">
        <ElInput v-model="metricForm.date" placeholder="日期" />
        <ElInput v-model.number="metricForm.salesAmount" placeholder="销售额" />
        <ElInput v-model.number="metricForm.orders" placeholder="订单数" />
        <ElInput v-model.number="metricForm.inventoryDays" placeholder="库存天数" />
        <ElInput v-model.number="metricForm.adSpend" placeholder="广告花费" />
        <ElInput v-model.number="metricForm.acos" placeholder="ACOS，如 0.25" />
        <ElInput v-model.number="metricForm.grossMargin" placeholder="毛利率，如 0.32" />
        <ElInput v-model.number="metricForm.bsrRank" placeholder="BSR 排名" />
        <ElInput v-model.number="metricForm.keywordRank" placeholder="核心词排名" />
        <ElInput v-model.number="metricForm.rating" placeholder="评分" />
        <ElInput v-model.number="metricForm.reviewCount" placeholder="Review 数" />
      </div>
      <template #footer>
        <ElButton @click="metricDialogOpen.value = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="submitMetric">保存</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped>
.products-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  flex: 0 0 auto;
}

.products-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.products-metrics {
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  flex: 0 0 auto;
}

.products-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.65fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.products-list-panel,
.products-detail-panel {
  min-height: 0;
}

.products-table-wrap {
  max-height: 100%;
}

.products-table-wrap table {
  min-width: 980px;
}

.products-table-wrap tbody tr {
  cursor: pointer;
}

.products-table-wrap tbody tr.selected {
  background: #eef2ff;
}

.products-error {
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 600;
}

.score-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.score-grid article {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: #f8fafc;
  padding: 12px;
  display: grid;
  gap: 5px;
}

.score-grid svg {
  color: var(--color-primary);
}

.score-grid span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.score-grid strong {
  font-size: 26px;
  color: var(--text-primary);
}

.score-section {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.score-section h3 {
  font-size: 13px;
  color: var(--text-primary);
}

.score-row {
  display: grid;
  grid-template-columns: minmax(92px, 0.6fr) 44px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 7px;
}

.score-row span {
  color: var(--text-secondary);
  font-size: 12px;
}

.score-row strong {
  font-size: 13px;
}

.score-row small {
  color: var(--text-muted);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-metric-history {
  max-height: 220px;
}

.product-metric-history table {
  min-width: 560px;
}

.product-form-grid,
.metric-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metric-form-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.wide {
  grid-column: 1 / -1;
}

@media (max-width: 1100px) {
  .products-layout {
    grid-template-columns: 1fr;
  }

  .products-metrics {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }
}
</style>
