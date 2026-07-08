import type { Ref } from "vue";
import { storeToRefs } from "pinia";
import type { CollectJob, KeywordMonitor } from "@amazon-monitor/shared";
import { collectApi } from "../api-collect";
import { keywordApi } from "../api-keywords";
import type { KeywordDetail } from "../api-types";
import { toErrorMessage } from "../utils/error-message";
import { runErrorHandledTask } from "../utils/run-error-handled-task";
import { waitForCollectJobs } from "./collect-jobs";
import { useKeywordStore } from "../stores/keyword";

interface UseKeywordsOptions {
  date: Ref<string>;
  collecting: Ref<boolean>;
  setAction(message: string): void;
  setError(message: string): void;
  renderKeywordChart(snapshots: KeywordDetail["snapshots"]): Promise<void>;
  loadCurrentView(): Promise<void>;
  collectAllCategories(): Promise<CollectJob[]>;
  refreshCollectionStatus(): Promise<void>;
}

export function useKeywords(options: UseKeywordsOptions) {
  const store = useKeywordStore();
  const { keywords, selectedKeywordId, selectedKeyword, topSnapshots, keywordForm } = storeToRefs(store);

  async function loadKeywords() {
    await store.loadKeywords(options.date.value, options.renderKeywordChart);
  }

  function setKeywords(keywordData: KeywordMonitor[]) {
    store.setKeywords(keywordData);
  }

  async function loadDetail() {
    await store.loadDetail(options.date.value, options.renderKeywordChart);
  }

  async function renderCurrentKeywordChart() {
    await loadDetail();
  }

  async function runCollection(keywordId?: number) {
    options.collecting.value = true;
    const t0 = Date.now();

    try {
      if (keywordId) {
        const job = await keywordApi.collect({ keywordId, date: options.date.value });
        const queuedJob = Array.isArray(job) ? job[0] : job;
        await options.refreshCollectionStatus();

        await waitForCollectJobs([queuedJob], {
          getJobStatus: (jobId) => collectApi.collectJob(jobId),
          onPoll: options.refreshCollectionStatus
        });

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        options.setAction(`单关键词采集已完成 (耗时 ${elapsed}s)`);
      } else {
        await Promise.all([
          keywordApi.collect({ date: options.date.value }),
          options.collectAllCategories()
        ]);
        await options.refreshCollectionStatus();

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        options.setAction(`全量采集已进入队列 (${elapsed}s)`);
      }

      await options.loadCurrentView();
    } catch (error) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      options.setError(`${toErrorMessage(error)} (耗时 ${elapsed}s)`);
    } finally {
      options.collecting.value = false;
    }
  }

  async function createKeyword() {
    await runErrorHandledTask(options.setError, async () => {
      await store.createKeyword(options.date.value);
    });
  }

  async function toggleKeyword(keyword: KeywordMonitor) {
    await runErrorHandledTask(options.setError, async () => {
      await store.toggleKeyword(keyword, options.date.value);
    });
  }

  async function deleteKeyword(keywordId: number) {
    await runErrorHandledTask(options.setError, async () => {
      await store.deleteKeyword(keywordId, options.date.value);
      options.setAction("关键词已删除");
    });
  }

  return {
    keywords,
    selectedKeywordId,
    keywordForm,
    selectedKeyword,
    topSnapshots,
    loadKeywords,
    setKeywords,
    loadDetail,
    renderCurrentKeywordChart,
    runCollection,
    createKeyword,
    toggleKeyword,
    deleteKeyword
  };
}
