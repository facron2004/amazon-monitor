<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElCard, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTag } from "element-plus";
import { Archive, Edit3, FileText, Loader2, Plus, RefreshCw, Send } from "@lucide/vue";
import { sopCategories, sopCategoryLabels, sopStatuses, sopStatusLabels, type Sop, type SopStatus } from "@amazon-monitor/shared";
import { useSopStore } from "../stores/sops.js";
import { useWriteAccess } from "../composables/useWriteAccess";
import ReadOnlyNotice from "./ReadOnlyNotice.vue";

const store = useSopStore();
const { sops, loading, error } = storeToRefs(store);
const { canWrite } = useWriteAccess();

const filterStatus = ref<SopStatus | "all">("all");
const filterCategory = ref<Sop["category"] | "all">("all");
const searchQuery = ref("");

const filtered = computed<Sop[]>(() => {
  return sops.value.filter((s) => {
    if (filterStatus.value !== "all" && s.status !== filterStatus.value) return false;
    if (filterCategory.value !== "all" && s.category !== filterCategory.value) return false;
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      if (!s.title.toLowerCase().includes(q) && !s.bodyMd.toLowerCase().includes(q)) return false;
    }
    return true;
  });
});

const STATUS_COLORS: Record<SopStatus, "info" | "success" | "warning"> = {
  draft: "info",
  published: "success",
  archived: "warning"
};

const newOpen = ref(false);
const newTitle = ref("");
const newCategory = ref<Sop["category"]>("general");
const newBody = ref("");
const newTags = ref("");
const saving = ref(false);

const detailOpen = ref(false);
const detailSop = ref<Sop | null>(null);

async function refresh(): Promise<void> {
  await store.fetchSops();
}

onMounted(refresh);

function openNew(): void {
  if (!canWrite.value) return;
  newTitle.value = "";
  newCategory.value = "general";
  newBody.value = "";
  newTags.value = "";
  newOpen.value = true;
}

async function createNew(): Promise<void> {
  if (!canWrite.value) return;
  if (!newTitle.value.trim() || !newBody.value.trim()) {
    ElMessage.warning("请填写标题和正文");
    return;
  }
  saving.value = true;
  try {
    await store.createSop({
      title: newTitle.value.trim(),
      category: newCategory.value,
      bodyMd: newBody.value.trim(),
      tags: newTags.value.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
    });
    newOpen.value = false;
    ElMessage.success("SOP 已创建（草稿）");
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    saving.value = false;
  }
}

async function publish(s: Sop): Promise<void> {
  if (!canWrite.value) return;
  try {
    await store.publish(s.id);
    ElMessage.success("已发布");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function archive(s: Sop): Promise<void> {
  if (!canWrite.value) return;
  try {
    await store.archive(s.id);
    ElMessage.success("已归档");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function openDetail(s: Sop): void {
  detailSop.value = s;
  detailOpen.value = true;
}
</script>

<template>
  <div class="sops-view">
    <header class="sops-view__header">
      <h2>SOP 知识库</h2>
      <div class="sops-view__filters">
        <ElInput v-model="searchQuery" placeholder="搜索标题/正文" style="width: 200px" clearable />
        <ElSelect v-model="filterStatus" placeholder="状态" style="width: 120px" clearable>
          <ElOption label="全部状态" value="all" />
          <ElOption v-for="s in sopStatuses" :key="s" :label="sopStatusLabels[s]" :value="s" />
        </ElSelect>
        <ElSelect v-model="filterCategory" placeholder="分类" style="width: 160px" clearable>
          <ElOption label="全部分类" value="all" />
          <ElOption v-for="c in sopCategories" :key="c" :label="sopCategoryLabels[c]" :value="c" />
        </ElSelect>
        <ElButton @click="refresh" :loading="loading">
          <template #icon><RefreshCw :size="14" /></template>
          刷新
        </ElButton>
        <ElButton type="primary" :disabled="!canWrite" @click="openNew">
          <template #icon><Plus :size="14" /></template>
          新建 SOP
        </ElButton>
      </div>
    </header>

    <ReadOnlyNotice v-if="!canWrite" />

    <p v-if="error" class="sops-view__error">{{ error }}</p>

    <div v-if="loading && !sops.length" class="sops-view__loading">
      <Loader2 :size="20" class="spin" /> 加载中…
    </div>

    <div class="sops-view__grid">
      <ElCard v-for="s in filtered" :key="s.id" class="sops-view__card" shadow="hover" @click="openDetail(s)">
        <header class="sops-view__card-header">
          <ElTag :type="STATUS_COLORS[s.status]" size="small">{{ sopStatusLabels[s.status] }}</ElTag>
          <ElTag size="small" type="info">{{ sopCategoryLabels[s.category] }}</ElTag>
        </header>
        <h4 class="sops-view__card-title">
          <FileText :size="14" /> {{ s.title }}
        </h4>
        <p class="sops-view__card-body">{{ s.bodyMd.slice(0, 120) }}{{ s.bodyMd.length > 120 ? '…' : '' }}</p>
        <footer v-if="s.tags.length" class="sops-view__card-tags">
          <ElTag v-for="t in s.tags" :key="t" size="small" effect="plain">{{ t }}</ElTag>
        </footer>
        <div class="sops-view__actions" @click.stop>
          <ElButton v-if="s.status === 'draft'" size="small" type="primary" :disabled="!canWrite" @click="publish(s)">
            <template #icon><Send :size="12" /></template>
            发布
          </ElButton>
          <ElButton v-if="s.status === 'published'" size="small" type="warning" :disabled="!canWrite" @click="archive(s)">
            <template #icon><Archive :size="12" /></template>
            归档
          </ElButton>
        </div>
      </ElCard>
    </div>

    <ElDialog v-model="newOpen" title="新建 SOP" width="640px">
      <ElInput v-model="newTitle" placeholder="标题" style="margin-bottom: 12px" />
      <ElSelect v-model="newCategory" placeholder="分类" style="width: 100%; margin-bottom: 12px">
        <ElOption v-for="c in sopCategories" :key="c" :label="sopCategoryLabels[c]" :value="c" />
      </ElSelect>
      <ElInput v-model="newTags" placeholder="标签（逗号分隔）" style="margin-bottom: 12px" />
      <ElInput v-model="newBody" type="textarea" :rows="10" placeholder="正文（支持 Markdown）" />
      <template #footer>
        <ElButton @click="newOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" :disabled="!canWrite" @click="createNew">创建</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="detailOpen" :title="detailSop?.title ?? 'SOP 详情'" width="720px">
      <div v-if="detailSop" class="sops-view__detail">
        <header class="sops-view__detail-header">
          <ElTag :type="STATUS_COLORS[detailSop.status]" size="small">{{ sopStatusLabels[detailSop.status] }}</ElTag>
          <ElTag size="small" type="info">{{ sopCategoryLabels[detailSop.category] }}</ElTag>
        </header>
        <pre class="sops-view__detail-body">{{ detailSop.bodyMd }}</pre>
      </div>
      <template #footer>
        <ElButton @click="detailOpen = false">关闭</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.sops-view { padding: 16px; }
.sops-view__header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.sops-view__header h2 { margin: 0; font-size: 18px; }
.sops-view__filters { margin-left: auto; display: flex; gap: 8px; }
.sops-view__error { color: #d03050; }
.sops-view__loading { display: flex; gap: 8px; align-items: center; padding: 16px; color: #909399; }
.sops-view__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.sops-view__card { cursor: pointer; }
.sops-view__card-header { display: flex; gap: 4px; margin-bottom: 6px; }
.sops-view__card-title { display: flex; align-items: center; gap: 6px; margin: 0 0 6px 0; font-size: 14px; font-weight: 600; }
.sops-view__card-body { margin: 0 0 6px 0; font-size: 12px; color: #606266; line-height: 1.4; white-space: pre-wrap; }
.sops-view__card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.sops-view__actions { display: flex; gap: 4px; }
.sops-view__detail-header { display: flex; gap: 4px; margin-bottom: 12px; }
.sops-view__detail-body { background: #f7f8fa; padding: 12px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; max-height: 480px; overflow-y: auto; white-space: pre-wrap; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
