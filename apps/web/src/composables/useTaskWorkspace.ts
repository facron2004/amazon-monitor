import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  AiRun,
  InsightEvent,
  Task,
  TaskExecutionInput,
  TaskPriority,
  TaskSopRecommendation,
  TaskStatus,
  TaskTeamPerformanceResponse,
  User,
} from "@amazon-monitor/shared";
import { listUsers } from "../api-auth.js";
import { getTaskTeamPerformance } from "../api-tasks.js";
import { useTaskStore } from "../stores/tasks.js";
import { toErrorMessage } from "../utils/error-message.js";
import {
  buildTaskWorkspaceSummary,
  groupTasksByStatus,
} from "../utils/task-workspace.js";
import { useWriteAccess } from "./useWriteAccess.js";

export function useTaskWorkspace() {
  const store = useTaskStore();
  const { tasks, loading, error } = storeToRefs(store);
  const { canWrite } = useWriteAccess();
  const { canWrite: canAssignTasks } = useWriteAccess("assign_tasks");

  const users = ref<User[]>([]);
  const selectedStatus = ref<TaskStatus | "all">("all");
  const selectedPriority = ref<TaskPriority | "all">("all");
  const detailTask = ref<Task | null>(null);
  const detailSourceEvent = ref<InsightEvent | null>(null);
  const detailSourceAiRun = ref<AiRun | null>(null);
  const detailSopRecommendations = ref<TaskSopRecommendation[]>([]);
  const detailLoading = ref(false);
  const executionTask = ref<Task | null>(null);
  const reviewTask = ref<Task | null>(null);
  const assignmentTask = ref<Task | null>(null);
  const noteTask = ref<Task | null>(null);
  const promoteTask = ref<Task | null>(null);
  const savingExecution = ref(false);
  const savingReview = ref(false);
  const savingAssignment = ref(false);
  const performanceDays = ref<7 | 30 | 90>(30);
  const performance = ref<TaskTeamPerformanceResponse | null>(null);
  const performanceLoading = ref(false);
  const performanceError = ref<string | null>(null);

  const filteredTasks = computed(() =>
    tasks.value.filter((task) => {
      if (
        selectedStatus.value !== "all" &&
        task.status !== selectedStatus.value
      )
        return false;
      return (
        selectedPriority.value === "all" ||
        task.priority === selectedPriority.value
      );
    }),
  );
  const tasksByStatus = computed(() => groupTasksByStatus(filteredTasks.value));
  const summary = computed(() => buildTaskWorkspaceSummary(tasks.value));
  const userNames = computed(
    () =>
      new Map(
        users.value.map((user) => [user.id, user.displayName || user.username]),
      ),
  );

  onMounted(() => {
    void refresh();
    void loadUsers();
  });

  watch(performanceDays, () => {
    if (canAssignTasks.value) void loadPerformance();
  });

  async function refresh(): Promise<void> {
    await Promise.all([
      store.fetchTasks(),
      canAssignTasks.value ? loadPerformance() : Promise.resolve(),
    ]);
  }

  async function loadUsers(): Promise<void> {
    try {
      users.value = (await listUsers()).filter(
        (user) => user.status === "active",
      );
    } catch (errorValue) {
      ElMessage.error(toErrorMessage(errorValue));
    }
  }

  async function loadPerformance(): Promise<void> {
    performanceLoading.value = true;
    performanceError.value = null;
    try {
      performance.value = await getTaskTeamPerformance(performanceDays.value);
    } catch (errorValue) {
      performanceError.value = toErrorMessage(errorValue);
    } finally {
      performanceLoading.value = false;
    }
  }

  async function claim(task: Task): Promise<void> {
    await transition(task, "in_progress", "已开始处理");
  }

  async function confirmDone(task: Task): Promise<void> {
    await transition(task, "done", "已标记完成");
  }

  async function transition(
    task: Task,
    status: TaskStatus,
    successMessage: string,
  ): Promise<void> {
    if (!canWrite.value) return;
    try {
      await store.transition(task.id, status);
      ElMessage.success(successMessage);
    } catch (errorValue) {
      ElMessage.error(toErrorMessage(errorValue));
    }
  }

  async function cancel(task: Task): Promise<void> {
    if (!canWrite.value) return;
    try {
      await ElMessageBox.confirm(
        `确定要取消任务「${task.title}」吗？`,
        "确认取消",
        {
          type: "warning",
        },
      );
      await store.transition(task.id, "cancelled");
      ElMessage.success("已取消");
    } catch (errorValue) {
      if (errorValue === "cancel" || errorValue === "close") return;
      ElMessage.error(toErrorMessage(errorValue));
    }
  }

  async function openDetail(task: Task): Promise<void> {
    detailTask.value = task;
    detailSourceEvent.value = null;
    detailSourceAiRun.value = null;
    detailSopRecommendations.value = [];
    detailLoading.value = true;
    try {
      const detail = await store.fetchDetail(task.id);
      if (detailTask.value?.id !== task.id) return;
      detailTask.value = detail.task;
      detailSourceEvent.value = detail.sourceEvent;
      detailSourceAiRun.value = detail.sourceAiRun;
      detailSopRecommendations.value = detail.sopRecommendations;
    } catch (errorValue) {
      ElMessage.error(toErrorMessage(errorValue));
    } finally {
      if (detailTask.value?.id === task.id) detailLoading.value = false;
    }
  }

  function closeDetail(): void {
    detailTask.value = null;
    detailSourceEvent.value = null;
    detailSourceAiRun.value = null;
    detailSopRecommendations.value = [];
    detailLoading.value = false;
  }

  async function submitExecution(input: TaskExecutionInput): Promise<void> {
    if (!executionTask.value || !canWrite.value) return;
    savingExecution.value = true;
    try {
      await store.submitExecution(executionTask.value.id, input);
      executionTask.value = null;
      ElMessage.success("执行记录已保存，任务已提交复核");
    } catch (errorValue) {
      ElMessage.error(toErrorMessage(errorValue));
    } finally {
      savingExecution.value = false;
    }
  }

  async function submitReview(
    result: NonNullable<Task["reviewResult"]>,
    note: string | undefined,
  ): Promise<void> {
    if (!reviewTask.value || !canWrite.value) return;
    savingReview.value = true;
    try {
      await store.review(reviewTask.value.id, result, note);
      reviewTask.value = null;
      ElMessage.success("已复盘");
    } catch (errorValue) {
      ElMessage.error(toErrorMessage(errorValue));
    } finally {
      savingReview.value = false;
    }
  }

  async function assignTask(assigneeId: number | null): Promise<void> {
    if (!assignmentTask.value || !canAssignTasks.value) return;
    savingAssignment.value = true;
    try {
      await store.assign(assignmentTask.value.id, assigneeId);
      assignmentTask.value = null;
      ElMessage.success("负责人已更新");
    } catch (errorValue) {
      ElMessage.error(toErrorMessage(errorValue));
    } finally {
      savingAssignment.value = false;
    }
  }

  return {
    tasks,
    loading,
    error,
    canWrite,
    canAssignTasks,
    users,
    selectedStatus,
    selectedPriority,
    filteredTasks,
    tasksByStatus,
    summary,
    userNames,
    detailTask,
    detailSourceEvent,
    detailSourceAiRun,
    detailSopRecommendations,
    detailLoading,
    executionTask,
    reviewTask,
    assignmentTask,
    noteTask,
    promoteTask,
    savingExecution,
    savingReview,
    savingAssignment,
    performanceDays,
    performance,
    performanceLoading,
    performanceError,
    refresh,
    loadPerformance,
    claim,
    confirmDone,
    cancel,
    openDetail,
    closeDetail,
    submitExecution,
    submitReview,
    assignTask,
  };
}
