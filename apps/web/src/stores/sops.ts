import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  Sop,
  SopStatus,
  SopStatusCounts,
} from "@amazon-monitor/shared";
import * as api from "../api-sops.js";

const EMPTY_COUNTS: SopStatusCounts = {
  all: 0,
  draft: 0,
  published: 0,
  archived: 0,
};

export const useSopStore = defineStore("sops", () => {
  const sops = ref<Sop[]>([]);
  const selectedSopId = ref<number | null>(null);
  const status = ref<SopStatus | "">("");
  const category = ref<Sop["category"] | "">("");
  const query = ref("");
  const limit = ref(25);
  const offset = ref(0);
  const total = ref(0);
  const statusCounts = ref<SopStatusCounts>({ ...EMPTY_COUNTS });
  const loading = ref(false);
  const error = ref<string | null>(null);

  const selectedSop = computed(
    () =>
      sops.value.find((sop) => sop.id === selectedSopId.value) ??
      sops.value[0] ??
      null,
  );
  const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1);
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(total.value / limit.value)),
  );

  async function fetchSops(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      let response = await api.listSopPage({
        status: status.value || undefined,
        category: category.value || undefined,
        q: query.value.trim() || undefined,
        limit: limit.value,
        offset: offset.value,
      });
      const maxOffset =
        response.total === 0
          ? 0
          : Math.floor((response.total - 1) / limit.value) * limit.value;
      if (offset.value > maxOffset) {
        offset.value = maxOffset;
        response = await api.listSopPage({
          status: status.value || undefined,
          category: category.value || undefined,
          q: query.value.trim() || undefined,
          limit: limit.value,
          offset: offset.value,
        });
      }
      sops.value = response.sops;
      total.value = response.total;
      statusCounts.value = response.statusCounts;
      if (!sops.value.some((sop) => sop.id === selectedSopId.value)) {
        selectedSopId.value = sops.value[0]?.id ?? null;
      }
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function resetAndFetch(): Promise<void> {
    offset.value = 0;
    await fetchSops();
  }

  async function goToPage(page: number): Promise<void> {
    const nextPage = Math.min(Math.max(1, page), pageCount.value);
    offset.value = (nextPage - 1) * limit.value;
    await fetchSops();
  }

  function selectSop(id: number): void {
    selectedSopId.value = id;
  }

  async function createSop(input: api.CreateSopInput): Promise<Sop> {
    const s = await api.createSop(input);
    offset.value = 0;
    selectedSopId.value = s.id;
    await fetchSops();
    return s;
  }

  async function update(id: number, input: api.UpdateSopInput): Promise<Sop> {
    const s = await api.updateSop(id, input);
    selectedSopId.value = s.id;
    await fetchSops();
    return s;
  }

  async function publish(id: number): Promise<Sop> {
    const s = await api.publishSop(id);
    selectedSopId.value = s.id;
    await fetchSops();
    return s;
  }

  async function archive(id: number): Promise<Sop> {
    const s = await api.archiveSop(id);
    selectedSopId.value = s.id;
    await fetchSops();
    return s;
  }

  return {
    sops,
    selectedSop,
    selectedSopId,
    status,
    category,
    query,
    limit,
    offset,
    total,
    statusCounts,
    currentPage,
    pageCount,
    loading,
    error,
    fetchSops,
    resetAndFetch,
    goToPage,
    selectSop,
    createSop,
    update,
    publish,
    archive,
  };
});
