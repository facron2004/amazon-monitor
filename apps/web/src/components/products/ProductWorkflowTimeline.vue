<script setup lang="ts">
import { computed } from "vue";
import { ElButton, ElTag } from "element-plus";
import { ArrowRight, BrainCircuit, CheckCircle2, ClipboardList, Radio } from "@lucide/vue";
import {
  insightEventTypeLabels,
  taskStatusLabels,
  type OwnedProductOperationsDetail,
} from "@amazon-monitor/shared";
import type { TabKey } from "../../constants/tabs";
import { agentLabels } from "../ai-agents/ai-agent-display";

const props = defineProps<{ operations: OwnedProductOperationsDetail }>();
const emit = defineEmits<{ navigate: [tab: TabKey] }>();

const reviewedTasks = computed(() => props.operations.tasks.filter((task) => task.status === "reviewed"));
const openTasks = computed(() => props.operations.tasks.filter((task) => (
  task.status !== "reviewed" && task.status !== "cancelled"
)));
</script>

<template>
  <section class="product-operations-section product-workflow">
    <div class="product-operations-section__head">
      <div>
        <h3>Agent 建议</h3>
        <p>与当前 SKU 直接关联或已转任务的运行</p>
      </div>
      <ElButton text size="small" @click="emit('navigate', 'ai-agents')">
        Agent 中心
        <template #icon><ArrowRight :size="13" /></template>
      </ElButton>
    </div>
    <div v-if="operations.agentRuns.length" class="product-workflow-list">
      <article v-for="run in operations.agentRuns" :key="run.id">
        <BrainCircuit :size="17" />
        <div>
          <span>{{ agentLabels[run.agentType] }} · Run #{{ run.id }}</span>
          <strong>{{ run.summary || run.status }}</strong>
          <small>
            {{ run.createdAt.slice(0, 16).replace("T", " ") }}
            · 置信度 {{ run.confidence === null ? "—" : `${Math.round(run.confidence * 100)}%` }}
            · {{ run.actionCount }} 项动作
          </small>
        </div>
        <ElTag size="small" :type="run.status === 'success' ? 'success' : 'danger'">
          {{ run.status === "success" ? "成功" : "失败" }}
        </ElTag>
      </article>
    </div>
    <p v-else class="product-inline-state">该 SKU 尚未产生 Listing 或 Review Agent 运行。</p>

    <div class="product-operations-section__head product-workflow__subhead">
      <div>
        <h3>任务记录</h3>
        <p>{{ openTasks.length }} 项进行中 · {{ reviewedTasks.length }} 项已复盘</p>
      </div>
      <ElButton text size="small" @click="emit('navigate', 'tasks')">
        任务中心
        <template #icon><ArrowRight :size="13" /></template>
      </ElButton>
    </div>
    <div v-if="operations.tasks.length" class="product-workflow-list">
      <article v-for="task in operations.tasks.slice(0, 8)" :key="task.id">
        <ClipboardList :size="17" />
        <div>
          <span>{{ task.priority }} · {{ taskStatusLabels[task.status] }}</span>
          <strong>{{ task.title }}</strong>
          <small>{{ task.updatedAt.slice(0, 16).replace("T", " ") }}</small>
        </div>
        <ElTag size="small" effect="plain">{{ taskStatusLabels[task.status] }}</ElTag>
      </article>
    </div>
    <p v-else class="product-inline-state">当前 SKU 尚未进入任务执行链路。</p>

    <div class="product-operations-section__head product-workflow__subhead">
      <div>
        <h3>异常与复盘</h3>
        <p>证据事件、人工动作和结果判断</p>
      </div>
      <ElButton text size="small" @click="emit('navigate', 'action-center')">
        事件中心
        <template #icon><ArrowRight :size="13" /></template>
      </ElButton>
    </div>
    <div v-if="operations.events.length || reviewedTasks.length" class="product-workflow-list">
      <article v-for="event in operations.events.slice(0, 5)" :key="event.id">
        <Radio :size="17" />
        <div>
          <span>{{ event.eventDate }} · {{ event.eventLevel }}</span>
          <strong>{{ insightEventTypeLabels[event.eventType] }}</strong>
          <small>{{ event.eventSummary }}</small>
        </div>
        <ElTag size="small" :type="event.eventLevel === 'P0' ? 'danger' : 'warning'">
          {{ event.eventLevel }}
        </ElTag>
      </article>
      <article v-for="task in reviewedTasks.slice(0, 5)" :key="`review-${task.id}`">
        <CheckCircle2 :size="17" />
        <div>
          <span>{{ task.reviewedAt?.slice(0, 10) ?? "已复盘" }} · 任务 #{{ task.id }}</span>
          <strong>{{ task.reviewResult || "已复盘" }}</strong>
          <small>{{ task.reviewNote || task.actionTaken || "未补充复盘说明" }}</small>
        </div>
        <ElTag size="small" type="success">复盘</ElTag>
      </article>
    </div>
    <p v-else class="product-inline-state">尚无异常事件或已确认的操作复盘。</p>
  </section>
</template>
