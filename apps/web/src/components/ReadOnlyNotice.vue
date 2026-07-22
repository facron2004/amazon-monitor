<script setup lang="ts">
import { LockKeyhole } from "@lucide/vue";
</script>

<template>
  <div class="readonly-notice" role="status">
    <LockKeyhole :size="14" />
    <span>当前账号为只读角色，修改与执行操作已停用。</span>
  </div>
</template>

<style scoped>
.readonly-notice {
  align-items: center;
  background: #f7f7fa;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  display: flex;
  font-size: 12px;
  gap: 7px;
  padding: 8px 10px;
}
</style>
