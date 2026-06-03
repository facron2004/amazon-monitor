<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  Mail,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  Send,
  Star,
  StarOff,
  Tags
} from "@lucide/vue";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { isoDate, selectSpecificBestsellerRank } from "@amazon-monitor/shared";
import type {
  ProductRanking,
  AlertLog,
  BsrRankChange,
  BsrSnapshotQuality,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategoryMonitor,
  CategorySignalLog,
  CollectTaskLog,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  CompetitorFolder,
  CompetitorPoolItem,
  DailyChange,
  DashboardSummary,
  KeywordMonitor,
  NotificationChannel,
  NotificationSchedule,
  NotificationSendLog,
  ProductActivityCalendar,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { api, type CategoryDetail, type CategoryReportResponse, type DailyReportResponse, type KeywordDetail } from "./api";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type TabKey = "overview" | "categories" | "keywords" | "competitors" | "alerts" | "reports" | "notifications" | "logs";

const tabs: Array<{ key: TabKey; label: string; icon: typeof BarChart3 }> = [
  { key: "overview", label: "总览", icon: BarChart3 },
  { key: "categories", label: "类目情报", icon: Database },
  { key: "keywords", label: "关键词", icon: Search },
  { key: "competitors", label: "竞品池", icon: Tags },
  { key: "alerts", label: "告警", icon: Bell },
  { key: "notifications", label: "通知", icon: Send },
  { key: "reports", label: "日报", icon: FileText },
  { key: "logs", label: "日志", icon: ClipboardList }
];

const activeTab = ref<TabKey>("categories");
const date = ref(isoDate());
const categoryDataDate = ref(date.value);
const loading = ref(false);
const actionMessage = ref("");
const errorMessage = ref("");
const sendingScheduleId = ref<number | null>(null);
const toasts = ref<Array<{ id: number; message: string; type: "success" | "danger"; fadingOut?: boolean }>>([]);
let toastIdCounter = 0;
let actionTimer: ReturnType<typeof setTimeout> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string, type: "success" | "danger" = "success") {
  const id = ++toastIdCounter;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    const t = toasts.value.find((item) => item.id === id);
    if (t) t.fadingOut = true;
    setTimeout(() => { toasts.value = toasts.value.filter((item) => item.id !== id); }, 300);
  }, 4000);
}

function setAction(msg: string) {
  actionMessage.value = msg;
  if (actionTimer) clearTimeout(actionTimer);
  actionTimer = setTimeout(() => { actionMessage.value = ""; }, 5000);
  showToast(msg, "success");
}

function setError(msg: string) {
  errorMessage.value = msg;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { errorMessage.value = ""; }, 8000);
  showToast(msg, "danger");
}

function imgFallback(event: Event) {
  const img = event.target as HTMLImageElement;
  const bounds = img.getBoundingClientRect();
  img.style.display = 'none';
  const fallback = document.createElement('div');
  fallback.className = 'img-fallback';
  fallback.style.width = `${Math.max(42, Math.round(bounds.width || 52))}px`;
  fallback.style.height = `${Math.max(42, Math.round(bounds.height || 52))}px`;
  fallback.textContent = '无图';
  img.parentElement?.insertBefore(fallback, img);
}
const summary = ref<DashboardSummary | null>(null);
const categories = ref<CategoryMonitor[]>([]);
const keywords = ref<KeywordMonitor[]>([]);
const competitorFolders = ref<CompetitorFolder[]>([]);
const competitors = ref<CompetitorPoolItem[]>([]);
const categorySignals = ref<CategorySignalLog[]>([]);
const bsrRankChanges = ref<BsrRankChange[]>([]);
const bsrQuality = ref<BsrSnapshotQuality[]>([]);
const actionInsights = ref<CompetitorActionInsight[]>([]);
const activityEvents = ref<CompetitorActivityEvent[]>([]);
const priceHistory = ref<ProductPriceHistory[]>([]);
const categoryProductQuery = ref("");
const categoryBrandFilter = ref("all");
const categoryRankWindow = ref<"all" | "top20" | "top50" | "top100">("top100");
const activityEventFilter = ref("all");
const competitorQuery = ref("");
const competitorSourceFilter = ref<"all" | "keyword" | "category" | "hybrid">("all");
const competitorTierFilter = ref<"all" | "core" | "rising" | "activity" | "watch">("all");
const selectedCompetitorAsin = ref<string | null>(null);
const productActivityCalendar = ref<ProductActivityCalendar | null>(null);
const alerts = ref<AlertLog[]>([]);
const changes = ref<DailyChange[]>([]);
const logs = ref<CollectTaskLog[]>([]);
const notificationSchedules = ref<NotificationSchedule[]>([]);
const notificationLogs = ref<NotificationSendLog[]>([]);
const report = ref<DailyReportResponse | null>(null);
const categoryReport = ref<CategoryReportResponse | null>(null);
const detail = ref<KeywordDetail | null>(null);
const categoryDetail = ref<CategoryDetail | null>(null);
const selectedKeywordId = ref<number | null>(null);
const selectedCompetitorKeywordId = ref<number | null>(null);
const selectedCategoryId = ref<number | null>(null);
const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let categoryRefreshTimer: ReturnType<typeof setInterval> | null = null;

const keywordForm = ref<{
  keyword: string;
  marketplace: string;
  zipCode: string;
  language: string;
  categoryTag: string;
  crawlPages: number;
  status: "enabled" | "disabled";
}>({
  keyword: "",
  marketplace: "amazon.com",
  zipCode: "90001",
  language: "en_US",
  categoryTag: "",
  crawlPages: 3,
  status: "enabled"
});

const categoryForm = ref<{
  name: string;
  marketplace: string;
  categoryUrl: string;
  categoryPath: string;
  crawlTopN: number;
  status: "enabled" | "disabled";
}>({
  name: "",
  marketplace: "amazon.com",
  categoryUrl: "",
  categoryPath: "",
  crawlTopN: 100,
  status: "enabled"
});

const notificationForm = ref<{
  name: string;
  channel: NotificationChannel;
  target: string;
  sendTime: string;
  timezone: string;
  status: "enabled" | "disabled";
}>({
  name: "",
  channel: "email",
  target: "",
  sendTime: "09:30",
  timezone: "Asia/Shanghai",
  status: "enabled"
});

const selectedKeyword = computed(() => keywords.value.find((item) => item.id === selectedKeywordId.value) ?? null);
const selectedCategory = computed(() => categories.value.find((item) => item.id === selectedCategoryId.value) ?? null);
const pendingAlerts = computed(() => alerts.value.filter((item) => item.status === "pending"));
const highAlerts = computed(() => alerts.value.filter((item) => ["critical", "high"].includes(item.alertLevel)));
const topSnapshots = computed(() => detail.value?.snapshots.slice(0, 10) ?? []);
const categoryBrandOptions = computed(() =>
  Array.from(new Set((categoryDetail.value?.snapshots ?? []).map((item) => item.brand || "Unknown"))).sort((a, b) => a.localeCompare(b))
);
const topCategorySnapshots = computed<BestsellerRankSnapshot[]>(() => {
  const query = categoryProductQuery.value.trim().toLowerCase();
  const rankMax = categoryRankWindow.value === "top20" ? 20 : categoryRankWindow.value === "top50" ? 50 : categoryRankWindow.value === "top100" ? 100 : Infinity;
  return (categoryDetail.value?.snapshots ?? []).filter((item) => {
    const brand = item.brand || "Unknown";
    const matchesBrand = categoryBrandFilter.value === "all" || brand === categoryBrandFilter.value;
    const matchesRank = item.rank <= rankMax;
    const matchesQuery =
      !query ||
      item.asin.toLowerCase().includes(query) ||
      item.title.toLowerCase().includes(query) ||
      brand.toLowerCase().includes(query);
    return matchesBrand && matchesRank && matchesQuery;
  });
});
const filteredActivityEvents = computed(() =>
  activityEvents.value.filter((item) => activityEventFilter.value === "all" || item.eventType === activityEventFilter.value)
);
const badBsrQuality = computed(() => bsrQuality.value.filter((item) => item.qualityStatus !== "ok"));
const visibleActionInsights = computed(() => actionInsights.value);
const activityEventOptions = computed(() =>
  Array.from(new Set(activityEvents.value.map((item) => item.eventType)))
    .sort()
    .map((eventType) => ({ eventType, label: changeLabel(eventType) }))
);
const visibleCompetitors = computed(() => {
  const query = competitorQuery.value.trim().toLowerCase();
  return competitors.value.filter((item) => {
    const matchesSource =
      competitorSourceFilter.value === "all" ||
      item.sourceType === competitorSourceFilter.value ||
      (competitorSourceFilter.value === "category" && item.sourceType === "hybrid") ||
      (competitorSourceFilter.value === "keyword" && item.sourceType === "hybrid");
    const matchesTier = competitorTierFilter.value === "all" || item.competitorTier === competitorTierFilter.value;
    if (!query) {
      return matchesSource && matchesTier;
    }
    return (
      matchesSource &&
      matchesTier &&
      (item.asin.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        (item.brand ?? "").toLowerCase().includes(query) ||
        item.competitorReasons.some((reason) => reason.toLowerCase().includes(query)))
    );
  });
});
const topBrandMatrix = computed<BrandMatrixSnapshot[]>(() => categoryDetail.value?.brandMatrix ?? []);
const categoryDataIsFallback = computed(() => activeTab.value === "categories" && categoryDataDate.value !== date.value);

async function loadAll() {
  await loadCurrentView();
}

async function loadCurrentView() {
  loading.value = true;
  errorMessage.value = "";
  try {
    if (activeTab.value === "overview") {
      await loadOverview();
    } else if (activeTab.value === "categories") {
      await loadCategories();
    } else if (activeTab.value === "keywords") {
      await loadKeywords();
    } else if (activeTab.value === "competitors") {
      await loadCompetitors();
    } else if (activeTab.value === "alerts") {
      await loadAlerts();
    } else if (activeTab.value === "reports") {
      await loadReport();
    } else if (activeTab.value === "notifications") {
      await loadNotifications();
    } else if (activeTab.value === "logs") {
      await loadLogs();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function loadOverview() {
  const [summaryData, keywordData, alertData, changeData] = await Promise.all([
    api.summary(date.value),
    api.keywords(),
    api.alerts(date.value),
    api.changes(date.value)
  ]);
  summary.value = summaryData;
  keywords.value = keywordData;
  alerts.value = alertData;
  changes.value = changeData;
  if (!selectedKeywordId.value && keywordData[0]) {
    selectedKeywordId.value = keywordData[0].id;
  }
}

async function loadKeywords() {
  const keywordData = await api.keywords();
  keywords.value = keywordData;
  if (!selectedKeywordId.value && keywordData[0]) {
    selectedKeywordId.value = keywordData[0].id;
  }
  await loadDetail();
}

async function loadCategories() {
  const categoryData = await api.categories();
  categories.value = categoryData;
  if (!selectedCategoryId.value && categoryData[0]) {
    selectedCategoryId.value = categoryData[0].id;
  }
  await loadCategoryDetail();
}

async function resolveCategoryDataDate(categoryId: number | null): Promise<string> {
  const currentRows = await api.bsrHistory({
    date: date.value,
    sourceType: "category_bestseller",
    sourceId: categoryId,
    limit: 1
  });
  if (currentRows.length > 0) {
    return date.value;
  }
  const latestRows = await api.bsrHistory({
    sourceType: "category_bestseller",
    sourceId: categoryId,
    limit: 1
  });
  return latestRows[0]?.snapshotDate ?? date.value;
}

async function loadCompetitors() {
  const [folderData, competitorData] = await Promise.all([
    api.competitorFolders(),
    api.competitors({
      keywordId: selectedCompetitorKeywordId.value,
      sourceType: competitorSourceFilter.value === "hybrid" ? "hybrid" : "all",
      tier: competitorTierFilter.value
    })
  ]);
  competitorFolders.value = folderData;
  competitors.value = competitorData;
  if (selectedCompetitorAsin.value && !competitorData.some((item) => item.asin === selectedCompetitorAsin.value)) {
    selectedCompetitorAsin.value = null;
    productActivityCalendar.value = null;
  }
}

async function loadAlerts() {
  alerts.value = await api.alerts(date.value);
}

async function loadReport() {
  const [keywordReport, allCategoryReport] = await Promise.all([api.report(date.value), api.categoryReport(date.value)]);
  report.value = keywordReport;
  categoryReport.value = allCategoryReport;
}

async function loadLogs() {
  logs.value = await api.taskLogs();
}

async function loadNotifications() {
  const [scheduleData, logData] = await Promise.all([api.notificationSchedules(), api.notificationLogs()]);
  notificationSchedules.value = scheduleData;
  notificationLogs.value = logData;
}

async function loadDetail() {
  if (!selectedKeywordId.value) {
    detail.value = null;
    return;
  }
  detail.value = await api.keywordDetail(selectedKeywordId.value, date.value);
  await renderChart();
}

async function loadCategoryDetail() {
  const dataDate = await resolveCategoryDataDate(selectedCategoryId.value);
  categoryDataDate.value = dataDate;
  if (!selectedCategoryId.value) {
    categoryDetail.value = null;
    categorySignals.value = await api.categorySignals(dataDate);
    bsrQuality.value = await api.bsrQuality({ date: dataDate, sourceType: "category_bestseller" });
    bsrRankChanges.value = await api.bsrChanges({ date: dataDate, sourceType: "category_bestseller" });
    actionInsights.value = await api.actionInsights({ date: dataDate, sourceType: "category_bestseller" });
    activityEvents.value = await api.activityEvents({ date: dataDate });
    priceHistory.value = await api.productPriceHistory({ date: dataDate });
    return;
  }
  const [detailData, signalsData, reportData, bsrQualityData, bsrChangesData, actionInsightData, activityEventData, priceHistoryData] = await Promise.all([
    api.categoryDetail(selectedCategoryId.value, dataDate),
    api.categorySignals(dataDate, selectedCategoryId.value),
    api.categoryReport(dataDate, selectedCategoryId.value),
    api.bsrQuality({ date: dataDate, sourceType: "category_bestseller", sourceId: selectedCategoryId.value }),
    api.bsrChanges({ date: dataDate, sourceType: "category_bestseller", sourceId: selectedCategoryId.value }),
    api.actionInsights({ date: dataDate, sourceType: "category_bestseller", sourceId: selectedCategoryId.value }),
    api.activityEvents({ date: dataDate, categoryId: selectedCategoryId.value }),
    api.productPriceHistory({ date: dataDate, categoryId: selectedCategoryId.value })
  ]);
  categoryDetail.value = detailData;
  categorySignals.value = signalsData;
  categoryReport.value = reportData;
  bsrQuality.value = bsrQualityData;
  bsrRankChanges.value = bsrChangesData;
  actionInsights.value = actionInsightData;
  activityEvents.value = activityEventData;
  priceHistory.value = priceHistoryData;
}

async function runCollection(keywordId?: number) {
  actionMessage.value = "";
  errorMessage.value = "";
  loading.value = true;
  try {
    if (keywordId) {
      const res = await api.collect({ keywordId, date: date.value });
      const logs = Array.isArray(res) ? res : [res];
      const failed = logs.find((l) => l.status === "failed");
      if (failed) {
        throw new Error(failed.errorMessage || "单关键词采集失败");
      }
    } else {
      const [res1, res2] = await Promise.all([
        api.collect({ date: date.value }),
        api.collectAllCategories({ date: date.value })
      ]);
      const logs = [...(Array.isArray(res1) ? res1 : [res1]), ...(Array.isArray(res2) ? res2 : [res2])];
      const failed = logs.find((l) => l.status === "failed");
      if (failed) {
        throw new Error(failed.errorMessage || "全量采集失败");
      }
    }
    setAction(keywordId ? "单关键词采集完成" : "全量采集完成");
    await loadCurrentView();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    loading.value = false;
  }
}

async function createKeyword() {
  if (!keywordForm.value.keyword.trim()) {
    errorMessage.value = "关键词不能为空";
    return;
  }
  const created = await api.createKeyword(keywordForm.value);
  keywordForm.value.keyword = "";
  keywordForm.value.categoryTag = "";
  selectedKeywordId.value = created.id;
  await loadKeywords();
}

async function createCategory() {
  actionMessage.value = "";
  errorMessage.value = "";
  if (!categoryForm.value.name.trim() || !categoryForm.value.categoryUrl.trim()) {
    setError("类目名称和 Best Sellers URL 必填");
    return;
  }
  try {
    const created = await api.createCategory({
      name: categoryForm.value.name,
      marketplace: categoryForm.value.marketplace,
      categoryUrl: categoryForm.value.categoryUrl,
      categoryPath: categoryForm.value.categoryPath || null,
      crawlTopN: categoryForm.value.crawlTopN,
      status: categoryForm.value.status
    });
    categoryForm.value.name = "";
    categoryForm.value.categoryUrl = "";
    categoryForm.value.categoryPath = "";
    selectedCategoryId.value = created.id;
    setAction("类目监控已保存");
    await loadCategories();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function toggleCategory(category: CategoryMonitor) {
  try {
    await api.updateCategory(category.id, {
      status: category.status === "enabled" ? "disabled" : "enabled"
    });
    await loadCategories();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function runCategoryCollection(categoryId?: number) {
  const id = categoryId ?? selectedCategoryId.value;
  if (!id) {
    setError("请先选择类目");
    return;
  }
  actionMessage.value = "";
  errorMessage.value = "";
  loading.value = true;
  try {
    const res = await api.collectCategory(id, { date: date.value });
    if (res && res.status === "failed") {
      throw new Error(res.errorMessage || "类目榜单采集失败");
    }
    setAction("类目榜单采集完成");
    await loadCategories();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    loading.value = false;
  }
}

async function toggleKeyword(keyword: KeywordMonitor) {
  try {
    await api.updateKeyword(keyword.id, {
      status: keyword.status === "enabled" ? "disabled" : "enabled"
    });
    await loadKeywords();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function toggleKeyCompetitor(item: CompetitorPoolItem) {
  try {
    await api.setKeyCompetitor(item.asin, !item.isKeyCompetitor);
    await loadCompetitors();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function selectCompetitorFolder(keywordId: number | null) {
  selectedCompetitorKeywordId.value = keywordId;
  await loadCompetitors();
}

async function openProductActivityCalendar(item: CompetitorPoolItem) {
  selectedCompetitorAsin.value = item.asin;
  productActivityCalendar.value = await api.productActivityCalendar(item.asin, {
    date: date.value,
    marketplace: item.marketplace,
    limitDays: 90
  });
}

function openAmazon(item: CompetitorPoolItem) {
  const query = selectedCompetitorKeywordId.value ? `?keywordId=${selectedCompetitorKeywordId.value}` : "";
  window.open(`/api/competitors/${encodeURIComponent(item.asin)}/open${query}`, "_blank", "noopener,noreferrer");
}

function openCategoryProduct(item: BestsellerRankSnapshot) {
  const query = selectedCategoryId.value ? `?categoryId=${selectedCategoryId.value}` : "";
  window.open(`/api/category-products/${encodeURIComponent(item.asin)}/open${query}`, "_blank", "noopener,noreferrer");
}

async function updateAlert(alert: AlertLog, status: AlertLog["status"]) {
  if (!alert.id) {
    return;
  }
  await api.updateAlertStatus(alert.id, status);
  alerts.value = await api.alerts(date.value);
}

async function createNotification() {
  actionMessage.value = "";
  errorMessage.value = "";
  try {
    await api.createNotificationSchedule({
      name: notificationForm.value.name,
      channel: notificationForm.value.channel,
      target: notificationForm.value.target,
      sendTime: notificationForm.value.sendTime,
      timezone: notificationForm.value.timezone,
      status: notificationForm.value.status
    });
    notificationForm.value.name = "";
    notificationForm.value.target = "";
    setAction("通知计划已保存");
    await loadNotifications();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function toggleNotification(schedule: NotificationSchedule) {
  await api.updateNotificationSchedule(schedule.id, {
    status: schedule.status === "enabled" ? "disabled" : "enabled"
  });
  await loadNotifications();
}

async function removeNotification(schedule: NotificationSchedule) {
  if (!confirm(`确定要删除通知计划「${schedule.name}」吗？此操作不可撤销。`)) return;
  try {
    await api.deleteNotificationSchedule(schedule.id);
    setAction("通知计划已删除");
    await loadNotifications();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function sendNotificationNow(schedule: NotificationSchedule) {
  if (sendingScheduleId.value) return;
  sendingScheduleId.value = schedule.id;
  actionMessage.value = "";
  errorMessage.value = "";
  try {
    const log = await api.sendNotificationSchedule(schedule.id, date.value);
    if (log.status === "success") {
      setAction("通知已发送");
    } else {
      setError(log.errorMessage || "通知发送失败");
    }
    await loadNotifications();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    sendingScheduleId.value = null;
  }
}

async function renderChart() {
  await nextTick();
  if (!chartEl.value || !detail.value) {
    return;
  }
  if (!chart) {
    chart = echarts.init(chartEl.value);
  }
  const items = detail.value.snapshots.slice(0, 12);
  chart.setOption({
    color: ["#4f46e5", "#f59e0b"],
    tooltip: { 
      trigger: "axis",
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      textStyle: { color: "#0f172a" },
      extraCssText: "box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);"
    },
    legend: { top: 0, right: 0, textStyle: { color: "#475569", fontFamily: "Noto Sans SC" } },
    grid: { top: 48, left: 48, right: 48, bottom: 48 },
    xAxis: {
      type: "category",
      data: items.map((item) => item.asin),
      axisLabel: { rotate: 24, color: "#475569", fontFamily: "Noto Sans SC" },
      axisLine: { lineStyle: { color: "#e2e8f0" } }
    },
    yAxis: [
      { 
        type: "value", 
        name: "价格", 
        axisLabel: { formatter: "${value}", color: "#475569", fontFamily: "Noto Sans SC" },
        splitLine: { lineStyle: { color: "#f1f5f9" } }
      },
      { 
        type: "value", 
        name: "排名", 
        inverse: true, 
        axisLabel: { color: "#475569", fontFamily: "Noto Sans SC" },
        splitLine: { show: false }
      }
    ],
    series: [
      { 
        name: "搜索页价格", 
        type: "bar", 
        data: items.map((item) => item.currentPrice ?? 0), 
        barWidth: 16,
        itemStyle: {
          borderRadius: [4, 4, 0, 0]
        }
      },
      { 
        name: "综合排名", 
        type: "line", 
        yAxisIndex: 1, 
        data: items.map((item) => item.absoluteRank), 
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 3 }
      }
    ]
  });
}

function formatMoney(value: number | null | undefined) {
  return value === null || value === undefined ? "无" : `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "无" : `${(value * 100).toFixed(1)}%`;
}

function statusText(status: string) {
  const map: Record<string, string> = {
    enabled: "启用",
    disabled: "停用",
    success: "成功",
    failed: "失败",
    pending: "待处理",
    viewed: "已查看",
    followed: "已跟进",
    ignored: "已忽略"
  };
  return map[status] ?? status;
}

function changeLabel(change: string) {
  const map: Record<string, string> = {
    new_top_100: "新进 Top100",
    new_top_50: "新进 Top50",
    new_top_20: "新进 Top20",
    dropped_top_100: "掉出 Top100",
    dropped_top_50: "掉出 Top50",
    dropped_top_20: "掉出 Top20",
    major_rank_up: "榜单大幅上升",
    major_rank_down: "榜单大幅下降",
    new_deal: "新增 Deal",
    new_product_breakout: "新品爆发",
    price_drop: "降价",
    significant_price_drop: "明显降价",
    price_rise: "涨价",
    significant_price_rise: "明显涨价",
    new_coupon: "新增 Coupon",
    coupon_disappeared: "Coupon 消失",
    coupon_strengthened: "优惠加大",
    coupon_weakened: "优惠减弱",
    new_sponsored: "新增广告",
    sponsored_disappeared: "广告消失",
    new_competitor: "新竞品",
    new_asin_entered: "新 ASIN",
    dropped_competitor: "掉出结果",
    dropped_from_results: "掉出结果",
    historical_low: "历史低价",
    entered_top_10: "进前 10",
    entered_top_20: "进前 20",
    rank_up: "排名上升",
    rank_down: "排名下降",
    new_entry: "新进榜",
    dropped: "掉出榜",
    unchanged: "无变化",
    coupon_start: "Coupon 开始",
    coupon_end: "Coupon 结束",
    coupon_increase: "Coupon 加强",
    deal_start: "Deal 开始",
    deal_end: "Deal 结束",
    rank_surge: "排名快速上升",
    new_entry_top100: "新进 Top100",
    new_entry_top50: "新进 Top50",
    brand_matrix_push: "品牌矩阵推量",
    activity_end_rank_drop: "活动后回落",
    bsr_new_entry: "BSR 新上榜",
    bsr_fast_rise: "BSR 快速上升",
    bsr_rank_drop: "BSR 明显下滑",
    bsr_dropped: "BSR 掉出榜单",
    price_drop_rank_lift: "降价带动排名",
    coupon_rank_lift: "Coupon 带动排名",
    deal_rank_lift: "Deal 带动排名",
    brand_push: "品牌矩阵推量"
  };
  return map[change] ?? change;
}

function competitorSourceLabel(source: string) {
  const map: Record<string, string> = {
    keyword: "关键词",
    category: "类目榜单",
    hybrid: "关键词+类目"
  };
  return map[source] ?? source;
}

function competitorTierLabel(tier: string) {
  const map: Record<string, string> = {
    core: "核心",
    rising: "上升",
    activity: "活动",
    watch: "观察"
  };
  return map[tier] ?? tier;
}

function bestDayPrice(day: ProductActivityCalendar["days"][number]) {
  return (
    day.priceHistory?.currentPrice ??
    day.categoryRanks.find((item) => item.price !== null)?.price ??
    day.keywordRanks.find((item) => item.price !== null)?.price ??
    null
  );
}

function specificBestsellerRank(ranks: ProductRanking[]) {
  return selectSpecificBestsellerRank(ranks);
}

watch(activeTab, () => {
  loadCurrentView().catch((error) => {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  });
});

watch(selectedKeywordId, () => {
  if (activeTab.value !== "keywords") {
    return;
  }
  loadDetail().catch((error) => {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  });
});

watch(selectedCategoryId, () => {
  if (activeTab.value !== "categories") {
    return;
  }
  loadCategoryDetail().catch((error) => {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  });
});

watch([competitorSourceFilter, competitorTierFilter], () => {
  if (activeTab.value !== "competitors") {
    return;
  }
  loadCompetitors().catch((error) => {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  });
});

watch(date, () => {
  loadCurrentView().catch((error) => {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  });
});

onMounted(() => {
  loadCurrentView().catch((error) => {
    setError(error instanceof Error ? error.message : String(error));
  });
  categoryRefreshTimer = setInterval(() => {
    if (activeTab.value !== "categories" || loading.value) {
      return;
    }
    loadCategories().catch((error) => {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    });
  }, 60_000);
  window.addEventListener("resize", () => chart?.resize());
});

onUnmounted(() => {
  if (categoryRefreshTimer) {
    clearInterval(categoryRefreshTimer);
  }
});
</script>

<template>
  <div class="toast-container">
    <div v-for="t in toasts" :key="t.id" :class="['toast', t.type, { 'fade-out': t.fadingOut }]">{{ t.message }}</div>
  </div>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <Database :size="24" />
        <div>
          <strong>Amazon Monitor</strong>
          <span>关键词竞品监控</span>
        </div>
      </div>

      <nav class="nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="{ active: activeTab === tab.key }"
          type="button"
          @click="activeTab = tab.key"
        >
          <component :is="tab.icon" :size="18" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>

      <div class="side-tools">
        <label>
          <span>日期</span>
          <input v-model="date" type="date" />
        </label>
        <button class="primary" type="button" :disabled="loading" @click="runCollection()">
          <RefreshCw v-if="loading" :size="16" class="spinning" />
          <Play v-else :size="16" />
          <span>{{ loading ? '采集中...' : '采集全部' }}</span>
        </button>
        <button type="button" :disabled="loading" @click="loadAll">
          <RefreshCw :size="16" />
          <span>刷新</span>
        </button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <p class="eyebrow">Amazon Competitive Intelligence</p>
          <h1>类目、关键词与竞品监控</h1>
        </div>
        <div class="status-line">
          <span v-if="loading" class="pill neutral">同步中</span>
          <span v-if="actionMessage" class="pill success">{{ actionMessage }}</span>
          <span v-if="errorMessage" class="pill danger">{{ errorMessage }}</span>
        </div>
      </header>

      <section v-if="activeTab === 'overview'" class="view">
        <div class="metrics">
          <article class="metric">
            <span>启用关键词</span>
            <strong>{{ summary?.activeKeywordCount ?? 0 }}</strong>
          </article>
          <article class="metric">
            <span>启用类目</span>
            <strong>{{ summary?.activeCategoryCount ?? 0 }}</strong>
          </article>
          <article class="metric">
            <span>今日快照</span>
            <strong>{{ summary?.todaySnapshotCount ?? 0 }}</strong>
          </article>
          <article class="metric">
            <span>类目榜单 ASIN</span>
            <strong>{{ summary?.categorySnapshotCount ?? 0 }}</strong>
          </article>
          <article class="metric">
            <span>竞品池</span>
            <strong>{{ summary?.competitorCount ?? 0 }}</strong>
          </article>
          <article class="metric">
            <span>类目信号</span>
            <strong>{{ summary?.categorySignalCount ?? 0 }}</strong>
          </article>
          <article class="metric hot">
            <span>高优先级告警</span>
            <strong>{{ summary?.criticalAlertCount ?? 0 }}</strong>
          </article>
        </div>

        <div class="split">
          <section class="panel">
            <div class="panel-head">
              <h2>今日告警</h2>
              <span>{{ pendingAlerts.length }} 待处理</span>
            </div>
            <div v-if="highAlerts.length" class="alert-list">
              <article v-for="alert in highAlerts.slice(0, 8)" :key="alert.id" class="alert-row">
                <AlertTriangle :size="18" />
                <div>
                  <strong>{{ changeLabel(alert.alertType) }}</strong>
                  <p>{{ alert.alertContent }}</p>
                </div>
                <button title="标记已查看" type="button" @click="updateAlert(alert, 'viewed')">
                  <CheckCircle2 :size="17" />
                </button>
              </article>
            </div>
            <div v-else class="empty-state">
              <CheckCircle2 :size="36" />
              <p>暂无高优先级告警，一切正常 ✨</p>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>关键词状态</h2>
              <span>{{ keywords.length }} 项</span>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>关键词</th>
                    <th>站点</th>
                    <th>页数</th>
                    <th>采集</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="keyword in keywords" :key="keyword.id" @click="selectedKeywordId = keyword.id; activeTab = 'keywords'">
                    <td>{{ keyword.keyword }}</td>
                    <td>{{ keyword.marketplace }}</td>
                    <td>{{ keyword.crawlPages }}</td>
                    <td>
                      <span :class="['status-dot', keyword.todayStatus]">{{ statusText(keyword.todayStatus) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section v-if="activeTab === 'categories'" class="view">
        <section class="panel dense-panel category-monitor-panel">
          <div class="panel-head">
            <h2>类目 Best Sellers 监控</h2>
            <button class="primary compact" type="button" :disabled="!selectedCategoryId || loading" @click="runCategoryCollection()">
              <Play :size="16" />
              <span>采集当前类目</span>
            </button>
          </div>
          <div class="data-date-bar">
            <span>BSR 数据：{{ categoryDataDate }}</span>
            <strong v-if="categoryDataIsFallback">当前日期暂无榜单，已沿用最近一次采集</strong>
          </div>
          <form class="category-form" @submit.prevent="createCategory">
            <input v-model="categoryForm.name" placeholder="类目名称，如 Ice Makers" />
            <input v-model="categoryForm.marketplace" placeholder="amazon.com" />
            <input v-model="categoryForm.categoryUrl" placeholder="Amazon Best Sellers 类目 URL" />
            <input v-model="categoryForm.categoryPath" placeholder="类目路径，可选" />
            <input v-model.number="categoryForm.crawlTopN" type="number" min="1" max="100" />
            <button type="submit">
              <Database :size="16" />
              <span>新增</span>
            </button>
          </form>
          <div class="table-wrap compact-scroll category-list-scroll">
            <table>
              <thead>
                <tr>
                  <th>类目</th>
                  <th>站点</th>
                  <th>范围</th>
                  <th>状态</th>
                  <th>采集</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="category in categories" :key="category.id" :class="{ selected: selectedCategoryId === category.id }">
                  <td @click="selectedCategoryId = category.id">
                    <strong>{{ category.name }}</strong>
                    <small>{{ category.categoryPath || category.categoryUrl }}</small>
                  </td>
                  <td>{{ category.marketplace }}</td>
                  <td>Top {{ category.crawlTopN }}</td>
                  <td>{{ statusText(category.status) }}</td>
                  <td>
                    <span :class="['status-dot', category.todayStatus]">{{ statusText(category.todayStatus) }}</span>
                  </td>
                  <td class="row-actions">
                    <button class="icon-button" :title="category.status === 'enabled' ? '停用' : '启用'" type="button" @click="toggleCategory(category)">
                      <RefreshCw :size="16" />
                    </button>
                    <button class="icon-button" title="采集" type="button" :disabled="loading" @click="runCategoryCollection(category.id)">
                      <Play :size="16" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="metrics">
          <article class="metric">
            <span>类目 ASIN</span>
            <strong>{{ categoryDetail?.snapshots.length ?? 0 }}</strong>
          </article>
          <article class="metric">
            <span>覆盖品牌</span>
            <strong>{{ categoryDetail?.brandMatrix.filter((item) => item.productCountTop100 > 0).length ?? 0 }}</strong>
          </article>
          <article class="metric">
            <span>今日信号</span>
            <strong>{{ categorySignals.length }}</strong>
          </article>
          <article class="metric hot">
            <span>新品爆发</span>
            <strong>{{ categorySignals.filter((item) => item.signalType === 'new_product_breakout').length }}</strong>
          </article>
        </div>

        <div class="split category-info-grid">
          <section class="panel dense-panel">
            <div class="panel-head">
              <h2>{{ selectedCategory?.name ?? '品牌矩阵' }}</h2>
              <span>{{ topBrandMatrix.length }} 个品牌</span>
            </div>
            <div class="table-wrap compact-scroll brand-scroll">
              <table>
                <thead>
                  <tr>
                    <th>品牌</th>
                    <th>Top20</th>
                    <th>Top50</th>
                    <th>Top100</th>
                    <th>最佳</th>
                    <th>新增</th>
                    <th>掉出</th>
                    <th>活动</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="brand in topBrandMatrix" :key="brand.brand">
                    <td>
                      <strong>{{ brand.brand }}</strong>
                      <small>{{ brand.topAsins.join(', ') }}</small>
                    </td>
                    <td>{{ brand.productCountTop20 }}</td>
                    <td>{{ brand.productCountTop50 }}</td>
                    <td>{{ brand.productCountTop100 }}</td>
                    <td>{{ brand.bestRank ? `#${brand.bestRank}` : '-' }}</td>
                    <td>{{ brand.newEntryCount }}</td>
                    <td>{{ brand.droppedCount }}</td>
                    <td>{{ brand.couponCount }} Coupon / {{ brand.dealCount }} Deal</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel dense-panel">
            <div class="panel-head">
              <h2>类目信号</h2>
              <span>{{ categorySignals.length }} 条</span>
            </div>
            <div class="alert-list compact-scroll signal-scroll">
              <article v-for="signal in categorySignals" :key="signal.id || `${signal.asin}-${signal.signalType}`" class="alert-row">
                <AlertTriangle :size="18" />
                <div>
                  <strong>{{ changeLabel(signal.signalType) }} · {{ signal.asin || '-' }}</strong>
                  <p>{{ signal.content }}</p>
                </div>
                <span :class="['level', signal.alertLevel]">{{ signal.alertLevel }}</span>
              </article>
            </div>
          </section>
        </div>

        <section class="panel dense-panel bsr-board-panel">
          <div class="panel-head">
            <h2>Best Sellers 榜单</h2>
            <span>{{ categoryDataDate }} · {{ topCategorySnapshots.length }} / {{ categoryDetail?.snapshots.length ?? 0 }} ASIN</span>
          </div>
          <div class="panel-controls">
            <input v-model.trim="categoryProductQuery" placeholder="筛选 ASIN / 标题 / 品牌" />
            <select v-model="categoryBrandFilter">
              <option value="all">全部品牌</option>
              <option v-for="brand in categoryBrandOptions" :key="brand" :value="brand">{{ brand }}</option>
            </select>
            <select v-model="categoryRankWindow">
              <option value="top100">Top100</option>
              <option value="top50">Top50</option>
              <option value="top20">Top20</option>
              <option value="all">全部</option>
            </select>
          </div>
          <div class="table-wrap compact-scroll bsr-board-scroll">
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <th>商品</th>
                  <th>品牌</th>
                  <th class="price-col">价格</th>
                  <th class="promo-col">促销</th>
                  <th class="rating-col">评分</th>
                  <th class="link-col">外链</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in topCategorySnapshots" :key="item.asin">
                  <td><strong>#{{ item.rank }}</strong></td>
                  <td class="product-cell">
                    <img :src="item.imageUrl" :alt="item.title" @error="imgFallback" />
                    <div>
                      <strong>{{ item.asin }}</strong>
                      <span>{{ item.title }}</span>
                    </div>
                  </td>
                  <td>{{ item.brand || 'Unknown' }}</td>
                  <td class="price-col">{{ formatMoney(item.currentPrice) }}</td>
                  <td class="promo-col" :title="item.couponText || item.dealBadge || ''">{{ item.couponText || item.dealBadge || '-' }}</td>
                  <td class="rating-col">{{ item.rating || '-' }} / {{ item.reviewCount || 0 }}</td>
                  <td class="link-col">
                    <button class="icon-button" title="打开 Amazon" type="button" @click="openCategoryProduct(item)">
                      <ExternalLink :size="17" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel dense-panel">
          <div class="panel-head">
            <h2>BSR 采集质量</h2>
            <span>{{ badBsrQuality.length ? `${badBsrQuality.length} 个异常` : '质量正常' }}</span>
          </div>
          <div class="table-wrap compact-scroll bsr-small-scroll">
            <table>
              <thead>
                <tr>
                  <th>状态</th>
                  <th>类目</th>
                  <th>数量</th>
                  <th>唯一排名</th>
                  <th>排名范围</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in bsrQuality" :key="`${item.sourceType}-${item.sourceId}-${item.category}`">
                  <td><span :class="['level', item.qualityStatus]">{{ item.qualityStatus }}</span></td>
                  <td>{{ item.category }}</td>
                  <td>{{ item.actualCount }} / {{ item.expectedCount || '-' }}</td>
                  <td>{{ item.uniqueRankCount }} / {{ item.expectedCount || '-' }}</td>
                  <td>#{{ item.minRank || '-' }} - #{{ item.maxRank || '-' }}</td>
                  <td class="target-cell">{{ item.issue || '可用于动作洞察' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel dense-panel">
          <div class="panel-head">
            <h2>BSR 榜单异动</h2>
            <span>{{ bsrRankChanges.length }} 条</span>
          </div>
          <div class="table-wrap compact-scroll bsr-change-scroll">
            <table>
              <thead>
                <tr>
                  <th>异动</th>
                  <th>类目</th>
                  <th>ASIN</th>
                  <th>商品</th>
                  <th>当前排名</th>
                  <th>昨日排名</th>
                  <th>变化</th>
                  <th>外链</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in bsrRankChanges" :key="`${item.sourceType}-${item.category}-${item.asin}-${item.changeType}`">
                  <td>{{ changeLabel(item.changeType) }}</td>
                  <td>{{ item.category }}</td>
                  <td><strong>{{ item.asin }}</strong></td>
                  <td class="target-cell">{{ item.title }}</td>
                  <td>{{ item.currentRank ? `#${item.currentRank}` : '-' }}</td>
                  <td>{{ item.previousRank ? `#${item.previousRank}` : '-' }}</td>
                  <td>{{ item.rankChange === null ? '-' : item.rankChange > 0 ? `+${item.rankChange}` : item.rankChange }}</td>
                  <td>
                    <a v-if="item.productUrl" :href="item.productUrl" target="_blank" rel="noreferrer">
                      <ExternalLink :size="16" />
                    </a>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel dense-panel">
          <div class="panel-head">
            <h2>BSR 动作洞察</h2>
            <span>{{ visibleActionInsights.length }} 条</span>
          </div>
          <div class="table-wrap compact-scroll insight-scroll">
            <table>
              <thead>
                <tr>
                  <th>置信度</th>
                  <th>证据日期</th>
                  <th>动作</th>
                  <th>对象</th>
                  <th>排名路径</th>
                  <th>证据</th>
                  <th>系统判断</th>
                  <th>建议动作</th>
                  <th>外链</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleActionInsights" :key="`${item.sourceType}-${item.category}-${item.asin || item.brand}-${item.insightType}`">
                  <td><span :class="['level', item.confidence]">{{ item.confidence }}</span></td>
                  <td>{{ item.previousDate ? `${item.previousDate} → ${item.insightDate}` : item.insightDate }}</td>
                  <td>{{ changeLabel(item.insightType) }}</td>
                  <td>
                    <strong>{{ item.asin || item.brand || '-' }}</strong>
                    <small>{{ item.title || item.category }}</small>
                  </td>
                  <td>{{ item.previousRank ? `#${item.previousRank}` : '-' }} → {{ item.currentRank ? `#${item.currentRank}` : '-' }}</td>
                  <td class="target-cell">{{ item.evidence }}</td>
                  <td class="target-cell">{{ item.inferredAction }}</td>
                  <td class="target-cell">{{ item.suggestedResponse }}</td>
                  <td>
                    <a v-if="item.productUrl" :href="item.productUrl" target="_blank" rel="noreferrer">
                      <ExternalLink :size="16" />
                    </a>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>活动事件</h2>
            <span>{{ filteredActivityEvents.length }} / {{ activityEvents.length }} 条</span>
          </div>
          <div class="panel-controls">
            <select v-model="activityEventFilter">
              <option value="all">全部事件</option>
              <option v-for="option in activityEventOptions" :key="option.eventType" :value="option.eventType">{{ option.label }}</option>
            </select>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>事件</th>
                  <th>级别</th>
                  <th>对象</th>
                  <th>排名</th>
                  <th>价格</th>
                  <th>系统判断</th>
                  <th>建议动作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in filteredActivityEvents.slice(0, 100)" :key="item.eventKey">
                  <td>{{ changeLabel(item.eventType) }}</td>
                  <td><span :class="['level', item.eventLevel]">{{ item.eventLevel }}</span></td>
                  <td>
                    <strong>{{ item.asin || item.brand || '-' }}</strong>
                    <small>{{ item.title || item.eventSummary }}</small>
                  </td>
                  <td>{{ item.rankBefore ? `#${item.rankBefore}` : '-' }} → {{ item.rankAfter ? `#${item.rankAfter}` : '-' }}</td>
                  <td>{{ formatMoney(item.priceBefore) }} → {{ formatMoney(item.priceAfter) }}</td>
                  <td class="target-cell">{{ item.possibleStrategy }}</td>
                  <td class="target-cell">{{ item.suggestedAction }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>价格历史窗口</h2>
            <span>{{ priceHistory.length }} 条</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ASIN</th>
                  <th>品牌</th>
                  <th>当前价</th>
                  <th>T30 最低</th>
                  <th>T60 最低</th>
                  <th>T90 最低</th>
                  <th>监控以来最低</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in priceHistory.slice(0, 80)" :key="`${item.categoryId}-${item.asin}`">
                  <td><strong>{{ item.asin }}</strong></td>
                  <td>{{ item.brand || 'Unknown' }}</td>
                  <td>{{ formatMoney(item.currentPrice) }}</td>
                  <td>{{ formatMoney(item.t30LowPrice) }}</td>
                  <td>{{ formatMoney(item.t60LowPrice) }}</td>
                  <td>{{ formatMoney(item.t90LowPrice) }}</td>
                  <td>{{ formatMoney(item.monitoringLowPrice) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section v-if="activeTab === 'keywords'" class="view">
        <section class="panel">
          <div class="panel-head">
            <h2>关键词管理</h2>
            <button class="primary compact" type="button" :disabled="!selectedKeywordId || loading" @click="runCollection(selectedKeywordId ?? undefined)">
              <Play :size="16" />
              <span>采集当前</span>
            </button>
          </div>
          <form class="keyword-form" @submit.prevent="createKeyword">
            <input v-model="keywordForm.keyword" placeholder="关键词" />
            <input v-model="keywordForm.marketplace" placeholder="amazon.com" />
            <input v-model="keywordForm.zipCode" placeholder="邮编" />
            <input v-model="keywordForm.categoryTag" placeholder="分类" />
            <input v-model.number="keywordForm.crawlPages" type="number" min="1" max="10" />
            <button type="submit">
              <Search :size="16" />
              <span>新增</span>
            </button>
          </form>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>关键词</th>
                  <th>站点</th>
                  <th>邮编</th>
                  <th>分类</th>
                  <th>页数</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="keyword in keywords" :key="keyword.id" :class="{ selected: selectedKeywordId === keyword.id }">
                  <td @click="selectedKeywordId = keyword.id">{{ keyword.keyword }}</td>
                  <td>{{ keyword.marketplace }}</td>
                  <td>{{ keyword.zipCode }}</td>
                  <td>{{ keyword.categoryTag || '未分组' }}</td>
                  <td>{{ keyword.crawlPages }}</td>
                  <td>{{ statusText(keyword.status) }}</td>
                  <td>
                    <button class="icon-button" :title="keyword.status === 'enabled' ? '停用' : '启用'" type="button" @click="toggleKeyword(keyword)">
                      <RefreshCw :size="16" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>{{ selectedKeyword?.keyword ?? '关键词详情' }}</h2>
            <span>{{ topSnapshots.length }} 个商品</span>
          </div>
          <div ref="chartEl" class="chart"></div>
          <div class="product-grid">
            <article v-for="item in topSnapshots" :key="item.asin" class="product-row">
              <img :src="item.imageUrl" :alt="item.title" @error="imgFallback" />
              <div>
                <strong>{{ item.asin }}</strong>
                <p>{{ item.title }}</p>
                <span>{{ item.brand || 'Unknown' }}</span>
              </div>
              <div class="rank-box">
                <strong>#{{ item.absoluteRank }}</strong>
                <span>{{ item.isSponsored ? 'Sponsored' : 'Organic' }}</span>
              </div>
              <div class="price-box">
                <strong>{{ formatMoney(item.currentPrice) }}</strong>
                <span>{{ item.couponText || item.dealBadge || '常规价' }}</span>
              </div>
            </article>
          </div>
        </section>
      </section>

      <section v-if="activeTab === 'competitors'" class="view">
        <section class="panel">
          <div class="panel-head">
            <h2>竞品池</h2>
            <span>{{ visibleCompetitors.length }} / {{ competitors.length }} 个 ASIN</span>
          </div>
          <div class="panel-controls competitor-controls">
            <input v-model.trim="competitorQuery" placeholder="筛选 ASIN / 标题 / 品牌 / 原因" />
            <select v-model="competitorSourceFilter">
              <option value="all">全部来源</option>
              <option value="category">类目榜单</option>
              <option value="keyword">关键词</option>
              <option value="hybrid">关键词+类目</option>
            </select>
            <select v-model="competitorTierFilter">
              <option value="all">全部分层</option>
              <option value="core">核心</option>
              <option value="rising">上升</option>
              <option value="activity">活动</option>
              <option value="watch">观察</option>
            </select>
          </div>
          <div class="folder-strip">
            <button :class="{ active: selectedCompetitorKeywordId === null }" type="button" @click="selectCompetitorFolder(null)">
              <FolderOpen :size="16" />
              <span>全部关键词</span>
            </button>
            <button
              v-for="folder in competitorFolders"
              :key="folder.keywordId"
              :class="{ active: selectedCompetitorKeywordId === folder.keywordId }"
              type="button"
              @click="selectCompetitorFolder(folder.keywordId)"
            >
              <FolderOpen :size="16" />
              <span>{{ folder.keyword }}</span>
              <strong>{{ folder.competitorCount }}</strong>
            </button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>品牌</th>
                  <th>来源</th>
                  <th>分层</th>
                  <th>类目排名</th>
                  <th>最新价</th>
                  <th>历史低价</th>
                  <th>关键词排名</th>
                  <th>BSR</th>
                  <th>原因</th>
                  <th>重点</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in visibleCompetitors" :key="item.asin" :class="{ selected: selectedCompetitorAsin === item.asin }">
                  <td class="product-cell">
                    <img :src="item.imageUrl" :alt="item.title" @error="imgFallback" />
                    <div>
                      <strong>{{ item.asin }}</strong>
                      <span>{{ item.title }}</span>
                    </div>
                  </td>
                  <td>{{ item.brand || 'Unknown' }}</td>
                  <td>{{ competitorSourceLabel(item.sourceType) }}</td>
                  <td><span :class="['tier-pill', item.competitorTier]">{{ competitorTierLabel(item.competitorTier) }}</span></td>
                  <td>{{ item.latestCategoryRank ? `#${item.latestCategoryRank}` : '-' }}<small>{{ item.latestCategoryName || '' }}</small></td>
                  <td>{{ formatMoney(item.latestPrice) }}</td>
                  <td>{{ formatMoney(item.lowestPrice) }}</td>
                  <td>{{ item.latestRank ? `#${item.latestRank}` : '-' }}<small>{{ item.appearKeywordCount }} 词</small></td>
                  <td>
                    <strong v-if="item.latestBsrRank">#{{ item.latestBsrRank }}</strong>
                    <span v-else>-</span>
                    <small>{{ item.latestBsrCategory || '' }}</small>
                  </td>
                  <td class="target-cell">{{ item.competitorReasons.slice(0, 2).join('；') || '-' }}</td>
                  <td>
                    <button class="icon-button" title="重点竞品" type="button" @click="toggleKeyCompetitor(item)">
                      <Star v-if="item.isKeyCompetitor" :size="17" />
                      <StarOff v-else :size="17" />
                    </button>
                  </td>
                  <td class="row-actions">
                    <button class="icon-button" title="活动日历" type="button" @click="openProductActivityCalendar(item)">
                      <CalendarDays :size="17" />
                    </button>
                    <button class="icon-button" title="打开 Amazon" type="button" @click="openAmazon(item)">
                      <ExternalLink :size="17" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="productActivityCalendar" class="panel">
          <div class="panel-head">
            <h2>{{ productActivityCalendar.asin }} 活动日历</h2>
            <span>{{ productActivityCalendar.summary.activeDays }} 天 · {{ productActivityCalendar.summary.eventCount }} 个事件</span>
          </div>
          <div class="calendar-summary">
            <article>
              <span>最佳类目排名</span>
              <strong>{{ productActivityCalendar.summary.bestCategoryRank ? `#${productActivityCalendar.summary.bestCategoryRank}` : '-' }}</strong>
            </article>
            <article>
              <span>最新类目排名</span>
              <strong>{{ productActivityCalendar.summary.latestCategoryRank ? `#${productActivityCalendar.summary.latestCategoryRank}` : '-' }}</strong>
            </article>
            <article>
              <span>最佳关键词排名</span>
              <strong>{{ productActivityCalendar.summary.bestKeywordRank ? `#${productActivityCalendar.summary.bestKeywordRank}` : '-' }}</strong>
            </article>
            <article>
              <span>价格区间</span>
              <strong>{{ formatMoney(productActivityCalendar.summary.priceLow) }} - {{ formatMoney(productActivityCalendar.summary.priceHigh) }}</strong>
            </article>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>类目排名</th>
                  <th>关键词排名</th>
                  <th>价格</th>
                  <th>Coupon / Deal</th>
                  <th>活动事件</th>
                  <th>BSR</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in productActivityCalendar.days" :key="day.date">
                  <td>{{ day.date }}</td>
                  <td>
                    <span v-if="day.categoryRanks.length">#{{ day.categoryRanks[0].rank }} {{ day.categoryRanks[0].categoryName }}</span>
                    <span v-else>-</span>
                  </td>
                  <td>
                    <span v-if="day.keywordRanks.length">#{{ day.keywordRanks[0].absoluteRank }} {{ day.keywordRanks[0].keyword }}</span>
                    <span v-else>-</span>
                  </td>
                  <td>{{ formatMoney(bestDayPrice(day)) }}</td>
                  <td>{{ day.categoryRanks[0]?.couponText || day.keywordRanks[0]?.couponText || day.categoryRanks[0]?.dealBadge || day.keywordRanks[0]?.dealBadge || '-' }}</td>
                  <td class="target-cell">
                    {{ [...day.actionInsights.map((insight) => changeLabel(insight.insightType)), ...day.events.map((event) => changeLabel(event.eventType)), ...day.categorySignals.map((signal) => changeLabel(signal.signalType)), ...day.keywordChanges.map((change) => changeLabel(change.changeType))].slice(0, 4).join('；') || '-' }}
                  </td>
                  <td>
                    <span v-if="day.bsrRanks.length">#{{ day.bsrRanks[0].rank }} {{ day.bsrRanks[0].category }}</span>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section v-if="activeTab === 'alerts'" class="view panel">
        <div class="panel-head">
          <h2>告警中心</h2>
          <span>{{ alerts.length }} 条</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>级别</th>
                <th>类型</th>
                <th>关键词</th>
                <th>ASIN</th>
                <th>内容</th>
                <th>状态</th>
                <th>处理</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="alert in alerts" :key="alert.id">
                <td><span :class="['level', alert.alertLevel]">{{ alert.alertLevel }}</span></td>
                <td>{{ changeLabel(alert.alertType) }}</td>
                <td>{{ alert.keyword }}</td>
                <td>{{ alert.asin }}</td>
                <td>{{ alert.alertContent }}</td>
                <td>{{ statusText(alert.status) }}</td>
                <td class="row-actions">
                  <button title="已查看" type="button" @click="updateAlert(alert, 'viewed')"><CheckCircle2 :size="16" /></button>
                  <button title="已跟进" type="button" @click="updateAlert(alert, 'followed')"><ClipboardList :size="16" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'reports'" class="view panel">
        <div class="panel-head">
          <h2>每日监控日报</h2>
          <span>{{ report?.date }}</span>
        </div>
        <pre class="report">{{ [categoryReport?.markdown, report?.markdown].filter(Boolean).join('\n\n---\n\n') || '暂无日报' }}</pre>
      </section>

      <section v-if="activeTab === 'notifications'" class="view">
        <div class="smtp-banner">
          <div class="smtp-icon">i</div>
          <div>
            <h3>📬 邮件推送 & 定时任务配置说明</h3>
            <p>
              你可以在下方设置每日定时推送任务。邮件通道采用 <strong>SMTP 传输协议</strong> 以实现极高可靠性的真实邮件发送。要确保定时推送成功，请在服务端的环境变量（或 <code>.env</code> 文件）中配置以下信息：
            </p>
            <div class="smtp-vars">
              <div>• SMTP_HOST (如 smtp.qq.com)</div>
              <div>• SMTP_PORT (如 465 或 587)</div>
              <div>• SMTP_USER (发件箱邮箱地址)</div>
              <div>• SMTP_PASS (客户端授权密码)</div>
              <div>• SMTP_FROM (发件人显示地址)</div>
            </div>
            <p class="smtp-highlight">
              🌟 邮件已升级为精美的自适应整合数据表格，包含 ASIN、缩略图、商品标题、分类 BSR 排名、综合排名及 Amazon 官方直达外链！
            </p>
          </div>
        </div>

        <section class="panel">
          <div class="panel-head">
            <h2>通知计划</h2>
            <span>{{ notificationSchedules.length }} 个计划</span>
          </div>
          <form class="notification-form" @submit.prevent="createNotification">
            <input v-model="notificationForm.name" placeholder="计划名称" />
            <select v-model="notificationForm.channel">
              <option value="email">邮箱</option>
              <option value="feishu">飞书</option>
            </select>
            <input v-model="notificationForm.target" :placeholder="notificationForm.channel === 'email' ? 'ops@example.com' : 'https://open.feishu.cn/open-apis/bot/v2/hook/...'" />
            <input v-model="notificationForm.sendTime" type="time" />
            <select v-model="notificationForm.status">
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
            <button type="submit" class="primary">
              <Send :size="16" />
              <span>保存</span>
            </button>
          </form>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>计划</th>
                  <th>渠道</th>
                  <th>目标</th>
                  <th>发送时间</th>
                  <th>状态</th>
                  <th>上次发送</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in notificationSchedules" :key="item.id">
                  <td>{{ item.name }}</td>
                  <td>
                    <span class="channel-label">
                      <Mail v-if="item.channel === 'email'" :size="15" />
                      <MessageSquare v-else :size="15" />
                      {{ item.channel === 'email' ? '邮箱' : '飞书' }}
                    </span>
                  </td>
                  <td class="target-cell">{{ item.target }}</td>
                  <td>{{ item.sendTime }} {{ item.timezone }}</td>
                  <td>{{ item.status === 'enabled' ? '启用' : '停用' }}</td>
                  <td>
                    <strong>{{ item.lastStatus || '-' }}</strong>
                    <small>{{ item.lastSentAt || item.lastError || '' }}</small>
                  </td>
                  <td class="row-actions">
                    <button title="立即发送" type="button" :disabled="sendingScheduleId === item.id" @click="sendNotificationNow(item)">
                      <RefreshCw v-if="sendingScheduleId === item.id" :size="16" class="spinning" />
                      <Send v-else :size="16" />
                    </button>
                    <button title="启停" type="button" @click="toggleNotification(item)">
                      <RefreshCw :size="16" />
                    </button>
                    <button title="删除" type="button" @click="removeNotification(item)">×</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>发送日志</h2>
            <span>{{ notificationLogs.length }} 条</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>计划</th>
                  <th>渠道</th>
                  <th>日期</th>
                  <th>状态</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in notificationLogs" :key="log.id">
                  <td>{{ log.sentAt.slice(0, 19).replace('T', ' ') }}</td>
                  <td>{{ log.scheduleName }}</td>
                  <td>{{ log.channel === 'email' ? '邮箱' : '飞书' }}</td>
                  <td>{{ log.reportDate }}</td>
                  <td>{{ log.status }}</td>
                  <td>{{ log.message || log.errorMessage || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section v-if="activeTab === 'logs'" class="view panel">
        <div class="panel-head">
          <h2>采集任务日志</h2>
          <span>{{ logs.length }} 条</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>关键词</th>
                <th>状态</th>
                <th>页数</th>
                <th>成功</th>
                <th>失败</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id">
                <td>{{ log.startTime.slice(0, 19).replace('T', ' ') }}</td>
                <td>{{ log.keyword }}</td>
                <td>{{ statusText(log.status) }}</td>
                <td>{{ log.pageCount }}</td>
                <td>{{ log.successCount }}</td>
                <td>{{ log.failCount }}</td>
                <td>{{ log.errorMessage || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="changes.length && activeTab === 'overview'" class="view panel">
        <div class="panel-head">
          <h2>变化明细</h2>
          <span>{{ changes.length }} 条</span>
        </div>
        <div class="change-strip">
          <span v-for="change in changes.slice(0, 24)" :key="`${change.asin}-${change.changeType}`">
            {{ changeLabel(change.changeType) }} · {{ change.asin }} · {{ formatPercent(change.priceChangeRate) }}
          </span>
        </div>
      </section>
    </main>
  </div>
</template>
