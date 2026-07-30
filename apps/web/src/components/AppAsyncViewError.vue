<script setup lang="ts">
import { RefreshCw, TriangleAlert } from "@lucide/vue";

defineProps<{
  error?: Error;
}>();

function reload(): void {
  window.location.reload();
}
</script>

<template>
  <section class="async-view-error" role="alert">
    <span class="async-view-error__icon" aria-hidden="true">
      <TriangleAlert :size="20" />
    </span>
    <div>
      <strong>页面资源加载失败</strong>
      <p>{{ error?.message ?? "异步页面未能加载，请重新载入应用。" }}</p>
    </div>
    <button type="button" @click="reload">
      <RefreshCw :size="15" aria-hidden="true" />
      重新加载应用
    </button>
  </section>
</template>

<style scoped>
.async-view-error {
  align-items: center;
  align-self: flex-start;
  background: #fffafa;
  border: 1px solid #f0c9c7;
  border-radius: 8px;
  display: flex;
  gap: 12px;
  margin: 18px 20px;
  max-width: 720px;
  padding: 14px 16px;
}

.async-view-error__icon {
  align-items: center;
  background: #fff0ef;
  border-radius: 50%;
  color: #c9342d;
  display: inline-flex;
  flex: 0 0 auto;
  height: 36px;
  justify-content: center;
  width: 36px;
}

.async-view-error div {
  flex: 1 1 auto;
  min-width: 0;
}

.async-view-error strong {
  color: #1d1d1f;
  font-size: 13px;
}

.async-view-error p {
  color: #6e6e73;
  font-size: 12px;
  line-height: 1.45;
  margin: 3px 0 0;
  overflow-wrap: anywhere;
}

.async-view-error button {
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

@media (max-width: 640px) {
  .async-view-error {
    align-items: flex-start;
    flex-wrap: wrap;
    margin: 12px;
  }

  .async-view-error button {
    margin-left: 48px;
  }
}
</style>
