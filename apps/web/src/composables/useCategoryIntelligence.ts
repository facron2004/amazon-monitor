import { type Ref } from "vue";
import type { CategoryReportResponse } from "../api-types";
import { useCategoryStore } from "../stores/category";
import { useCategoryIntelligenceActions } from "./useCategoryIntelligenceActions";

interface UseCategoryIntelligenceOptions {
  date: Ref<string>;
  collecting: Ref<boolean>;
  categoryReport: Ref<CategoryReportResponse | null>;
  setAction(message: string): void;
  setError(message: string): void;
  refreshCollectionStatus(): Promise<void>;
}

export function useCategoryIntelligence(options: UseCategoryIntelligenceOptions) {
  const store = useCategoryStore();

  const {
    loadCategories,
    loadCategoryDetail,
    createCategory,
    toggleCategory,
    runCategoryCollection
  } = useCategoryIntelligenceActions({
    store,
    date: options.date,
    collecting: options.collecting,
    categoryReport: options.categoryReport,
    setAction: options.setAction,
    setError: options.setError,
    refreshCollectionStatus: options.refreshCollectionStatus
  });

  return {
    loadCategories,
    loadCategoryDetail,
    createCategory,
    toggleCategory,
    runCategoryCollection
  };
}
