<script setup lang="ts">
import { ElButton, ElEmpty, ElTag } from "element-plus";
import {
  Archive,
  BookOpen,
  Edit3,
  Send,
} from "@lucide/vue";
import {
  sopCategoryLabels,
  sopStatusLabels,
  type Sop,
  type SopStatus,
} from "@amazon-monitor/shared";

defineProps<{
  sop: Sop | null;
  canWrite: boolean;
  actionLoading: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  publish: [];
  archive: [];
}>();

const statusTypes: Record<SopStatus, "info" | "success" | "warning"> = {
  draft: "info",
  published: "success",
  archived: "warning",
};

function formatTime(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}
</script>

<template>
  <aside class="sop-detail-panel" aria-label="SOP 详情">
    <ElEmpty
      v-if="!sop"
      description="选择一条 SOP 查看执行步骤和治理状态。"
      :image-size="72"
    />
    <template v-else>
      <header class="sop-detail-panel__header">
        <div>
          <span class="sop-detail-panel__eyebrow">SOP #{{ sop.id }}</span>
          <h3>{{ sop.title }}</h3>
        </div>
        <div class="sop-detail-panel__actions">
          <ElButton
            v-if="sop.status === 'draft'"
            aria-label="编辑 SOP"
            :disabled="!canWrite"
            @click="emit('edit')"
          >
            <Edit3 :size="14" />
            编辑
          </ElButton>
          <ElButton
            v-if="sop.status === 'draft'"
            type="primary"
            aria-label="发布 SOP"
            :loading="actionLoading"
            :disabled="!canWrite"
            @click="emit('publish')"
          >
            <Send :size="14" />
            发布
          </ElButton>
          <ElButton
            v-if="sop.status === 'published'"
            aria-label="归档 SOP"
            :loading="actionLoading"
            :disabled="!canWrite"
            @click="emit('archive')"
          >
            <Archive :size="14" />
            归档
          </ElButton>
        </div>
      </header>

      <div class="sop-detail-panel__meta">
        <ElTag :type="statusTypes[sop.status]" effect="plain">
          {{ sopStatusLabels[sop.status] }}
        </ElTag>
        <ElTag type="info" effect="plain">
          {{ sopCategoryLabels[sop.category] }}
        </ElTag>
        <span>更新于 {{ formatTime(sop.updatedAt) }}</span>
      </div>

      <dl class="sop-detail-panel__facts">
        <div>
          <dt>来源任务</dt>
          <dd>{{ sop.sourceTaskId ? `#${sop.sourceTaskId}` : "人工维护" }}</dd>
        </div>
        <div>
          <dt>检索标签</dt>
          <dd>{{ sop.tags.length ? sop.tags.join(" · ") : "未设置" }}</dd>
        </div>
      </dl>

      <section class="sop-detail-panel__body">
        <header>
          <BookOpen :size="16" />
          <h4>执行正文</h4>
        </header>
        <pre>{{ sop.bodyMd }}</pre>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.sop-detail-panel {
  border-left: 1px solid #e5e7eb;
  min-height: 520px;
  min-width: 0;
  padding-left: 24px;
}

.sop-detail-panel__header {
  align-items: flex-start;
  display: flex;
  gap: 18px;
  justify-content: space-between;
}

.sop-detail-panel__eyebrow {
  color: #667085;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.sop-detail-panel h3 {
  color: #101828;
  font-size: 20px;
  line-height: 1.35;
  margin: 5px 0 0;
}

.sop-detail-panel__actions,
.sop-detail-panel__meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sop-detail-panel__meta {
  border-bottom: 1px solid #e5e7eb;
  color: #667085;
  font-size: 12px;
  margin-top: 16px;
  padding-bottom: 16px;
}

.sop-detail-panel__facts {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 18px 0 0;
}

.sop-detail-panel__facts div {
  min-width: 0;
}

.sop-detail-panel__facts dt {
  color: #667085;
  font-size: 11px;
}

.sop-detail-panel__facts dd {
  color: #344054;
  font-size: 12px;
  line-height: 1.5;
  margin: 5px 0 0;
  overflow-wrap: anywhere;
}

.sop-detail-panel__body {
  border-top: 1px solid #e5e7eb;
  margin-top: 20px;
  padding-top: 18px;
}

.sop-detail-panel__body > header {
  align-items: center;
  color: #344054;
  display: flex;
  gap: 8px;
}

.sop-detail-panel__body h4 {
  font-size: 13px;
  margin: 0;
}

.sop-detail-panel__body pre {
  color: #475467;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  margin: 14px 0 0;
  max-height: 560px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .sop-detail-panel {
    border-left: 0;
    border-top: 1px solid #e5e7eb;
    min-height: 0;
    padding-left: 0;
    padding-top: 22px;
  }
}

@media (max-width: 640px) {
  .sop-detail-panel__header {
    flex-direction: column;
  }

  .sop-detail-panel__facts {
    grid-template-columns: 1fr;
  }
}
</style>
