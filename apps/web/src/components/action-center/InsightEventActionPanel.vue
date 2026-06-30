<script setup lang="ts">
import { ref, watch } from "vue";
import { CalendarClock, CheckCircle2, Eye, Save, UserRound } from "@lucide/vue";
import { ElButton, ElButtonGroup, ElDatePicker, ElInput, ElOption, ElSelect } from "element-plus";
import {
  asinWatchLevelLabels,
  insightReviewResultLabels,
  type AsinWatchLevel,
  type AsinWatchState,
  type InsightEvent,
  type InsightEventStatus,
  type InsightReviewResult
} from "@amazon-monitor/shared";

const props = defineProps<{
  event: InsightEvent;
  watchState: AsinWatchState | null;
}>();

const emit = defineEmits<{
  (event: "status", id: string, status: InsightEventStatus, reviewDueDate?: string | null): void;
  (event: "note", id: string, note: string): void;
  (event: "assignee", id: string, assignee: string | null): void;
  (event: "watch", id: string): void;
  (event: "watch-state", insight: InsightEvent, level: AsinWatchLevel): void;
  (event: "review", id: string, result: InsightReviewResult, note?: string | null): void;
}>();

const noteDraft = ref("");
const assigneeDraft = ref("");
const reviewResult = ref<InsightReviewResult>("CONFIRMED");
const reviewDateDraft = ref("");
const watchLevelDraft = ref<AsinWatchLevel>("NORMAL");

const reviewResultValues: InsightReviewResult[] = [
  "CONFIRMED",
  "REVERTED",
  "CONTINUING",
  "FAILED",
  "UNCLEAR"
];
const reviewOptions: Array<{ value: InsightReviewResult; label: string }> = reviewResultValues.map((value) => ({
  value,
  label: insightReviewResultLabels[value]
}));
const watchOptions = (Object.entries(asinWatchLevelLabels) as Array<[AsinWatchLevel, string]>).map(([value, label]) => ({ value, label }));

watch(
  () => [props.event.id, props.watchState?.watchLevel] as const,
  () => {
    noteDraft.value = props.event.userNote ?? "";
    assigneeDraft.value = props.event.assignee ?? "";
    reviewResult.value = props.event.reviewResult ?? "CONFIRMED";
    reviewDateDraft.value = props.event.reviewDueDate ?? "";
    watchLevelDraft.value = props.watchState?.watchLevel ?? "NORMAL";
  },
  { immediate: true }
);

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function reviewResultValue(value: unknown): InsightReviewResult {
  return reviewOptions.some((option) => option.value === value) ? value as InsightReviewResult : "CONFIRMED";
}

function watchLevelValue(value: unknown): AsinWatchLevel {
  return watchOptions.some((option) => option.value === value) ? value as AsinWatchLevel : "NORMAL";
}

function saveAssignee(): void {
  const assignee = assigneeDraft.value.trim();
  emit("assignee", props.event.id, assignee || null);
}

function saveNote(): void {
  emit("note", props.event.id, noteDraft.value);
}

function scheduleReview(): void {
  if (!reviewDateDraft.value) return;
  emit("status", props.event.id, "REVIEW_PENDING", reviewDateDraft.value);
}

function updateWatchLevel(value: unknown): void {
  watchLevelDraft.value = watchLevelValue(value);
  emit("watch-state", props.event, watchLevelDraft.value);
}
</script>

<template>
  <section class="action-panel">
    <div class="action-panel-head">
      <div>
        <span>Action loop</span>
        <h3>跟进与复盘</h3>
      </div>
      <ElButton size="small" plain @click="emit('watch', event.id)">
        <Eye :size="14" />
        <span>观察</span>
      </ElButton>
    </div>

    <div class="action-grid">
      <label>
        <span>负责人</span>
        <ElInput
          :model-value="assigneeDraft"
          placeholder="Owner name"
          maxlength="120"
          clearable
          @update:model-value="assigneeDraft = stringValue($event)"
          @keyup.enter="saveAssignee"
        >
          <template #prefix>
            <UserRound :size="14" />
          </template>
          <template #append>
            <ElButton @click="saveAssignee">保存</ElButton>
          </template>
        </ElInput>
      </label>

      <label v-if="event.asin">
        <span>竞品等级</span>
        <ElSelect :model-value="watchLevelDraft" @update:model-value="updateWatchLevel">
          <ElOption v-for="option in watchOptions" :key="option.value" :label="option.label" :value="option.value" />
        </ElSelect>
      </label>
    </div>

    <div class="status-actions">
      <ElButtonGroup>
        <ElButton @click="emit('status', event.id, 'FOLLOWED')">
          <CheckCircle2 :size="14" />
          <span>已跟进</span>
        </ElButton>
        <ElButton @click="emit('status', event.id, 'IGNORED')">忽略</ElButton>
      </ElButtonGroup>
    </div>

    <label class="review-schedule-row">
      <span>下次复盘</span>
      <div>
        <ElDatePicker
          :model-value="reviewDateDraft"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择复盘日期"
          @update:model-value="reviewDateDraft = stringValue($event)"
        />
        <ElButton type="primary" :disabled="!reviewDateDraft" @click="scheduleReview">
          <CalendarClock :size="14" />
          <span>设置复盘</span>
        </ElButton>
      </div>
    </label>

    <label>
      <span>备注</span>
      <ElInput
        :model-value="noteDraft"
        type="textarea"
        :rows="4"
        placeholder="记录判断依据、下一步动作或复盘观察"
        @update:model-value="noteDraft = stringValue($event)"
      />
    </label>
    <ElButton class="save-note-button" plain @click="saveNote">
      <Save :size="14" />
      <span>保存备注</span>
    </ElButton>

    <div class="review-result-row">
      <ElSelect :model-value="reviewResult" @update:model-value="reviewResult = reviewResultValue($event)">
        <ElOption v-for="option in reviewOptions" :key="option.value" :label="option.label" :value="option.value" />
      </ElSelect>
      <ElButton type="primary" @click="emit('review', event.id, reviewResult, noteDraft)">标记复盘</ElButton>
    </div>
  </section>
</template>

<style scoped>
.action-panel {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
}

.action-panel-head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.action-panel-head span,
label > span {
  color: #64748b;
  display: block;
  font-size: 12px;
  font-weight: 600;
}

.action-panel-head h3 {
  color: #0f172a;
  font-size: 15px;
  margin: 3px 0 0;
}

.action-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.status-actions,
.save-note-button {
  justify-self: start;
}

.review-schedule-row > div,
.review-result-row {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
}

.action-panel :deep(.el-input__wrapper),
.action-panel :deep(.el-select__wrapper),
.action-panel :deep(.el-textarea__inner) {
  border-radius: 8px;
}

.action-panel :deep(.el-button span) {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.action-panel :deep(.el-date-editor.el-input) {
  width: 100%;
}

@media (max-width: 560px) {
  .action-grid,
  .review-schedule-row > div,
  .review-result-row {
    grid-template-columns: 1fr;
  }

  .status-actions,
  .save-note-button {
    justify-self: stretch;
  }
}
</style>
