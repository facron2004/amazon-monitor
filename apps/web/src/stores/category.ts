import { defineStore } from "pinia";
import type {
  BsrRankChange,
  BsrSnapshotQuality,
  CategoryMonitor,
  CategorySignalLog,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { categoryApi } from "../api-categories";
import type { CategoryDetail } from "../api-types";
import type { ActivityEventFilter } from "../types/category-activity";
import type { CategoryMonitorForm } from "../types/category-monitor";
import { loadCategoryDetailBundle, resolveCategoryDataDate } from "./category-data";
import {
  getActivityEventOptions,
  getBadBsrQuality,
  getCategoryBrandOptions,
  getFilteredActivityEvents,
  getReviewGrowthEvents,
  getTopCategorySnapshots
} from "./category-selectors";

export type CategoryRankWindow = "all" | "top20" | "top50" | "top100";

export const useCategoryStore = defineStore("category", {
  state: () => ({
    categories: [] as CategoryMonitor[],
    categorySignals: [] as CategorySignalLog[],
    bsrRankChanges: [] as BsrRankChange[],
    bsrQuality: [] as BsrSnapshotQuality[],
    actionInsights: [] as CompetitorActionInsight[],
    activityEvents: [] as CompetitorActivityEvent[],
    priceHistory: [] as ProductPriceHistory[],
    categoryProductQuery: "",
    categoryBrandFilter: "all",
    categoryRankWindow: "top100" as CategoryRankWindow,
    activityEventFilter: "all" as ActivityEventFilter,
    categoryDataDate: "",
    categoryDetail: null as CategoryDetail | null,
    selectedCategoryId: null as number | null,
    categoryForm: {
      name: "",
      marketplace: "amazon.com",
      categoryUrl: "",
      categoryPath: "",
      crawlTopN: 100,
      status: "enabled" as "enabled" | "disabled"
    } as CategoryMonitorForm
  }),
  getters: {
    selectedCategory: (state) => state.categories.find((item) => item.id === state.selectedCategoryId) ?? null,
    categoryBrandOptions: (state) => getCategoryBrandOptions(state.categoryDetail),
    topCategorySnapshots: (state) =>
      getTopCategorySnapshots({
        categoryDetail: state.categoryDetail,
        categoryProductQuery: state.categoryProductQuery,
        categoryBrandFilter: state.categoryBrandFilter,
        categoryRankWindow: state.categoryRankWindow
      }),
    filteredActivityEvents: (state) => getFilteredActivityEvents(state.activityEvents, state.activityEventFilter),
    reviewGrowthEvents: (state) => getReviewGrowthEvents(state.activityEvents),
    reviewGrowthAsinCount(): number {
      return this.reviewGrowthEvents.length;
    },
    totalReviewGrowth(): number {
      return this.reviewGrowthEvents.reduce((sum, item) => sum + (item.reviewCountChange ?? 0), 0);
    },
    maxReviewGrowth(): CompetitorActivityEvent | null {
      return this.reviewGrowthEvents[0] ?? null;
    },
    badBsrQuality: (state) => getBadBsrQuality(state.bsrQuality),
    visibleActionInsights: (state) => state.actionInsights,
    activityEventOptions: (state) => getActivityEventOptions(state.activityEvents),
    topBrandMatrix: (state) => state.categoryDetail?.brandMatrix ?? []
  },
  actions: {
    async loadCategories(date: string) {
      const categoryData = await categoryApi.categories();
      this.categories = categoryData;
      if (!this.selectedCategoryId && categoryData[0]) {
        this.selectedCategoryId = categoryData[0].id;
      }
      await this.loadCategoryDetail(date);
    },
    async loadCategoryDetail(date: string) {
      const dataDate = await resolveCategoryDataDate(this.selectedCategoryId, date);
      this.categoryDataDate = dataDate;
      const bundle = await loadCategoryDetailBundle(this.selectedCategoryId, date, dataDate);
      this.categoryDetail = bundle.categoryDetail;
      this.categorySignals = bundle.categorySignals;
      this.bsrQuality = bundle.bsrQuality;
      this.bsrRankChanges = bundle.bsrRankChanges;
      this.actionInsights = bundle.actionInsights;
      this.activityEvents = bundle.activityEvents;
      this.priceHistory = bundle.priceHistory;
    },
    async createCategory(date: string) {
      if (!this.categoryForm.name.trim() || !this.categoryForm.categoryUrl.trim()) {
        throw new Error("类目名称和畅销榜链接必填");
      }
      const created = await categoryApi.createCategory({
        name: this.categoryForm.name,
        marketplace: this.categoryForm.marketplace,
        categoryUrl: this.categoryForm.categoryUrl,
        categoryPath: this.categoryForm.categoryPath || null,
        crawlTopN: this.categoryForm.crawlTopN,
        status: this.categoryForm.status
      });
      this.categoryForm.name = "";
      this.categoryForm.categoryUrl = "";
      this.categoryForm.categoryPath = "";
      this.selectedCategoryId = created.id;
      await this.loadCategories(date);
    },
    async toggleCategory(category: CategoryMonitor, date: string) {
      await categoryApi.updateCategory(category.id, {
        status: category.status === "enabled" ? "disabled" : "enabled"
      });
      await this.loadCategories(date);
    }
  }
});
