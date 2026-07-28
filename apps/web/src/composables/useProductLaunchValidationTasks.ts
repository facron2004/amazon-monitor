import { computed, ref, type Ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  AiProductLaunchBrief,
  AiProductLaunchValidationTasksResponse
} from "@amazon-monitor/shared";
import { aiApi } from "../api-ai";
import { useTaskStore } from "../stores/tasks";

interface ProductLaunchValidationTaskSource {
  brief: AiProductLaunchBrief;
  runId?: number;
}

export function useProductLaunchValidationTasks(
  source: Readonly<ProductLaunchValidationTaskSource>
): {
  creatingTasks: Ref<boolean>;
  validationTasks: Ref<AiProductLaunchValidationTasksResponse | null>;
  requiredGateCount: Readonly<Ref<number>>;
  createValidationTasks: () => Promise<void>;
} {
  const taskStore = useTaskStore();
  const creatingTasks = ref(false);
  const validationTasks = ref<AiProductLaunchValidationTasksResponse | null>(null);
  const requiredGateCount = computed(
    () => source.brief.validationChecklist.filter((item) => item.gate === "required").length
  );

  async function createValidationTasks(): Promise<void> {
    if (!source.runId || creatingTasks.value) return;
    try {
      await ElMessageBox.confirm(
        `将从本草案创建 ${requiredGateCount.value} 项待验证任务。创建任务不代表批准立项，所有证据仍需人工执行和复核。`,
        "创建立项验证任务",
        {
          confirmButtonText: "确认创建",
          cancelButtonText: "取消",
          type: "warning"
        }
      );
    } catch {
      return;
    }

    creatingTasks.value = true;
    try {
      const result = await aiApi.createProductLaunchValidationTasks(source.runId);
      validationTasks.value = result;
      taskStore.mergeTasks(result.tasks);
      ElMessage.success(
        result.createdCount > 0
          ? `已创建 ${result.createdCount} 项立项验证任务。`
          : `${result.existingCount} 项立项验证任务已存在，未重复创建。`
      );
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    } finally {
      creatingTasks.value = false;
    }
  }

  return {
    creatingTasks,
    validationTasks,
    requiredGateCount,
    createValidationTasks
  };
}
