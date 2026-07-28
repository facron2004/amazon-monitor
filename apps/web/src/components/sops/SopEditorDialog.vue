<script setup lang="ts">
import { ref, watch } from "vue";
import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
} from "element-plus";
import {
  sopCategories,
  sopCategoryLabels,
  type Sop,
} from "@amazon-monitor/shared";
import type { CreateSopInput } from "../../api-sops.js";

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  sop: Sop | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: CreateSopInput];
}>();

const title = ref("");
const category = ref<Sop["category"]>("general");
const tags = ref("");
const bodyMd = ref("");

watch(
  () => [props.open, props.mode, props.sop] as const,
  ([open, mode, sop]) => {
    if (!open) return;
    if (mode === "edit" && sop) {
      title.value = sop.title;
      category.value = sop.category;
      tags.value = sop.tags.join(", ");
      bodyMd.value = sop.bodyMd;
      return;
    }
    title.value = "";
    category.value = "general";
    tags.value = "";
    bodyMd.value = "";
  },
  { immediate: true },
);

function submit(): void {
  if (!title.value.trim() || !bodyMd.value.trim()) {
    ElMessage.warning("请填写 SOP 标题和正文");
    return;
  }
  emit("submit", {
    title: title.value.trim(),
    category: category.value,
    bodyMd: bodyMd.value.trim(),
    tags: tags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  });
}
</script>

<template>
  <ElDialog
    :model-value="open"
    :title="mode === 'edit' ? '编辑 SOP 草稿' : '新建 SOP 草稿'"
    width="min(680px, calc(100vw - 24px))"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="sop-editor">
      <label>
        <span>标题</span>
        <ElInput v-model="title" maxlength="160" show-word-limit />
      </label>
      <label>
        <span>分类</span>
        <ElSelect v-model="category">
          <ElOption
            v-for="item in sopCategories"
            :key="item"
            :label="sopCategoryLabels[item]"
            :value="item"
          />
        </ElSelect>
      </label>
      <label>
        <span>检索标签</span>
        <ElInput
          v-model="tags"
          placeholder="ASIN、品牌、关键词或动作类型，使用逗号分隔"
        />
      </label>
      <label>
        <span>执行正文</span>
        <ElInput
          v-model="bodyMd"
          type="textarea"
          :rows="14"
          maxlength="20000"
          show-word-limit
          placeholder="使用 Markdown 记录适用场景、执行步骤、检查项和风险边界"
        />
      </label>
    </div>
    <template #footer>
      <ElButton @click="emit('close')">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">
        {{ mode === "edit" ? "保存草稿" : "创建草稿" }}
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.sop-editor {
  display: grid;
  gap: 16px;
}

.sop-editor label {
  display: grid;
  gap: 7px;
}

.sop-editor label > span {
  color: #344054;
  font-size: 12px;
  font-weight: 650;
}
</style>
