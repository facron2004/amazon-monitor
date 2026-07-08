<script setup lang="ts">
import { computed } from "vue";
import { ElEmpty, ElSkeleton, ElTimeline, ElTimelineItem } from "element-plus";
import type { InsightEventNote } from "@amazon-monitor/shared";

const props = defineProps<{
  notes: InsightEventNote[];
  currentNote: string | null;
  loading: boolean;
}>();

interface TimelineNote {
  id: string;
  note: string;
  createdAt: string;
}

const timelineNotes = computed<TimelineNote[]>(() => {
  if (props.notes.length > 0) {
    return props.notes.map((note) => ({
      id: note.id,
      note: note.note,
      createdAt: note.createdAt
    }));
  }
  const currentNote = props.currentNote?.trim();
  return currentNote ? [{ id: "current-note", note: currentNote, createdAt: "" }] : [];
});

function formatTime(value: string): string {
  if (!value) return "当前备注";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
</script>

<template>
  <section class="note-timeline">
    <div class="section-head">
      <div>
        <span>Notes</span>
        <h3>备注时间线</h3>
      </div>
      <small>{{ timelineNotes.length }} 条</small>
    </div>

    <ElSkeleton v-if="loading" animated :rows="3" />
    <ElTimeline v-else-if="timelineNotes.length" class="timeline">
      <ElTimelineItem
        v-for="note in timelineNotes"
        :key="note.id"
        :timestamp="formatTime(note.createdAt)"
        placement="top"
      >
        <p>{{ note.note }}</p>
      </ElTimelineItem>
    </ElTimeline>
    <ElEmpty v-else description="暂无备注" :image-size="72" />
  </section>
</template>

<style scoped>
.note-timeline {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
}

.section-head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.section-head span,
.section-head small {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.section-head h3 {
  color: #0f172a;
  font-size: 15px;
  margin: 3px 0 0;
}

.timeline {
  padding-left: 2px;
}

.timeline :deep(.el-timeline-item__timestamp) {
  color: #64748b;
  font-size: 12px;
}

.timeline p {
  color: #334155;
  line-height: 1.55;
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
