<script setup lang="ts">
import type { AsinWatchLevel, AsinWatchState, CompetitorFolder, CompetitorPoolItem, ProductActivityCalendar } from "@amazon-monitor/shared";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";
import type { CompetitorInsightSuggestion, CompetitorKpi } from "../utils/competitor-pool";
import CompetitorActivityCalendarPanel from "./CompetitorActivityCalendarPanel.vue";
import CompetitorDrawerPanel from "./CompetitorDrawerPanel.vue";
import CompetitorPoolInsightPanel from "./CompetitorPoolInsightPanel.vue";
import CompetitorPoolKpiCards from "./CompetitorPoolKpiCards.vue";
import CompetitorPoolPanel from "./CompetitorPoolPanel.vue";

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
  productActivityCalendar: ProductActivityCalendar | null;
  competitorKpis: CompetitorKpi[];
  competitorInsightSuggestion: CompetitorInsightSuggestion;
}

interface Emits {
  (e: "update:competitor-query", value: string): void;
  (e: "update:competitor-source-filter", value: CompetitorSourceFilter): void;
  (e: "update:competitor-tier-filter", value: CompetitorTierFilter): void;
  (e: "select-competitor-folder", keywordId: number | null): void;
  (e: "open-competitor-drawer", item: CompetitorPoolItem): void;
  (e: "close-competitor-drawer"): void;
  (e: "toggle-key-competitor", item: CompetitorPoolItem): void;
  (e: "set-watch-state", item: CompetitorPoolItem, level: AsinWatchLevel): void;
  (e: "open-product-activity-calendar", item: CompetitorPoolItem): void;
  (e: "open-amazon", item: CompetitorPoolItem): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <section class="view competitors-view">
    <div class="competitors-view-kpis">
      <CompetitorPoolKpiCards :kpis="competitorKpis" />
    </div>

    <div class="competitors-view-body">
      <div class="competitors-view-main">
        <CompetitorPoolPanel
          :competitor-folders="competitorFolders"
          :visible-competitors="visibleCompetitors"
          :total-competitors="totalCompetitors"
          :competitor-query="competitorQuery"
          :competitor-source-filter="competitorSourceFilter"
          :competitor-tier-filter="competitorTierFilter"
          :watch-states="watchStates"
          :watch-state-updating-asin="watchStateUpdatingAsin"
          :selected-competitor-keyword-id="selectedCompetitorKeywordId"
          :selected-competitor="selectedCompetitor"
          @update:competitor-query="emit('update:competitor-query', $event)"
          @update:competitor-source-filter="emit('update:competitor-source-filter', $event)"
          @update:competitor-tier-filter="emit('update:competitor-tier-filter', $event)"
          @select-competitor-folder="emit('select-competitor-folder', $event)"
          @open-competitor-drawer="emit('open-competitor-drawer', $event)"
          @toggle-key-competitor="emit('toggle-key-competitor', $event)"
          @set-watch-state="(item, level) => emit('set-watch-state', item, level)"
          @open-product-activity-calendar="emit('open-product-activity-calendar', $event)"
          @open-amazon="emit('open-amazon', $event)"
        />
      </div>
      <div class="competitors-view-side">
        <CompetitorPoolInsightPanel />
      </div>
    </div>

    <CompetitorDrawerPanel
      :selected-competitor="selectedCompetitor"
      :watch-states="watchStates"
      :watch-state-updating-asin="watchStateUpdatingAsin"
      @close-competitor-drawer="emit('close-competitor-drawer')"
      @toggle-key-competitor="emit('toggle-key-competitor', $event)"
      @set-watch-state="(item, level) => emit('set-watch-state', item, level)"
      @open-product-activity-calendar="emit('open-product-activity-calendar', $event)"
      @open-amazon="emit('open-amazon', $event)"
    />

    <CompetitorActivityCalendarPanel :product-activity-calendar="productActivityCalendar" />
  </section>
</template>

<style scoped>
.competitors-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.competitors-view-body {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) 320px;
}

.competitors-view-main {
  min-width: 0;
}

.competitors-view-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 0;
}

@media (max-width: 1080px) {
  .competitors-view-body {
    grid-template-columns: 1fr;
  }
  .competitors-view-side {
    position: static;
  }
}
</style>
