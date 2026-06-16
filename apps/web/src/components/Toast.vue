<script setup lang="ts">
import { useToast } from "../composables/useToast";

const { toasts } = useToast();
</script>

<template>
  <div class="toast-container">
    <div v-for="t in toasts" :key="t.id" :class="['toast', t.type, { 'fade-out': t.fadingOut }]">
      {{ t.message }}
    </div>
  </div>
</template>
