<script setup lang="ts">
import { computed } from "vue";
import {
  CheckCircle2,
  ClipboardPlus,
  Eye,
  FileText,
  Info,
  ListChecks,
  LoaderCircle,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  XCircle
} from "@lucide/vue";
import {
  insightEventTypeLabels,
  type AiActionFeedbackValue,
  type AiDailyBriefResponse,
  type InsightEvent,
  type InsightEventStatus
} from "@amazon-monitor/shared";
import InsightScoreBadge from "./action-center/InsightScoreBadge.vue";
import OverviewTopActionsFilters from "./OverviewTopActionsFilters.vue";
import { useWriteAccess } from "../composables/useWriteAccess";
import {
  describeOverviewEvent,
  overviewActionIconFor
} from "../utils/overview-action-presentation";

const { canWrite } = useWriteAccess("manage_workflow");
const { canWrite: canGenerateReport } = useWriteAccess("manage_reports");

const props = defineProps<{
  events: InsightEvent[];
  loading: boolean;
  dailyBrief: AiDailyBriefResponse | null;
  dailyBriefLoading: boolean;
  dailyBriefFeedbackLoadingKey: string | null;
  eventBusyId: string | null;
  dailyReportGenerating: boolean;
  dailyReportReady: boolean;
}>();

const emit = defineEmits<{
  (event: "open-asin", value: InsightEvent): void;
  (event: "convert-to-task", value: InsightEvent): void;
  (event: "status", value: InsightEvent, status: Extract<InsightEventStatus, "FOLLOWED" | "IGNORED">): void;
  (event: "generate-daily-brief"): void;
  (event: "daily-brief-feedback", actionIndex: number, value: AiActionFeedbackValue): void;
  (event: "generate-daily-report"): void;
}>();

const briefConfidence = computed(() => Math.round((props.dailyBrief?.output.confidence ?? 0) * 100));
const briefEvidence = computed(() => props.dailyBrief?.output.evidence.slice(0, 3) ?? []);
const briefActions = computed(() => props.dailyBrief?.output.recommended_actions.slice(0, 5) ?? []);

function feedbackFor(actionIndex: number): AiActionFeedbackValue | null {
  return props.dailyBrief?.run.actionFeedback.find((item) => item.actionIndex === actionIndex)?.value ?? null;
}

function feedbackLoadingKey(actionIndex: number): string | null {
  return props.dailyBrief ? `${props.dailyBrief.run.id}:${actionIndex}` : null;
}
</script>

<template>
  <section class="top-actions-panel">
    <header class="top-actions-head">
      <ListChecks :size="18" />
      <div>
        <span>今日必看</span>
        <h2>今日必须关注 {{ events.length }} 件事</h2>
      </div>
      <div class="top-actions-commands">
        <button
          v-if="canGenerateReport"
          class="report-button"
          type="button"
          :disabled="dailyReportGenerating"
          @click="emit('generate-daily-report')"
        >
          <FileText :size="15" />
          <span>{{ dailyReportGenerating ? "生成中" : dailyReportReady ? "重新生成日报" : "生成日报" }}</span>
        </button>
        <button v-if="canWrite" class="agent-button" type="button" :disabled="dailyBriefLoading" @click="emit('generate-daily-brief')">
          <Sparkles :size="15" />
          <span>{{ dailyBriefLoading ? "Agent running" : "Agent brief" }}</span>
        </button>
      </div>
    </header>

    <OverviewTopActionsFilters />

    <section v-if="dailyBrief" class="agent-brief">
      <div class="brief-main">
        <div class="brief-kicker">
          <span>Daily Operator Agent</span>
          <strong>{{ briefConfidence }}%</strong>
        </div>
        <h3>{{ dailyBrief.output.summary }}</h3>
        <p>{{ dailyBrief.output.impact }}</p>
      </div>
      <ul class="brief-evidence">
        <li v-for="item in briefEvidence" :key="item">{{ item }}</li>
      </ul>
      <ol class="brief-actions">
        <li v-for="(action, actionIndex) in briefActions" :key="`${action.priority}-${action.action}`">
          <span :class="['level-pill', `level-pill-${action.priority}`]">{{ action.priority }}</span>
          <div class="brief-action-copy">
            <strong>{{ action.action }}</strong>
            <p>{{ action.reason }}</p>
          </div>
          <div v-if="canWrite" class="brief-action-feedback" aria-label="建议反馈">
            <button
              type="button"
              title="这条建议有帮助"
              aria-label="这条建议有帮助"
              :aria-pressed="feedbackFor(actionIndex) === 'up'"
              :class="{ active: feedbackFor(actionIndex) === 'up' }"
              :disabled="dailyBriefFeedbackLoadingKey !== null"
              @click="emit('daily-brief-feedback', actionIndex, 'up')"
            >
              <LoaderCircle
                v-if="dailyBriefFeedbackLoadingKey === feedbackLoadingKey(actionIndex)"
                :size="14"
                class="feedback-spinner"
              />
              <ThumbsUp v-else :size="14" />
            </button>
            <button
              type="button"
              title="这条建议需要改进"
              aria-label="这条建议需要改进"
              :aria-pressed="feedbackFor(actionIndex) === 'down'"
              :class="{ active: feedbackFor(actionIndex) === 'down' }"
              :disabled="dailyBriefFeedbackLoadingKey !== null"
              @click="emit('daily-brief-feedback', actionIndex, 'down')"
            >
              <LoaderCircle
                v-if="dailyBriefFeedbackLoadingKey === feedbackLoadingKey(actionIndex)"
                :size="14"
                class="feedback-spinner"
              />
              <ThumbsDown v-else :size="14" />
            </button>
          </div>
        </li>
      </ol>
    </section>

    <div v-if="loading" class="top-actions-loading">正在汇总今日关键事件...</div>

    <div v-else-if="events.length === 0" class="top-actions-empty">
      <Info :size="24" />
      <p>今日暂无重点事件。系统会在新事件触发时自动汇总。</p>
      <small>提示：先到 Action Center 点击「生成洞察」刷新事件池。</small>
    </div>

    <ol v-else class="top-actions-list">
      <li class="top-actions-table-head" aria-hidden="true">
        <span>序号</span>
        <span>类型</span>
        <span>事项 / 原因 / 建议</span>
        <span>操作</span>
      </li>
      <li v-for="(event, index) in events" :key="event.id" :class="['top-action-card', `level-${event.eventLevel}`]">
        <div class="rank">{{ index + 1 }}</div>
        <component :is="overviewActionIconFor(event.eventType)" :size="22" class="action-icon" />
        <div class="action-body">
          <div class="action-topline">
            <span :class="['level-pill', `level-pill-${event.eventLevel}`]">{{ event.eventLevel }}</span>
            <span class="event-type">{{ insightEventTypeLabels[event.eventType] }}</span>
            <InsightScoreBadge :score="event.scoreTotal" :level="event.scoreLevel" compact />
          </div>
          <h3>{{ event.brand || "未知品牌" }} · {{ event.asin || "品牌事件" }}</h3>
          <p v-if="describeOverviewEvent(event)">{{ describeOverviewEvent(event) }}</p>
          <p v-if="event.suggestedAction" class="suggested">建议：{{ event.suggestedAction }}</p>
        </div>
        <div class="action-buttons">
          <button class="action-button action-button-detail" type="button" title="查看事件详情" @click="emit('open-asin', event)">
            <Eye :size="14" />
            <span>详情</span>
          </button>
          <template v-if="canWrite">
            <button
              class="action-button action-button-primary"
              type="button"
              title="转为执行任务"
              :disabled="eventBusyId !== null"
              @click="emit('convert-to-task', event)"
            >
              <ClipboardPlus :size="14" />
              <span>转任务</span>
            </button>
            <button
              class="action-button action-button-icon"
              type="button"
              title="标记为已跟进"
              aria-label="标记为已跟进"
              :disabled="eventBusyId !== null"
              @click="emit('status', event, 'FOLLOWED')"
            >
              <CheckCircle2 :size="15" />
            </button>
            <button
              class="action-button action-button-icon action-button-muted"
              type="button"
              title="忽略事件"
              aria-label="忽略事件"
              :disabled="eventBusyId !== null"
              @click="emit('status', event, 'IGNORED')"
            >
              <XCircle :size="15" />
            </button>
          </template>
        </div>
      </li>
    </ol>
  </section>
</template>

<style src="../styles/overview-top-actions.css" scoped></style>
