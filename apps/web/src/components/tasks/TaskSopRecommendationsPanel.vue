<script setup lang="ts">
import { ref } from "vue";
import {
  ElButton,
  ElEmpty,
  ElMessage,
  ElSkeleton,
  ElTag,
  ElTooltip,
} from "element-plus";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
} from "@lucide/vue";
import {
  sopCategoryLabels,
  type TaskSopRecommendation,
} from "@amazon-monitor/shared";

defineProps<{
  recommendations: TaskSopRecommendation[];
  loading: boolean;
}>();

const expandedIds = ref<Set<number>>(new Set());
const copiedId = ref<number | null>(null);

function toggleExpanded(id: number): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

async function copyBody(recommendation: TaskSopRecommendation): Promise<void> {
  try {
    await navigator.clipboard.writeText(recommendation.sop.bodyMd);
    copiedId.value = recommendation.sop.id;
    ElMessage.success("SOP 步骤已复制");
    window.setTimeout(() => {
      if (copiedId.value === recommendation.sop.id) copiedId.value = null;
    }, 1600);
  } catch {
    ElMessage.error("复制失败，请展开后手动选择");
  }
}
</script>

<template>
  <section
    class="task-sop-recommendations"
    aria-labelledby="task-sop-recommendations-title"
  >
    <header class="task-sop-recommendations__header">
      <BookOpen :size="16" />
      <div>
        <h3 id="task-sop-recommendations-title">可复用 SOP</h3>
        <p>仅推荐当前组织内已发布、且与任务证据匹配的经验。</p>
      </div>
    </header>

    <ElSkeleton v-if="loading" :rows="3" animated />
    <ElEmpty
      v-else-if="recommendations.length === 0"
      description="暂无匹配的已发布 SOP"
      :image-size="54"
    />
    <div v-else class="task-sop-recommendations__list">
      <article
        v-for="recommendation in recommendations"
        :key="recommendation.sop.id"
        class="task-sop-recommendations__item"
      >
        <div class="task-sop-recommendations__item-head">
          <div>
            <div class="task-sop-recommendations__meta">
              <ElTag size="small" type="success" effect="plain">
                {{ sopCategoryLabels[recommendation.sop.category] }}
              </ElTag>
              <span>SOP #{{ recommendation.sop.id }}</span>
            </div>
            <h4>{{ recommendation.sop.title }}</h4>
          </div>
          <div class="task-sop-recommendations__actions">
            <ElTooltip
              :content="
                expandedIds.has(recommendation.sop.id)
                  ? '收起 SOP 步骤'
                  : '展开 SOP 步骤'
              "
            >
              <ElButton
                text
                circle
                :aria-label="
                  expandedIds.has(recommendation.sop.id)
                    ? '收起 SOP 步骤'
                    : '展开 SOP 步骤'
                "
                @click="toggleExpanded(recommendation.sop.id)"
              >
                <ChevronUp
                  v-if="expandedIds.has(recommendation.sop.id)"
                  :size="16"
                />
                <ChevronDown v-else :size="16" />
              </ElButton>
            </ElTooltip>
            <ElTooltip content="复制 SOP 步骤">
              <ElButton
                text
                circle
                aria-label="复制 SOP 步骤"
                @click="copyBody(recommendation)"
              >
                <Check
                  v-if="copiedId === recommendation.sop.id"
                  :size="16"
                />
                <Copy v-else :size="16" />
              </ElButton>
            </ElTooltip>
          </div>
        </div>
        <ul class="task-sop-recommendations__reasons">
          <li
            v-for="reason in recommendation.matchReasons"
            :key="reason"
          >
            {{ reason }}
          </li>
        </ul>
        <pre
          :class="[
            'task-sop-recommendations__body',
            { expanded: expandedIds.has(recommendation.sop.id) },
          ]"
        >{{ recommendation.sop.bodyMd }}</pre>
      </article>
    </div>
  </section>
</template>

<style scoped>
.task-sop-recommendations {
  border-top: 1px solid #eaecf0;
  padding-top: 16px;
}

.task-sop-recommendations__header {
  align-items: flex-start;
  color: #344054;
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.task-sop-recommendations__header h3 {
  font-size: 14px;
  margin: 0;
}

.task-sop-recommendations__header p {
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
  margin: 4px 0 0;
}

.task-sop-recommendations__list {
  border-bottom: 1px solid #eaecf0;
}

.task-sop-recommendations__item {
  border-top: 1px solid #eaecf0;
  padding: 14px 0;
}

.task-sop-recommendations__item-head {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.task-sop-recommendations__item h4 {
  color: #1d2939;
  font-size: 13px;
  line-height: 1.45;
  margin: 7px 0 0;
}

.task-sop-recommendations__meta {
  align-items: center;
  color: #667085;
  display: flex;
  font-size: 11px;
  gap: 8px;
}

.task-sop-recommendations__actions {
  display: flex;
  flex: 0 0 auto;
}

.task-sop-recommendations__reasons {
  color: #475467;
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  gap: 5px 14px;
  line-height: 1.5;
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}

.task-sop-recommendations__reasons li::before {
  color: #12b76a;
  content: "•";
  margin-right: 5px;
}

.task-sop-recommendations__body {
  color: #667085;
  display: -webkit-box;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  margin: 10px 0 0;
  overflow: hidden;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.task-sop-recommendations__body.expanded {
  display: block;
  max-height: 420px;
  overflow: auto;
}
</style>
