<script setup lang="ts">
import { computed } from "vue";
import { Database, X } from "@lucide/vue";
import type { TabKey } from "../constants/tabs";
import { tabs } from "../constants/tabs";
import { APP_VERSION, VERSION_RELEASE_DATE } from "../constants/version";
import { useWriteAccess } from "../composables/useWriteAccess";

const { canWrite: canViewProfit } = useWriteAccess("view_profit");
const { canWrite: canViewAds } = useWriteAccess("view_ads");

defineProps<{
  activeTab: TabKey;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (event: "update:activeTab", value: TabKey): void;
  (event: "close"): void;
}>();

const monitorTabs = computed(() =>
  tabs.filter((tab) =>
    [
      "overview",
      "categories",
      "keywords",
      "competitors",
      "products",
      "inventory",
      "profit",
      "listing-health",
      "ads",
      "review-voc"
    ].includes(tab.key)
      && (tab.key !== "profit" || canViewProfit.value)
      && (tab.key !== "ads" || canViewAds.value)
  )
);

const followUpTabs = computed(() =>
  tabs.filter((tab) => ["action-center", "ai-agents", "tasks", "promotions", "sops"].includes(tab.key))
);

const systemTabs = computed(() => tabs.filter((tab) => ["rules", "data-sources", "alerts", "notifications", "reports", "logs"].includes(tab.key)));

</script>

<template>
  <aside :class="['sidebar', { 'sidebar-open': isOpen }]">
    <div class="brand">
      <div class="brand-mark">
        <Database :size="20" />
      </div>
      <div>
        <strong>亚马逊监控台</strong>
        <span>类目、关键词与竞品运营视图</span>
      </div>
      <button class="icon-button sidebar-close" type="button" aria-label="关闭导航" @click="emit('close')">
        <X :size="18" />
      </button>
    </div>

    <div class="sidebar-nav-group">
      <p class="sidebar-section-label">监控视图</p>
      <nav class="nav">
        <button
          v-for="tab in monitorTabs"
          :key="tab.key"
          :class="{ active: activeTab === tab.key }"
          type="button"
          @click="emit('update:activeTab', tab.key); emit('close')"
        >
          <component :is="tab.icon" :size="18" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </div>

    <div class="sidebar-nav-group">
      <p class="sidebar-section-label">跟进视图</p>
      <nav class="nav nav-secondary">
        <button
          v-for="tab in followUpTabs"
          :key="tab.key"
          :class="{ active: activeTab === tab.key }"
          type="button"
          @click="emit('update:activeTab', tab.key); emit('close')"
        >
          <component :is="tab.icon" :size="18" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </div>

    <div class="sidebar-nav-group">
      <p class="sidebar-section-label">系统工具</p>
      <nav class="nav nav-secondary">
        <button v-for="tab in systemTabs" :key="tab.key" :class="{ active: activeTab === tab.key }" type="button" @click="emit('update:activeTab', tab.key); emit('close')">
          <component :is="tab.icon" :size="18" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </div>

    <a class="sidebar-version" href="/CHANGELOG.md" target="_blank" rel="noopener noreferrer" :title="`版本 v${APP_VERSION} · 发布于 ${VERSION_RELEASE_DATE}`">
      <span class="sidebar-version-tag">v{{ APP_VERSION }}</span>
      <span class="sidebar-version-date">发布于 {{ VERSION_RELEASE_DATE }}</span>
    </a>
  </aside>
</template>
