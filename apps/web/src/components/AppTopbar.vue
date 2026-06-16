<script setup lang="ts">
import AppTopbarHero from "./AppTopbarHero.vue";
import AppTopbarStatusPanel from "./AppTopbarStatusPanel.vue";

defineProps<{
  loading: boolean;
  actionMessage: string;
  errorMessage: string;
  activeTabLabel: string;
  selectedDate: string;
  categoryCount: number;
  keywordCount: number;
  pendingAlertCount: number;
  scheduleCount: number;
}>();

const emit = defineEmits<{
  (event: "toggle-sidebar"): void;
}>();
</script>

<template>
  <header class="topbar">
    <AppTopbarHero
      :loading="loading"
      :active-tab-label="activeTabLabel"
      :selected-date="selectedDate"
      @toggle-sidebar="emit('toggle-sidebar')"
    />
    <AppTopbarStatusPanel
      :loading="loading"
      :action-message="actionMessage"
      :error-message="errorMessage"
      :active-tab-label="activeTabLabel"
      :category-count="categoryCount"
      :keyword-count="keywordCount"
      :pending-alert-count="pendingAlertCount"
      :schedule-count="scheduleCount"
    />
  </header>
</template>
