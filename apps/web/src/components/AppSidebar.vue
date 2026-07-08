<script setup lang="ts">
import { computed } from "vue";
import { Database, Play, RefreshCw, X } from "@lucide/vue";
import type { TabKey } from "../constants/tabs";
import { tabs } from "../constants/tabs";
import { APP_VERSION, VERSION_RELEASE_DATE } from "../constants/version";

const props = defineProps<{
  activeTab: TabKey;
  date: string;
  isOpen: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  (event: "update:activeTab", value: TabKey): void;
  (event: "update:date", value: string): void;
  (event: "close"): void;
  (event: "collect"): void;
  (event: "refresh"): void;
}>();

const monitorTabs = computed(() =>
  tabs.filter((tab) => ["overview", "categories", "keywords", "competitors", "products", "inventory", "profit", "listing-health", "ads", "review-voc"].includes(tab.key))
);

const followUpTabs = computed(() =>
  tabs.filter((tab) => ["action-center", "tasks", "sops", "alerts", "notifications", "reports", "logs"].includes(tab.key))
);

const sidebarState = computed(() => (props.loading ? "正在执行采集" : "看板已准备好复盘"));
</script>

<template>
  <aside :class="['sidebar', { 'sidebar-open': isOpen }]">
    <div class="brand">
      <Database :size="24" />
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

    <div class="side-tools">
      <label>
        <span>数据日期</span>
        <input :value="date" type="date" @input="emit('update:date', ($event.target as HTMLInputElement).value)" />
      </label>

      <div class="sidebar-action-grid">
        <button class="primary" type="button" :disabled="loading" @click="emit('collect'); emit('close')">
          <RefreshCw v-if="loading" :size="16" class="spinning" />
          <Play v-else :size="16" />
          <span>{{ loading ? "采集中..." : "全量采集" }}</span>
        </button>
        <button type="button" :disabled="loading" @click="emit('refresh'); emit('close')">
          <RefreshCw :size="16" />
          <span>刷新看板</span>
        </button>
      </div>

      <div class="sidebar-note">
        <span class="sidebar-note-label">今日节奏</span>
        <strong>{{ sidebarState }}</strong>
        <p>先切换日期回看历史，再在需要时发起新一轮采集，让类目和关键词判断始终落在最新证据上。</p>
      </div>
    </div>

    <a
      class="sidebar-version"
      href="/CHANGELOG.md"
      target="_blank"
      rel="noopener noreferrer"
      :title="`版本 v${APP_VERSION} · 发布于 ${VERSION_RELEASE_DATE}`"
    >
      <span class="sidebar-version-tag">v{{ APP_VERSION }}</span>
      <span class="sidebar-version-date">发布于 {{ VERSION_RELEASE_DATE }}</span>
    </a>
  </aside>
</template>
