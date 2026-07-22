<script setup lang="ts">
import { Loader2 } from "@lucide/vue";
import ReadOnlyNotice from "./ReadOnlyNotice.vue";
import TaskAssignmentDialog from "./tasks/TaskAssignmentDialog.vue";
import TaskBoardPanel from "./tasks/TaskBoardPanel.vue";
import TaskDetailDrawer from "./tasks/TaskDetailDrawer.vue";
import TaskExecutionDialog from "./tasks/TaskExecutionDialog.vue";
import TaskNotesDialog from "./tasks/TaskNotesDialog.vue";
import TaskReviewDialog from "./tasks/TaskReviewDialog.vue";
import TaskSopDialog from "./tasks/TaskSopDialog.vue";
import TaskWorkspaceHeader from "./tasks/TaskWorkspaceHeader.vue";
import { useTaskWorkspace } from "../composables/useTaskWorkspace.js";

const workspace = useTaskWorkspace();
</script>

<template>
  <main class="tasks-view">
    <TaskWorkspaceHeader
      v-model:status="workspace.selectedStatus.value"
      v-model:priority="workspace.selectedPriority.value"
      :summary="workspace.summary.value"
      :loading="workspace.loading.value"
      :can-export="workspace.canWrite.value"
      @refresh="workspace.refresh"
    />

    <ReadOnlyNotice v-if="!workspace.canWrite.value" />

    <div v-if="workspace.error.value" class="task-workspace-error" role="alert">
      <span>{{ workspace.error.value }}</span>
      <button type="button" @click="workspace.refresh">重试</button>
    </div>

    <div
      v-if="workspace.loading.value && workspace.tasks.value.length === 0"
      class="task-workspace-loading"
    >
      <Loader2 :size="20" class="spinning" />
      <span>正在加载任务</span>
    </div>

    <TaskBoardPanel
      v-else
      :groups="workspace.tasksByStatus.value"
      :user-names="workspace.userNames.value"
      :can-write="workspace.canWrite.value"
      :can-assign="workspace.canAssignTasks.value"
      @detail="workspace.openDetail"
      @claim="workspace.claim"
      @execute="workspace.executionTask.value = $event"
      @complete="workspace.confirmDone"
      @review="workspace.reviewTask.value = $event"
      @promote="workspace.promoteTask.value = $event"
      @notes="workspace.noteTask.value = $event"
      @assign="workspace.assignmentTask.value = $event"
      @cancel="workspace.cancel"
    />

    <p
      v-if="
        !workspace.loading.value && workspace.filteredTasks.value.length === 0
      "
      class="task-workspace-empty"
    >
      当前筛选下暂无任务
    </p>

    <TaskDetailDrawer
      :task="workspace.detailTask.value"
      :source-event="workspace.detailSourceEvent.value"
      :source-ai-run="workspace.detailSourceAiRun.value"
      :loading="workspace.detailLoading.value"
      @close="workspace.closeDetail"
    />
    <TaskExecutionDialog
      :task="workspace.executionTask.value"
      :saving="workspace.savingExecution.value"
      @close="workspace.executionTask.value = null"
      @submit="workspace.submitExecution"
    />
    <TaskReviewDialog
      :task="workspace.reviewTask.value"
      :saving="workspace.savingReview.value"
      @close="workspace.reviewTask.value = null"
      @submit="workspace.submitReview"
    />
    <TaskAssignmentDialog
      :task="workspace.assignmentTask.value"
      :users="workspace.users.value"
      :saving="workspace.savingAssignment.value"
      @close="workspace.assignmentTask.value = null"
      @submit="workspace.assignTask"
    />
    <TaskNotesDialog
      :task="workspace.noteTask.value"
      :can-write="workspace.canWrite.value"
      @close="workspace.noteTask.value = null"
    />
    <TaskSopDialog
      :task="workspace.promoteTask.value"
      :can-write="workspace.canWrite.value"
      @close="workspace.promoteTask.value = null"
    />
  </main>
</template>
