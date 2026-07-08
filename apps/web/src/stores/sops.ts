import { defineStore } from "pinia";
import { ref } from "vue";
import type { Sop } from "@amazon-monitor/shared";
import * as api from "../api-sops.js";

export const useSopStore = defineStore("sops", () => {
  const sops = ref<Sop[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchSops(filter: { status?: Sop["status"]; category?: Sop["category"]; q?: string } = {}): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      sops.value = await api.listSops(filter);
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function createSop(input: api.CreateSopInput): Promise<Sop> {
    const s = await api.createSop(input);
    sops.value = [s, ...sops.value];
    return s;
  }

  async function publish(id: number): Promise<Sop> {
    const s = await api.publishSop(id);
    const idx = sops.value.findIndex((x) => x.id === id);
    if (idx >= 0) sops.value[idx] = s;
    return s;
  }

  async function archive(id: number): Promise<Sop> {
    const s = await api.archiveSop(id);
    const idx = sops.value.findIndex((x) => x.id === id);
    if (idx >= 0) sops.value[idx] = s;
    return s;
  }

  return { sops, loading, error, fetchSops, createSop, publish, archive };
});
