<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Download, Plus, Upload } from "@lucide/vue";
import type { CompetitorCsvImportResult } from "@amazon-monitor/shared";
import { ElButton, ElDialog, ElForm, ElFormItem, ElInput, ElMessage, ElOption, ElSelect, ElTabPane, ElTabs, ElTag } from "element-plus";
import { useCompetitorStore } from "../stores/competitor";

const store = useCompetitorStore();
const dialogOpen = ref(false);
const submitting = ref(false);
const mode = ref<"single" | "csv">("single");
const fileInput = ref<HTMLInputElement | null>(null);
const csvFileName = ref("");
const csvSource = ref("");
const importResult = ref<CompetitorCsvImportResult | null>(null);
const form = reactive({
  asin: "",
  marketplace: "US",
  title: "",
  brand: ""
});
const visibleImportErrors = computed(() => importResult.value?.errors.slice(0, 10) ?? []);

async function submit(): Promise<void> {
  if (!form.asin.trim() || !form.title.trim()) {
    ElMessage.warning("请填写 ASIN 和商品标题");
    return;
  }
  submitting.value = true;
  try {
    const created = await store.addManualCompetitor({
      asin: form.asin.trim().toUpperCase(),
      marketplace: form.marketplace,
      title: form.title.trim(),
      brand: form.brand.trim() || null
    });
    dialogOpen.value = false;
    Object.assign(form, { asin: "", marketplace: "US", title: "", brand: "" });
    ElMessage.success(`${created.asin} 已加入竞品池`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    submitting.value = false;
  }
}

async function selectCsv(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.error("CSV 文件不能超过 2 MB");
    return;
  }
  csvFileName.value = file.name;
  csvSource.value = await file.text();
  importResult.value = null;
}

async function importCsv(): Promise<void> {
  if (!csvSource.value) {
    ElMessage.warning("请先选择 CSV 文件");
    return;
  }
  submitting.value = true;
  try {
    importResult.value = await store.importCompetitorCsv(csvSource.value);
    const result = importResult.value;
    if (result.failedCount > 0) {
      ElMessage.warning(`已导入 ${result.importedCount} 行，${result.failedCount} 行失败`);
    } else {
      ElMessage.success(`已导入 ${result.importedCount} 个竞品`);
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    submitting.value = false;
  }
}

function downloadTemplate(): void {
  const blob = new Blob(["asin,marketplace,title,brand\nB0ABC12345,US,Example competitor,Example brand\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "competitor-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <ElButton type="primary" @click="dialogOpen = true">
    <template #icon><Plus :size="15" /></template>
    添加竞品
  </ElButton>

  <ElDialog v-model="dialogOpen" class="competitor-add-dialog" title="添加竞品" width="560px" destroy-on-close>
    <ElTabs v-model="mode" class="competitor-add-tabs">
      <ElTabPane label="单个添加" name="single">
        <ElForm label-position="top" @submit.prevent="submit">
          <div class="form-grid">
            <ElFormItem label="ASIN" required>
              <ElInput v-model="form.asin" maxlength="10" placeholder="例如 B0ABC12345" />
            </ElFormItem>
            <ElFormItem label="站点" required>
              <ElSelect v-model="form.marketplace">
                <ElOption label="美国" value="US" />
                <ElOption label="英国" value="UK" />
                <ElOption label="德国" value="DE" />
                <ElOption label="日本" value="JP" />
              </ElSelect>
            </ElFormItem>
          </div>
          <ElFormItem label="商品标题" required>
            <ElInput v-model="form.title" maxlength="500" show-word-limit />
          </ElFormItem>
          <ElFormItem label="品牌">
            <ElInput v-model="form.brand" maxlength="200" />
          </ElFormItem>
        </ElForm>
      </ElTabPane>
      <ElTabPane label="CSV 导入" name="csv">
        <div class="csv-actions">
          <input ref="fileInput" class="file-input" type="file" accept=".csv,text/csv" @change="selectCsv" />
          <ElButton @click="fileInput?.click()">
            <template #icon><Upload :size="15" /></template>
            选择 CSV
          </ElButton>
          <ElButton text @click="downloadTemplate">
            <template #icon><Download :size="15" /></template>
            下载模板
          </ElButton>
          <span v-if="csvFileName" class="file-name">{{ csvFileName }}</span>
        </div>
        <div v-if="importResult" class="import-result">
          <div class="import-summary">
            <ElTag type="success">成功 {{ importResult.importedCount }}</ElTag>
            <ElTag :type="importResult.failedCount ? 'danger' : 'info'">失败 {{ importResult.failedCount }}</ElTag>
          </div>
          <ul v-if="visibleImportErrors.length" class="import-errors">
            <li v-for="error in visibleImportErrors" :key="`${error.row}-${error.message}`">
              第 {{ error.row }} 行<span v-if="error.asin"> · {{ error.asin }}</span>：{{ error.message }}
            </li>
          </ul>
        </div>
      </ElTabPane>
    </ElTabs>
    <template #footer>
      <ElButton @click="dialogOpen = false">取消</ElButton>
      <ElButton v-if="mode === 'single'" type="primary" :loading="submitting" @click="submit">加入竞品池</ElButton>
      <ElButton v-else type="primary" :loading="submitting" @click="importCsv">开始导入</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.form-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) 128px;
}

:global(.competitor-add-dialog) {
  width: min(560px, calc(100vw - 24px)) !important;
}

.csv-actions,
.import-summary {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.file-input {
  display: none;
}

.file-name {
  color: var(--text-secondary, #475569);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.import-result {
  border-top: 1px solid var(--border-soft, #e2e8f0);
  margin-top: 18px;
  padding-top: 16px;
}

.import-errors {
  color: var(--color-danger, #dc2626);
  font-size: 12px;
  line-height: 1.6;
  margin: 12px 0 0;
  max-height: 180px;
  overflow: auto;
  padding-left: 18px;
}

@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
