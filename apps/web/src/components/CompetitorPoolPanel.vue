<script setup lang="ts">
import type { AsinWatchLevel, AsinWatchState, CompetitorFolder, CompetitorPoolItem } from "@amazon-monitor/shared";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";
import CompetitorPoolFilters from "./CompetitorPoolFilters.vue";
import CompetitorPoolTable from "./CompetitorPoolTable.vue";

interface Props {
  competitorFolders: CompetitorFolder[];
  visibleCompetitors: CompetitorPoolItem[];
  totalCompetitors: number;
  competitorQuery: string;
  competitorSourceFilter: CompetitorSourceFilter;
  competitorTierFilter: CompetitorTierFilter;
  watchStates: AsinWatchState[];
  watchStateUpdatingAsin: string | null;
  selectedCompetitorKeywordId: number | null;
  selectedCompetitor: CompetitorPoolItem | null;
}

interface Emits {
  (e: "update:competitor-query", value: string): void;
  (e: "update:competitor-source-filter", value: CompetitorSourceFilter): void;
  (e: "update:competitor-tier-filter", value: CompetitorTierFilter): void;
  (e: "select-competitor-folder", keywordId: number | null): void;
  (e: "open-competitor-drawer", item: CompetitorPoolItem): void;
  (e: "toggle-key-competitor", item: CompetitorPoolItem): void;
  (e: "set-watch-state", item: CompetitorPoolItem, level: AsinWatchLevel): void;
  (e: "open-product-activity-calendar", item: CompetitorPoolItem): void;
  (e: "open-amazon", item: CompetitorPoolItem): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <section class="panel">
    <CompetitorPoolFilters
      :competitor-folders="competitorFolders"
      :visible-competitor-count="visibleCompetitors.length"
      :total-competitors="totalCompetitors"
      :competitor-query="competitorQuery"
      :competitor-source-filter="competitorSourceFilter"
      :competitor-tier-filter="competitorTierFilter"
      :selected-competitor-keyword-id="selectedCompetitorKeywordId"
      @update:competitor-query="emit('update:competitor-query', $event)"
      @update:competitor-source-filter="emit('update:competitor-source-filter', $event)"
      @update:competitor-tier-filter="emit('update:competitor-tier-filter', $event)"
      @select-competitor-folder="emit('select-competitor-folder', $event)"
    />

    <CompetitorPoolTable
      :visible-competitors="visibleCompetitors"
      :selected-competitor="selectedCompetitor"
      :watch-states="watchStates"
      :watch-state-updating-asin="watchStateUpdatingAsin"
      @open-competitor-drawer="emit('open-competitor-drawer', $event)"
      @toggle-key-competitor="emit('toggle-key-competitor', $event)"
      @set-watch-state="(item, level) => emit('set-watch-state', item, level)"
      @open-product-activity-calendar="emit('open-product-activity-calendar', $event)"
      @open-amazon="emit('open-amazon', $event)"
    />
  </section>
</template>
