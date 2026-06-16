import type { Ref } from "vue";
import type { CategoryMonitor } from "@amazon-monitor/shared";
import { categoryApi } from "../api-categories";
import { collectApi } from "../api-collect";
import { dashboardApi } from "../api-dashboard";
import type { CategoryReportResponse } from "../api-types";
import { toErrorMessage } from "../utils/error-message";
import { runErrorHandledTask } from "../utils/run-error-handled-task";
import { waitForCollectJobs } from "./collect-jobs";

interface CategoryIntelligenceStore {
  selectedCategoryId: number | null;
  categoryDataDate: string;
  loadCategories(date: string): Promise<void>;
  loadCategoryDetail(date: string): Promise<void>;
  createCategory(date: string): Promise<void>;
  toggleCategory(category: CategoryMonitor, date: string): Promise<void>;
}

interface UseCategoryIntelligenceActionsOptions {
  store: CategoryIntelligenceStore;
  date: Ref<string>;
  collecting: Ref<boolean>;
  categoryReport: Ref<CategoryReportResponse | null>;
  setAction(message: string): void;
  setError(message: string): void;
}

export function useCategoryIntelligenceActions(options: UseCategoryIntelligenceActionsOptions) {
  async function syncReport() {
    if (options.store.selectedCategoryId) {
      options.categoryReport.value = await dashboardApi.categoryReport(options.store.categoryDataDate, options.store.selectedCategoryId);
    } else {
      options.categoryReport.value = null;
    }
  }

  async function loadCategories() {
    await options.store.loadCategories(options.date.value);
    await syncReport();
  }

  async function loadCategoryDetail() {
    await options.store.loadCategoryDetail(options.date.value);
    await syncReport();
  }

  async function createCategory() {
    await runErrorHandledTask(options.setError, async () => {
      await options.store.createCategory(options.date.value);
      options.setAction("类目监控已保存");
      await syncReport();
    });
  }

  async function toggleCategory(category: CategoryMonitor) {
    await runErrorHandledTask(options.setError, async () => {
      await options.store.toggleCategory(category, options.date.value);
    });
  }

  async function runCategoryCollection(categoryId?: number) {
    const id = categoryId ?? options.store.selectedCategoryId;
    if (!id) {
      options.setError("请先选择类目");
      return;
    }

    options.collecting.value = true;
    const t0 = Date.now();

    try {
      const job = await categoryApi.collectCategory(id, { date: options.date.value });
      await waitForCollectJobs([job], {
        getJobStatus: (jobId) => collectApi.collectJob(jobId)
      });
      await options.store.loadCategories(options.date.value);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      options.setAction(`类目榜单采集已完成 (耗时 ${elapsed}s)`);
    } catch (error) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      options.setError(`${toErrorMessage(error)} (耗时 ${elapsed}s)`);
    } finally {
      options.collecting.value = false;
    }
  }

  return {
    loadCategories,
    loadCategoryDetail,
    createCategory,
    toggleCategory,
    runCategoryCollection
  };
}
