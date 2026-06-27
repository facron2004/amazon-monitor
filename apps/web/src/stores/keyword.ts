import { defineStore } from "pinia";
import type { KeywordMonitor } from "@amazon-monitor/shared";
import { keywordApi } from "../api-keywords";
import type { KeywordDetail } from "../api-types";
import type { KeywordMonitorForm } from "../types/keyword-monitor";

export const useKeywordStore = defineStore("keyword", {
  state: () => ({
    keywords: [] as KeywordMonitor[],
    detail: null as KeywordDetail | null,
    selectedKeywordId: null as number | null,
    keywordForm: {
      keyword: "",
      marketplace: "amazon.com",
      zipCode: "97201",
      language: "en_US",
      categoryTag: "",
      crawlPages: 3,
      status: "enabled" as KeywordMonitor["status"]
    } as KeywordMonitorForm
  }),
  getters: {
    selectedKeyword: (state) => state.keywords.find((item) => item.id === state.selectedKeywordId) ?? null,
    topSnapshots: (state) => state.detail?.snapshots.slice(0, 10) ?? []
  },
  actions: {
    setKeywords(keywordData: KeywordMonitor[]) {
      this.keywords = keywordData;
      if (!this.selectedKeywordId && keywordData[0]) {
        this.selectedKeywordId = keywordData[0].id;
      }
    },
    async loadKeywords(date: string, renderKeywordChart?: (snapshots: KeywordDetail["snapshots"]) => Promise<void>) {
      const keywordData = await keywordApi.keywords();
      this.setKeywords(keywordData);
      await this.loadDetail(date, renderKeywordChart);
    },
    async loadDetail(date: string, renderKeywordChart?: (snapshots: KeywordDetail["snapshots"]) => Promise<void>) {
      if (!this.selectedKeywordId) {
        this.detail = null;
        return;
      }
      const data = await keywordApi.keywordDetail(this.selectedKeywordId, date);
      this.detail = data;
      if (renderKeywordChart && data?.snapshots) {
        await renderKeywordChart(data.snapshots);
      }
    },
    async createKeyword(date: string) {
      if (!this.keywordForm.keyword.trim()) {
        throw new Error("关键词不能为空");
      }
      const created = await keywordApi.createKeyword(this.keywordForm);
      this.keywordForm.keyword = "";
      this.keywordForm.categoryTag = "";
      this.selectedKeywordId = created.id;
      await this.loadKeywords(date);
    },
    async toggleKeyword(keyword: KeywordMonitor, date: string) {
      await keywordApi.updateKeyword(keyword.id, {
        status: keyword.status === "enabled" ? "disabled" : "enabled"
      });
      await this.loadKeywords(date);
    },
    async deleteKeyword(keywordId: number, date: string) {
      await keywordApi.deleteKeyword(keywordId);
      if (this.selectedKeywordId === keywordId) {
        this.selectedKeywordId = null;
      }
      await this.loadKeywords(date);
    }
  }
});
