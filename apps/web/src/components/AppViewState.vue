<script setup lang="ts">
import { LoaderCircle, RefreshCw, TriangleAlert } from "@lucide/vue";
import { computed } from "vue";
import { resolveAppViewState } from "../utils/appViewState.js";

const props = defineProps<{
  loading: boolean;
  error: string;
  label: string;
}>();

const state = computed(() => resolveAppViewState(props.loading, props.error));

defineEmits<{
  retry: [];
}>();
</script>

<template>
  <section class="view-state" :aria-busy="loading">
    <div v-if="state === 'loading'" class="view-state__loading" role="status" aria-live="polite">
      <LoaderCircle class="view-state__spinner" :size="18" aria-hidden="true" />
      <div>
        <strong>正在加载{{ label }}</strong>
        <span>同步最新运营数据...</span>
      </div>
    </div>

    <div v-else-if="state === 'error'" class="view-state__error" role="alert">
      <span class="view-state__error-icon" aria-hidden="true">
        <TriangleAlert :size="18" />
      </span>
      <div class="view-state__error-copy">
        <strong>{{ label }}加载失败</strong>
        <span>{{ error }}</span>
      </div>
      <button type="button" class="view-state__retry" @click="$emit('retry')">
        <RefreshCw :size="15" aria-hidden="true" />
        <span>重新加载</span>
      </button>
    </div>

    <slot v-else />
  </section>
</template>

<style scoped>
.view-state {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.view-state__loading,
.view-state__error {
  align-items: center;
  background: color-mix(in srgb, var(--surface, #ffffff) 94%, #f5f7fa);
  border: 1px solid var(--border-color, #dfe3e8);
  border-radius: 8px;
  display: flex;
  gap: 12px;
  margin: 16px 20px;
  min-height: 72px;
  padding: 14px 16px;
}

.view-state__loading strong,
.view-state__loading span,
.view-state__error-copy strong,
.view-state__error-copy span {
  display: block;
}

.view-state__loading strong,
.view-state__error-copy strong {
  color: var(--text-primary, #1d1d1f);
  font-size: 13px;
  font-weight: 650;
}

.view-state__loading span,
.view-state__error-copy span {
  color: var(--text-muted, #6e6e73);
  font-size: 12px;
  line-height: 1.45;
  margin-top: 3px;
  overflow-wrap: anywhere;
}

.view-state__spinner {
  animation: view-state-spin 0.8s linear infinite;
  color: var(--color-primary, #0071e3);
  flex: 0 0 auto;
}

.view-state__error {
  background: #fffafa;
  border-color: #f0c9c7;
}

.view-state__error-icon {
  align-items: center;
  background: #fff0ef;
  border-radius: 50%;
  color: #c9342d;
  display: inline-flex;
  flex: 0 0 auto;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.view-state__error-copy {
  flex: 1 1 auto;
  min-width: 0;
}

.view-state__retry {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d2d2d7;
  border-radius: 7px;
  color: #1d1d1f;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
}

.view-state__retry:hover {
  background: #f5f5f7;
  border-color: #b8b8bd;
}

@keyframes view-state-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .view-state__loading,
  .view-state__error {
    align-items: flex-start;
    margin: 12px;
  }

  .view-state__error {
    flex-wrap: wrap;
  }

  .view-state__retry {
    margin-left: 46px;
  }
}
</style>
