<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { watchDebounced } from "@vueuse/core";
import { storeToRefs } from "pinia";
import {
  ElButton,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSegmented,
  ElSelect,
  ElTooltip,
} from "element-plus";
import { BookOpen, Plus, RefreshCw, Search } from "@lucide/vue";
import {
  sopCategories,
  sopCategoryLabels,
  type Sop,
} from "@amazon-monitor/shared";
import type { CreateSopInput } from "../api-sops.js";
import { useSopStore } from "../stores/sops.js";
import { toErrorMessage } from "../utils/error-message.js";
import { useWriteAccess } from "../composables/useWriteAccess.js";
import ReadOnlyNotice from "./ReadOnlyNotice.vue";
import SopDetailPanel from "./sops/SopDetailPanel.vue";
import SopEditorDialog from "./sops/SopEditorDialog.vue";
import SopLibraryList from "./sops/SopLibraryList.vue";

const store = useSopStore();
const {
  sops,
  selectedSop,
  selectedSopId,
  status,
  category,
  query,
  limit,
  total,
  statusCounts,
  currentPage,
  loading,
  error,
} = storeToRefs(store);
const { canWrite } = useWriteAccess();

const editorOpen = ref(false);
const editorMode = ref<"create" | "edit">("create");
const saving = ref(false);
const actionLoading = ref(false);

const statusOptions = computed(() => [
  { label: `全部 ${statusCounts.value.all}`, value: "" },
  { label: `草稿 ${statusCounts.value.draft}`, value: "draft" },
  { label: `已发布 ${statusCounts.value.published}`, value: "published" },
  { label: `已归档 ${statusCounts.value.archived}`, value: "archived" },
]);

watch([status, category], () => {
  void store.resetAndFetch();
});

watchDebounced(
  query,
  () => {
    void store.resetAndFetch();
  },
  { debounce: 350, maxWait: 800 },
);

function openCreate(): void {
  if (!canWrite.value) return;
  editorMode.value = "create";
  editorOpen.value = true;
}

function openEdit(): void {
  if (!canWrite.value || selectedSop.value?.status !== "draft") return;
  editorMode.value = "edit";
  editorOpen.value = true;
}

async function submitEditor(input: CreateSopInput): Promise<void> {
  if (!canWrite.value) return;
  saving.value = true;
  try {
    if (editorMode.value === "edit" && selectedSop.value) {
      await store.update(selectedSop.value.id, input);
      ElMessage.success("SOP 草稿已更新");
    } else {
      await store.createSop(input);
      ElMessage.success("SOP 草稿已创建");
    }
    editorOpen.value = false;
  } catch (errorValue) {
    ElMessage.error(toErrorMessage(errorValue));
  } finally {
    saving.value = false;
  }
}

async function publishSelected(): Promise<void> {
  const sop = selectedSop.value;
  if (!sop || !canWrite.value) return;
  try {
    await ElMessageBox.confirm(
      `发布「${sop.title}」后，它将参与任务 SOP 推荐。`,
      "确认发布",
      { type: "warning", confirmButtonText: "发布" },
    );
  } catch {
    return;
  }
  await runAction(
    () => store.publish(sop.id),
    "SOP 已发布并进入知识复用范围",
  );
}

async function archiveSelected(): Promise<void> {
  const sop = selectedSop.value;
  if (!sop || !canWrite.value) return;
  try {
    await ElMessageBox.confirm(
      `归档「${sop.title}」后，新的任务将不再推荐它。`,
      "确认归档",
      { type: "warning", confirmButtonText: "归档" },
    );
  } catch {
    return;
  }
  await runAction(() => store.archive(sop.id), "SOP 已归档");
}

async function runAction(
  action: () => Promise<Sop>,
  successMessage: string,
): Promise<void> {
  actionLoading.value = true;
  try {
    await action();
    ElMessage.success(successMessage);
  } catch (errorValue) {
    ElMessage.error(toErrorMessage(errorValue));
  } finally {
    actionLoading.value = false;
  }
}
</script>

<template>
  <main class="sops-view">
    <header class="sops-view__header">
      <div class="sops-view__title">
        <span>KNOWLEDGE OPERATIONS</span>
        <h2><BookOpen :size="20" />SOP 知识库</h2>
        <p>把已验证动作整理成可检索、可治理、可回到任务现场的执行经验。</p>
      </div>
      <div class="sops-view__commands">
        <ElTooltip content="刷新 SOP">
          <ElButton
            circle
            aria-label="刷新 SOP"
            :loading="loading"
            @click="store.fetchSops"
          >
            <RefreshCw :size="15" />
          </ElButton>
        </ElTooltip>
        <ElButton
          type="primary"
          aria-label="新建 SOP"
          :disabled="!canWrite"
          @click="openCreate"
        >
          <Plus :size="15" />
          新建 SOP
        </ElButton>
      </div>
    </header>

    <ReadOnlyNotice v-if="!canWrite" />

    <section class="sops-view__toolbar" aria-label="SOP 筛选">
      <div class="sops-view__status-scroll">
        <ElSegmented
          v-model="status"
          :options="statusOptions"
          aria-label="SOP 状态"
        />
      </div>
      <div class="sops-view__filters">
        <ElInput
          v-model="query"
          clearable
          maxlength="200"
          placeholder="搜索标题、正文或标签"
          aria-label="搜索 SOP"
        >
          <template #prefix><Search :size="15" /></template>
        </ElInput>
        <ElSelect
          v-model="category"
          aria-label="筛选 SOP 分类"
          placeholder="全部分类"
        >
          <ElOption label="全部分类" value="" />
          <ElOption
            v-for="item in sopCategories"
            :key="item"
            :label="sopCategoryLabels[item]"
            :value="item"
          />
        </ElSelect>
      </div>
    </section>

    <div v-if="error" class="sops-view__error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="store.fetchSops">重试</button>
    </div>

    <div class="sops-view__workspace">
      <SopLibraryList
        :sops="sops"
        :selected-id="selectedSopId"
        :loading="loading"
        :total="total"
        :current-page="currentPage"
        :page-size="limit"
        @select="store.selectSop"
        @page="store.goToPage"
      />
      <SopDetailPanel
        :sop="selectedSop"
        :can-write="canWrite"
        :action-loading="actionLoading"
        @edit="openEdit"
        @publish="publishSelected"
        @archive="archiveSelected"
      />
    </div>

    <SopEditorDialog
      :open="editorOpen"
      :mode="editorMode"
      :sop="selectedSop"
      :saving="saving"
      @close="editorOpen = false"
      @submit="submitEditor"
    />
  </main>
</template>

<style scoped>
.sops-view {
  margin: 0 auto;
  max-width: 1440px;
  padding: 28px 32px 48px;
}

.sops-view__header {
  align-items: flex-start;
  display: flex;
  gap: 20px;
  justify-content: space-between;
}

.sops-view__title > span {
  color: #1677ff;
  font-size: 11px;
  font-weight: 750;
}

.sops-view__title h2 {
  align-items: center;
  color: #101828;
  display: flex;
  font-size: 22px;
  gap: 8px;
  margin: 7px 0 0;
}

.sops-view__title p {
  color: #667085;
  font-size: 13px;
  margin: 7px 0 0;
}

.sops-view__commands,
.sops-view__filters {
  align-items: center;
  display: flex;
  gap: 8px;
}

.sops-view__toolbar {
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 18px;
  justify-content: space-between;
  margin-top: 24px;
  padding: 14px 0;
}

.sops-view__status-scroll {
  min-width: 0;
  overflow-x: auto;
}

.sops-view__filters :deep(.el-input) {
  width: 240px;
}

.sops-view__filters :deep(.el-select) {
  width: 170px;
}

.sops-view__error {
  align-items: center;
  background: #fff1f0;
  color: #b42318;
  display: flex;
  font-size: 12px;
  justify-content: space-between;
  margin-top: 16px;
  padding: 10px 12px;
}

.sops-view__error button {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-weight: 700;
}

.sops-view__workspace {
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(320px, 0.8fr) minmax(0, 1.4fr);
  margin-top: 20px;
}

@media (max-width: 900px) {
  .sops-view {
    padding: 22px 20px 40px;
  }

  .sops-view__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .sops-view__filters :deep(.el-input),
  .sops-view__filters :deep(.el-select) {
    flex: 1 1 0;
    width: auto;
  }

  .sops-view__workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .sops-view {
    padding: 18px 14px 36px;
  }

  .sops-view__header {
    align-items: stretch;
    flex-direction: column;
  }

  .sops-view__commands {
    justify-content: flex-end;
  }

  .sops-view__filters {
    align-items: stretch;
    flex-direction: column;
  }

  .sops-view__filters :deep(.el-input),
  .sops-view__filters :deep(.el-select) {
    width: 100%;
  }
}
</style>
