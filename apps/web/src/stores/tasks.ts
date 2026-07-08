import { defineStore } from "pinia";
import { ref } from "vue";
import type { Task, TaskNote, TaskStatus } from "@amazon-monitor/shared";
import * as api from "../api-tasks.js";

export const useTaskStore = defineStore("tasks", () => {
  const tasks = ref<Task[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchTasks(filter: { status?: TaskStatus; statusIn?: TaskStatus[]; priority?: Task["priority"] } = {}): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      tasks.value = await api.listTasks(filter);
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function createTask(input: api.CreateTaskInput): Promise<Task> {
    const t = await api.createTask(input);
    tasks.value = [t, ...tasks.value];
    return t;
  }

  async function transition(id: number, status: TaskStatus): Promise<Task> {
    const t = await api.transitionTask(id, status);
    const idx = tasks.value.findIndex((x) => x.id === id);
    if (idx >= 0) tasks.value[idx] = t;
    return t;
  }

  async function review(id: number, result: Task["reviewResult"], note?: string): Promise<Task> {
    const t = await api.reviewTask(id, result, note);
    const idx = tasks.value.findIndex((x) => x.id === id);
    if (idx >= 0) tasks.value[idx] = t;
    return t;
  }

  async function addNote(id: number, body: string): Promise<TaskNote> {
    return api.addTaskNote(id, body);
  }

  async function fetchNotes(id: number): Promise<TaskNote[]> {
    return api.listTaskNotes(id);
  }

  return { tasks, loading, error, fetchTasks, createTask, transition, review, addNote, fetchNotes };
});
