<script setup lang="ts">
import { CalendarDays, Menu, Radar } from "@lucide/vue";

defineProps<{
  loading: boolean;
  activeTabLabel: string;
  selectedDate: string;
}>();

const emit = defineEmits<{
  (event: "toggle-sidebar"): void;
}>();
</script>

<template>
  <header class="topbar">
    <button class="icon-button topbar-toggle" type="button" aria-label="切换导航" @click="emit('toggle-sidebar')">
      <Menu :size="18" />
    </button>
    <span class="topbar-tab-label">{{ activeTabLabel }}</span>
    <span class="topbar-date">
      <CalendarDays :size="14" />
      <span>{{ selectedDate }}</span>
    </span>
    <span :class="['topbar-status', loading ? 'is-live' : '']">
      <Radar :size="14" />
      <span>{{ loading ? "采集中" : "就绪" }}</span>
    </span>
  </header>
</template>
