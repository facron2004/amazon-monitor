<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { ElButton, ElCard, ElDialog, ElInput, ElMessage, ElMessageBox, ElOption, ElSelect, ElTag } from "element-plus";
import { BookOpen, CheckCircle2, ListTodo, Loader2, RefreshCw } from "@lucide/vue";
import {
  sopCategories,
  sopCategoryLabels,
  taskPriorities,
  taskStatuses,
  taskTypeLabels,
  type Sop,
  type Task,
  type TaskStatus
} from "@amazon-monitor/shared";
import { useSopStore } from "../stores/sops.js";
import { useTaskStore } from "../stores/tasks.js";

const store = useTaskStore();
const sopStore = useSopStore();
const { tasks, loading, error } = storeToRefs(store);

const STATUSES: TaskStatus[] = [...taskStatuses];
const selectedStatus = ref<TaskStatus | "all">("all");
const selectedPriority = ref<Task["priority"] | "all">("all");

const filteredTasks = computed<Task[]>(() => {
  return tasks.value.filter((t) => {
    if (selectedStatus.value !== "all" && t.status !== selectedStatus.value) return false;
    if (selectedPriority.value !== "all" && t.priority !== selectedPriority.value) return false;
    return true;
  });
});

const tasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
  const map: Record<TaskStatus, Task[]> = {
    pending: [],
    in_progress: [],
    awaiting_review: [],
    done: [],
    reviewed: [],
    cancelled: []
  };
  for (const t of filteredTasks.value) {
    map[t.status].push(t);
  }
  return map;
});

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "待处理",
  in_progress: "进行中",
  awaiting_review: "待复核",
  done: "已完成",
  reviewed: "已复盘",
  cancelled: "已取消"
};

const PRIORITY_COLORS: Record<Task["priority"], "danger" | "warning" | "info" | "primary"> = {
  P0: "danger",
  P1: "warning",
  P2: "info",
  P3: "primary"
};

const SOP_CATEGORY_BY_TASK_TYPE: Partial<Record<Task["taskType"], Sop["category"]>> = {
  price: "price_action",
  coupon: "price_action",
  ad: "ad_optimization",
  listing: "listing_optimization",
  image: "listing_optimization",
  inventory: "inventory_replenishment",
  competitor: "competitor_response",
  review: "review_response",
  supplier: "supplier_negotiation",
  campaign_recap: "competitor_response"
};

const noteOpen = ref(false);
const noteTaskId = ref<number | null>(null);
const noteBody = ref("");
const notes = ref<{ id: number; body: string; createdAt: string }[]>([]);
const savingNote = ref(false);

const reviewOpen = ref(false);
const reviewTaskId = ref<number | null>(null);
const reviewResult = ref<Task["reviewResult"]>("CONFIRMED");
const reviewNote = ref("");

const promoteOpen = ref(false);
const promoteTask = ref<Task | null>(null);
const promoteTitle = ref("");
const promoteCategory = ref<Sop["category"]>("general");
const promoteBody = ref("");
const promoteTags = ref("");
const savingSop = ref(false);

async function refresh(): Promise<void> {
  await store.fetchTasks();
}

onMounted(refresh);

async function claim(t: Task): Promise<void> {
  try {
    await store.transition(t.id, "in_progress");
    ElMessage.success("已开始处理");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function submit(t: Task): Promise<void> {
  try {
    await store.transition(t.id, "awaiting_review");
    ElMessage.success("已提交复核");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function confirmDone(t: Task): Promise<void> {
  try {
    await store.transition(t.id, "done");
    ElMessage.success("已标记完成");
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

function openNotes(t: Task): void {
  noteTaskId.value = t.id;
  noteBody.value = "";
  notes.value = [];
  noteOpen.value = true;
  void store.fetchNotes(t.id).then((n) => { notes.value = n; });
}

async function postNote(): Promise<void> {
  if (noteTaskId.value === null || !noteBody.value.trim()) return;
  savingNote.value = true;
  try {
    const n = await store.addNote(noteTaskId.value, noteBody.value.trim());
    notes.value = [...notes.value, n];
    noteBody.value = "";
    ElMessage.success("已添加备注");
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    savingNote.value = false;
  }
}

function openReview(t: Task): void {
  reviewTaskId.value = t.id;
  reviewResult.value = "CONFIRMED";
  reviewNote.value = "";
  reviewOpen.value = true;
}

async function submitReview(): Promise<void> {
  if (reviewTaskId.value === null) return;
  try {
    await store.review(reviewTaskId.value, reviewResult.value, reviewNote.value || undefined);
    ElMessage.success("已复盘");
    reviewOpen.value = false;
  } catch (err) {
    ElMessage.error((err as Error).message);
  }
}

async function cancel(t: Task): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定要取消任务「${t.title}」吗？`, "确认取消", { type: "warning" });
    await store.transition(t.id, "cancelled");
    ElMessage.success("已取消");
  } catch (err) {
    if ((err as Error).message === "cancel") return;
    ElMessage.error((err as Error).message);
  }
}

function canPromoteToSop(t: Task): boolean {
  return (t.status === "done" || t.status === "reviewed") && t.promotedToSopId === null;
}

function buildSopDraft(t: Task): string {
  const target = [
    t.relatedAsin ? `- ASIN：${t.relatedAsin}` : null,
    t.relatedBrand ? `- 品牌：${t.relatedBrand}` : null,
    t.relatedKeyword ? `- 关键词：${t.relatedKeyword}` : null
  ].filter((line): line is string => line !== null);

  const lines = [
    `# ${t.title}`,
    "",
    "## 适用场景",
    t.description || "待补充",
    "",
    "## 触发对象",
    ...(target.length ? target : ["待补充"]),
    "",
    "## AI 建议",
    t.aiRecommendation || "待补充",
    "",
    "## 执行动作",
    t.actionTaken || "待补充",
    "",
    "## 指标变化"
  ];

  if (t.resultBeforeJson) {
    lines.push("执行前：", "```json", t.resultBeforeJson, "```");
  }
  if (t.resultAfterJson) {
    lines.push("执行后：", "```json", t.resultAfterJson, "```");
  }
  if (!t.resultBeforeJson && !t.resultAfterJson) {
    lines.push("待补充");
  }

  lines.push(
    "",
    "## 复盘结论",
    t.reviewNote || "待补充",
    "",
    "## 下次执行检查项",
    "- 核对证据是否仍然成立",
    "- 记录负责人、动作和完成时间",
    "- 复盘关键指标变化"
  );

  return lines.join("\n");
}

function openPromote(t: Task): void {
  promoteTask.value = t;
  promoteTitle.value = `SOP｜${t.title}`;
  promoteCategory.value = SOP_CATEGORY_BY_TASK_TYPE[t.taskType] ?? "general";
  promoteTags.value = [t.taskType, t.relatedAsin, t.relatedBrand]
    .filter((tag): tag is string => Boolean(tag))
    .join(", ");
  promoteBody.value = buildSopDraft(t);
  promoteOpen.value = true;
}

async function createSopFromTask(): Promise<void> {
  if (!promoteTask.value || !promoteTitle.value.trim() || !promoteBody.value.trim()) {
    ElMessage.warning("请填写 SOP 标题和正文");
    return;
  }
  savingSop.value = true;
  try {
    const sop = await sopStore.createSop({
      title: promoteTitle.value.trim(),
      category: promoteCategory.value,
      bodyMd: promoteBody.value.trim(),
      sourceTaskId: promoteTask.value.id,
      tags: promoteTags.value.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0)
    });
    await store.fetchTasks();
    promoteOpen.value = false;
    ElMessage.success(`已沉淀为 SOP #${sop.id}`);
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    savingSop.value = false;
  }
}
</script>

<template>
  <div class="tasks-view">
    <header class="tasks-view__header">
      <h2>任务看板</h2>
      <div class="tasks-view__filters">
        <ElSelect v-model="selectedStatus" placeholder="状态" style="width: 140px" clearable>
          <ElOption label="全部状态" value="all" />
          <ElOption v-for="s in STATUSES" :key="s" :label="STATUS_LABELS[s]" :value="s" />
        </ElSelect>
        <ElSelect v-model="selectedPriority" placeholder="优先级" style="width: 120px" clearable>
          <ElOption label="全部优先级" value="all" />
          <ElOption v-for="p in taskPriorities" :key="p" :label="p" :value="p" />
        </ElSelect>
        <ElButton @click="refresh" :loading="loading">
          <template #icon><RefreshCw :size="14" /></template>
          刷新
        </ElButton>
      </div>
    </header>

    <p v-if="error" class="tasks-view__error">{{ error }}</p>

    <div v-if="loading && !tasks.length" class="tasks-view__loading">
      <Loader2 :size="20" class="spin" /> 加载中…
    </div>

    <div class="tasks-view__board">
      <section v-for="s in STATUSES" :key="s" class="tasks-view__column">
        <header class="tasks-view__column-header">
          <span class="tasks-view__column-title">{{ STATUS_LABELS[s] }}</span>
          <ElTag size="small">{{ tasksByStatus[s].length }}</ElTag>
        </header>
        <ElCard
          v-for="t in tasksByStatus[s]"
          :key="t.id"
          class="tasks-view__card"
          shadow="hover"
        >
          <header class="tasks-view__card-header">
            <ElTag :type="PRIORITY_COLORS[t.priority]" size="small">{{ t.priority }}</ElTag>
            <ElTag size="small" type="info">{{ taskTypeLabels[t.taskType] ?? t.taskType }}</ElTag>
          </header>
          <h4 class="tasks-view__card-title">{{ t.title }}</h4>
          <p v-if="t.description" class="tasks-view__card-desc">{{ t.description.slice(0, 100) }}{{ t.description.length > 100 ? '…' : '' }}</p>
          <footer class="tasks-view__card-footer">
            <span v-if="t.relatedAsin" class="tasks-view__card-meta">ASIN: {{ t.relatedAsin }}</span>
            <span v-if="t.relatedBrand" class="tasks-view__card-meta">品牌: {{ t.relatedBrand }}</span>
            <span v-if="t.dueDate" class="tasks-view__card-meta">截止: {{ t.dueDate }}</span>
          </footer>
          <div class="tasks-view__actions">
            <ElButton v-if="t.status === 'pending'" size="small" type="primary" @click="claim(t)">认领</ElButton>
            <ElButton v-if="t.status === 'in_progress'" size="small" type="primary" @click="submit(t)">提交复核</ElButton>
            <ElButton v-if="t.status === 'awaiting_review'" size="small" type="success" @click="confirmDone(t)">确认完成</ElButton>
            <ElButton v-if="t.status === 'awaiting_review'" size="small" type="primary" @click="openReview(t)">复盘</ElButton>
            <ElButton v-if="t.status === 'done'" size="small" type="primary" @click="openReview(t)">复盘</ElButton>
            <ElButton v-if="canPromoteToSop(t)" size="small" type="success" plain @click="openPromote(t)">
              <template #icon><BookOpen :size="12" /></template>
              沉淀 SOP
            </ElButton>
            <ElTag v-if="t.promotedToSopId" size="small" type="success">SOP #{{ t.promotedToSopId }}</ElTag>
            <ElButton size="small" @click="openNotes(t)">备注</ElButton>
            <ElButton v-if="t.status === 'pending' || t.status === 'in_progress'" size="small" type="danger" plain @click="cancel(t)">取消</ElButton>
          </div>
        </ElCard>
        <p v-if="!tasksByStatus[s].length" class="tasks-view__column-empty">
          <ListTodo :size="14" /> 暂无任务
        </p>
      </section>
    </div>

    <ElDialog v-model="noteOpen" title="任务备注" width="520px">
      <p v-if="notes.length" class="tasks-view__note-list">
        <span v-for="n in notes" :key="n.id" class="tasks-view__note-item">
          <CheckCircle2 :size="12" /> {{ n.body }} <small>{{ n.createdAt }}</small>
        </span>
      </p>
      <p v-else class="tasks-view__note-empty">暂无备注</p>
      <ElInput v-model="noteBody" type="textarea" :rows="3" placeholder="添加备注…" />
      <template #footer>
        <ElButton @click="noteOpen = false">关闭</ElButton>
        <ElButton type="primary" :loading="savingNote" @click="postNote">添加</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="reviewOpen" title="复盘任务" width="480px">
      <ElSelect v-model="reviewResult" placeholder="复盘结果" style="width: 100%">
        <ElOption label="判断成立" value="CONFIRMED" />
        <ElOption label="短期冲榜后回落" value="REVERTED" />
        <ElOption label="仍在持续" value="CONTINUING" />
        <ElOption label="机会消失" value="FAILED" />
        <ElOption label="数据不足" value="UNCLEAR" />
      </ElSelect>
      <ElInput v-model="reviewNote" type="textarea" :rows="3" placeholder="复盘备注（可选）" style="margin-top: 12px" />
      <template #footer>
        <ElButton @click="reviewOpen = false">取消</ElButton>
        <ElButton type="primary" @click="submitReview">提交</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="promoteOpen" title="沉淀为 SOP" width="680px">
      <ElInput v-model="promoteTitle" placeholder="SOP 标题" style="margin-bottom: 12px" />
      <ElSelect v-model="promoteCategory" placeholder="分类" style="width: 100%; margin-bottom: 12px">
        <ElOption v-for="c in sopCategories" :key="c" :label="sopCategoryLabels[c]" :value="c" />
      </ElSelect>
      <ElInput v-model="promoteTags" placeholder="标签（逗号分隔）" style="margin-bottom: 12px" />
      <ElInput v-model="promoteBody" type="textarea" :rows="14" placeholder="SOP 正文（Markdown）" />
      <template #footer>
        <ElButton @click="promoteOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="savingSop" @click="createSopFromTask">创建草稿</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.tasks-view { padding: 16px; }
.tasks-view__header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.tasks-view__header h2 { margin: 0; font-size: 18px; }
.tasks-view__filters { margin-left: auto; display: flex; gap: 8px; }
.tasks-view__error { color: #d03050; }
.tasks-view__loading { display: flex; gap: 8px; align-items: center; padding: 16px; color: #909399; }
.tasks-view__board { display: grid; grid-template-columns: repeat(6, minmax(220px, 1fr)); gap: 12px; overflow-x: auto; }
.tasks-view__column { background: #f7f8fa; border-radius: 6px; padding: 8px; min-height: 200px; }
.tasks-view__column-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 0 4px; }
.tasks-view__column-title { font-weight: 600; font-size: 13px; }
.tasks-view__column-empty { display: flex; align-items: center; gap: 4px; justify-content: center; color: #c0c4cc; font-size: 12px; padding: 16px 0; }
.tasks-view__card { margin-bottom: 8px; }
.tasks-view__card-header { display: flex; gap: 4px; margin-bottom: 4px; }
.tasks-view__card-title { margin: 0 0 4px 0; font-size: 13px; font-weight: 600; }
.tasks-view__card-desc { margin: 0 0 4px 0; font-size: 12px; color: #606266; line-height: 1.4; }
.tasks-view__card-footer { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.tasks-view__card-meta { font-size: 11px; color: #909399; }
.tasks-view__actions { display: flex; flex-wrap: wrap; gap: 4px; }
.tasks-view__note-list { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; }
.tasks-view__note-item { display: flex; align-items: center; gap: 4px; font-size: 13px; }
.tasks-view__note-empty { color: #909399; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
