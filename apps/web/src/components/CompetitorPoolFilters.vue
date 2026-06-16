<script setup lang="ts">
import { FolderOpen } from "@lucide/vue";
import type { CompetitorFolder } from "@amazon-monitor/shared";
import {
  competitorSourceOptions,
  competitorTierOptions,
  type CompetitorSourceFilter,
  type CompetitorTierFilter
} from "../constants/competitors";

interface Props {
  competitorFolders: CompetitorFolder[];
  visibleCompetitorCount: number;
  totalCompetitors: number;
  competitorQuery: string;
  competitorSourceFilter: CompetitorSourceFilter;
  competitorTierFilter: CompetitorTierFilter;
  selectedCompetitorKeywordId: number | null;
}

interface Emits {
  (e: "update:competitor-query", value: string): void;
  (e: "update:competitor-source-filter", value: CompetitorSourceFilter): void;
  (e: "update:competitor-tier-filter", value: CompetitorTierFilter): void;
  (e: "select-competitor-folder", keywordId: number | null): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div>
    <div class="panel-head">
      <h2>竞品池</h2>
      <span>{{ visibleCompetitorCount }} / {{ totalCompetitors }} ASIN</span>
    </div>

    <div class="panel-controls competitor-controls">
      <input :value="competitorQuery" placeholder="筛选 ASIN / 标题 / 品牌 / 入池原因" @input="emit('update:competitor-query', ($event.target as HTMLInputElement).value.trim())" />
      <select :value="competitorSourceFilter" @change="emit('update:competitor-source-filter', ($event.target as HTMLSelectElement).value as CompetitorSourceFilter)">
        <option v-for="option in competitorSourceOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <select :value="competitorTierFilter" @change="emit('update:competitor-tier-filter', ($event.target as HTMLSelectElement).value as CompetitorTierFilter)">
        <option v-for="option in competitorTierOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div class="folder-strip">
      <button :class="{ active: selectedCompetitorKeywordId === null }" type="button" @click="emit('select-competitor-folder', null)">
        <FolderOpen :size="16" />
        <span>全部关键词</span>
      </button>
      <button
        v-for="folder in competitorFolders"
        :key="folder.keywordId"
        :class="{ active: selectedCompetitorKeywordId === folder.keywordId }"
        type="button"
        @click="emit('select-competitor-folder', folder.keywordId)"
      >
        <FolderOpen :size="16" />
        <span>{{ folder.keyword }}</span>
        <strong>{{ folder.competitorCount }}</strong>
      </button>
    </div>
  </div>
</template>
