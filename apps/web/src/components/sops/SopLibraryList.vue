<script setup lang="ts">
import {
  ElEmpty,
  ElPagination,
  ElSkeleton,
  ElTag,
} from "element-plus";
import {
  sopCategoryLabels,
  sopStatusLabels,
  type Sop,
  type SopStatus,
} from "@amazon-monitor/shared";

defineProps<{
  sops: Sop[];
  selectedId: number | null;
  loading: boolean;
  total: number;
  currentPage: number;
  pageSize: number;
}>();

const emit = defineEmits<{
  select: [id: number];
  page: [page: number];
}>();

const statusTypes: Record<SopStatus, "info" | "success" | "warning"> = {
  draft: "info",
  published: "success",
  archived: "warning",
};

function preview(bodyMd: string): string {
  return bodyMd
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "代码步骤")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUpdated(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}
</script>

<template>
  <section class="sop-library-list" aria-label="SOP 列表">
    <ElSkeleton v-if="loading && sops.length === 0" :rows="8" animated />
    <ElEmpty
      v-else-if="sops.length === 0"
      description="当前条件下暂无 SOP，可新建草稿或调整筛选。"
      :image-size="72"
    />
    <div v-else class="sop-library-list__rows">
      <button
        v-for="sop in sops"
        :key="sop.id"
        type="button"
        :class="[
          'sop-library-row',
          { selected: selectedId === sop.id },
        ]"
        @click="emit('select', sop.id)"
      >
        <span class="sop-library-row__top">
          <span class="sop-library-row__badges">
            <ElTag
              size="small"
              :type="statusTypes[sop.status]"
              effect="plain"
            >
              {{ sopStatusLabels[sop.status] }}
            </ElTag>
            <span>{{ sopCategoryLabels[sop.category] }}</span>
          </span>
          <span>#{{ sop.id }}</span>
        </span>
        <strong>{{ sop.title }}</strong>
        <span class="sop-library-row__preview">{{ preview(sop.bodyMd) }}</span>
        <span class="sop-library-row__footer">
          <span v-if="sop.tags.length" class="sop-library-row__tags">
            <span v-for="tag in sop.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
            <span v-if="sop.tags.length > 3">+{{ sop.tags.length - 3 }}</span>
          </span>
          <span v-else>无检索标签</span>
          <time :datetime="sop.updatedAt">{{ formatUpdated(sop.updatedAt) }}</time>
        </span>
      </button>
    </div>

    <footer v-if="total > 0" class="sop-library-list__pagination">
      <span>共 {{ total }} 条 SOP</span>
      <ElPagination
        size="small"
        background
        layout="prev, pager, next"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        @current-change="emit('page', $event)"
      />
    </footer>
  </section>
</template>

<style scoped>
.sop-library-list {
  min-width: 0;
}

.sop-library-list__rows {
  border-bottom: 1px solid #e5e7eb;
}

.sop-library-row {
  background: transparent;
  border: 0;
  border-left: 3px solid transparent;
  border-top: 1px solid #e5e7eb;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 8px;
  padding: 14px 14px 14px 12px;
  text-align: left;
  width: 100%;
}

.sop-library-row:hover {
  background: #f8fafc;
}

.sop-library-row.selected {
  background: #f3f8ff;
  border-left-color: #1677ff;
}

.sop-library-row__top,
.sop-library-row__footer,
.sop-library-row__badges,
.sop-library-row__tags {
  align-items: center;
  display: flex;
}

.sop-library-row__top,
.sop-library-row__footer {
  color: #667085;
  font-size: 11px;
  gap: 10px;
  justify-content: space-between;
}

.sop-library-row__badges,
.sop-library-row__tags {
  flex-wrap: wrap;
  gap: 6px;
}

.sop-library-row > strong {
  color: #1d2939;
  font-size: 14px;
  line-height: 1.4;
}

.sop-library-row__preview {
  color: #667085;
  display: -webkit-box;
  font-size: 12px;
  line-height: 1.55;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.sop-library-row__tags > span {
  background: #f2f4f7;
  border-radius: 4px;
  color: #475467;
  padding: 2px 5px;
}

.sop-library-list__pagination {
  align-items: center;
  color: #667085;
  display: flex;
  font-size: 12px;
  gap: 12px;
  justify-content: space-between;
  padding: 14px 0 0;
}

@media (max-width: 640px) {
  .sop-library-list__pagination {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
