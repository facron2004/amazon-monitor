<script setup lang="ts">
import type { KeywordMonitor, SerpSnapshot } from "@amazon-monitor/shared";
import type { KeywordMonitorForm } from "../types/keyword-monitor";
import KeywordDetailPanel from "./KeywordDetailPanel.vue";
import KeywordMonitorPanel from "./KeywordMonitorPanel.vue";

interface Props {
  keywords: KeywordMonitor[];
  selectedKeyword: KeywordMonitor | null;
  selectedKeywordId: number | null;
  topSnapshots: SerpSnapshot[];
  keywordForm: KeywordMonitorForm;
  collecting: boolean;
}

interface Emits {
  (e: "update:selected-keyword-id", id: number): void;
  (e: "run-collection", keywordId?: number): void;
  (e: "create-keyword"): void;
  (e: "toggle-keyword", keyword: KeywordMonitor): void;
  (e: "chart-ready", element: HTMLDivElement | null): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <section class="view">
    <KeywordMonitorPanel
      :keywords="keywords"
      :selected-keyword-id="selectedKeywordId"
      :keyword-form="keywordForm"
      :collecting="collecting"
      @update:selected-keyword-id="emit('update:selected-keyword-id', $event)"
      @run-collection="emit('run-collection', $event)"
      @create-keyword="emit('create-keyword')"
      @toggle-keyword="emit('toggle-keyword', $event)"
    />

    <KeywordDetailPanel
      :selected-keyword="selectedKeyword"
      :top-snapshots="topSnapshots"
      @chart-ready="emit('chart-ready', $event)"
    />
  </section>
</template>
