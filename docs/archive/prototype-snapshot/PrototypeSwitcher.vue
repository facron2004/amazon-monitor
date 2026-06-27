<script setup lang="ts">
// PROTOTYPE — delete with apps/web/src/components/action-center/prototype/
import { computed, onMounted, onUnmounted } from "vue";
import { ChevronLeft, ChevronRight } from "@lucide/vue";
import type { PrototypeVariant } from "./usePrototypeVariant";

const props = defineProps<{
  current: PrototypeVariant;
  variants: readonly PrototypeVariant[];
  labels: Record<PrototypeVariant, string>;
}>();

const emit = defineEmits<{
  (event: "select", value: PrototypeVariant): void;
}>();

const currentIndex = computed(() => props.variants.indexOf(props.current));

function shift(delta: number): void {
  const length = props.variants.length;
  const next = props.variants[(currentIndex.value + delta + length) % length];
  emit("select", next);
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const target = event.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
  }
  event.preventDefault();
  shift(event.key === "ArrowLeft" ? -1 : 1);
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="prototype-switcher" role="region" aria-label="Action Center prototype switcher">
    <button class="arrow" type="button" aria-label="上一个 variant" @click="shift(-1)">
      <ChevronLeft :size="16" />
    </button>
    <span class="label">{{ labels[current] }}</span>
    <button class="arrow" type="button" aria-label="下一个 variant" @click="shift(1)">
      <ChevronRight :size="16" />
    </button>
  </div>
</template>

<style scoped>
.prototype-switcher {
  align-items: center;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full, 9999px);
  bottom: 18px;
  box-shadow: var(--shadow-lg, 0 24px 42px rgba(15, 23, 42, 0.1));
  display: inline-flex;
  gap: 8px;
  left: 50%;
  padding: 6px 8px;
  position: fixed;
  transform: translateX(-50%);
  z-index: 200;
}

.arrow {
  align-items: center;
  background: #0f172a;
  border: 0;
  border-radius: var(--radius-full, 9999px);
  color: #ffffff;
  cursor: pointer;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  width: 28px;
}

.arrow:hover {
  background: #1e293b;
}

.label {
  color: var(--text-primary, #0f172a);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 0 6px;
  white-space: nowrap;
}
</style>
