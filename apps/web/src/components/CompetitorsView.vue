<script setup lang="ts">
import type { CompetitorFolder, CompetitorPoolItem, ProductActivityCalendar } from "@amazon-monitor/shared";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "../constants/competitors";
import CompetitorActivityCalendarPanel from "./CompetitorActivityCalendarPanel.vue";
import CompetitorDrawerPanel from "./CompetitorDrawerPanel.vue";
import CompetitorPoolPanel from "./CompetitorPoolPanel.vue";

interface Props {
  competitorFolders: CompetitorFolder[];
  visibleCompetitors: CompetitorPoolItem[];
  totalCompetitors: number;
  competitorQuery: string;
  competitorSourceFilter: CompetitorSourceFilter;
  competitorTierFilter: CompetitorTierFilter;
  selectedCompetitorKeywordId: number | null;
  selectedCompetitor: CompetitorPoolItem | null;
  productActivityCalendar: ProductActivityCalendar | null;
}

interface Emits {
  (e: "update:competitor-query", value: string): void;
  (e: "update:competitor-source-filter", value: CompetitorSourceFilter): void;
  (e: "update:competitor-tier-filter", value: CompetitorTierFilter): void;
  (e: "select-competitor-folder", keywordId: number | null): void;
  (e: "open-competitor-drawer", item: CompetitorPoolItem): void;
  (e: "close-competitor-drawer"): void;
  (e: "toggle-key-competitor", item: CompetitorPoolItem): void;
  (e: "open-product-activity-calendar", item: CompetitorPoolItem): void;
  (e: "open-amazon", item: CompetitorPoolItem): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <section class="view">
    <CompetitorPoolPanel
      :competitor-folders="competitorFolders"
      :visible-competitors="visibleCompetitors"
      :total-competitors="totalCompetitors"
      :competitor-query="competitorQuery"
      :competitor-source-filter="competitorSourceFilter"
      :competitor-tier-filter="competitorTierFilter"
      :selected-competitor-keyword-id="selectedCompetitorKeywordId"
      :selected-competitor="selectedCompetitor"
      @update:competitor-query="emit('update:competitor-query', $event)"
      @update:competitor-source-filter="emit('update:competitor-source-filter', $event)"
      @update:competitor-tier-filter="emit('update:competitor-tier-filter', $event)"
      @select-competitor-folder="emit('select-competitor-folder', $event)"
      @open-competitor-drawer="emit('open-competitor-drawer', $event)"
      @toggle-key-competitor="emit('toggle-key-competitor', $event)"
      @open-product-activity-calendar="emit('open-product-activity-calendar', $event)"
      @open-amazon="emit('open-amazon', $event)"
    />

    <CompetitorDrawerPanel
      :selected-competitor="selectedCompetitor"
      @close-competitor-drawer="emit('close-competitor-drawer')"
      @toggle-key-competitor="emit('toggle-key-competitor', $event)"
      @open-product-activity-calendar="emit('open-product-activity-calendar', $event)"
      @open-amazon="emit('open-amazon', $event)"
    />

    <CompetitorActivityCalendarPanel :product-activity-calendar="productActivityCalendar" />
  </section>
</template>
