import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { ActionProposal, AgentRun, AgentSession } from "@amazon-monitor/shared";
import { agentApi, type AgentSessionDetail, type StartAgentRunInput } from "../api-agent";

export const useAgentWorkspaceStore = defineStore("agentWorkspace", () => {
  const sessions = ref<AgentSession[]>([]);
  const selectedSession = ref<AgentSessionDetail | null>(null);
  const activeRun = ref<Awaited<ReturnType<typeof agentApi.getRun>> | null>(null);
  const actions = ref<ActionProposal[]>([]);
  const loading = ref(false);
  const submitting = ref(false);
  const actionLoadingId = ref<number | null>(null);
  const error = ref<string | null>(null);
  let unsubscribe: (() => void) | null = null;

  const selectedSessionId = computed(() => selectedSession.value?.id ?? null);

  async function fetchWorkspace(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      sessions.value = await agentApi.listSessions();
      actions.value = await agentApi.listActions();
      const id = selectedSessionId.value ?? sessions.value[0]?.id;
      if (id) await selectSession(id);
    } catch (cause) {
      error.value = (cause as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function createSession(title = "新的运营对话"): Promise<void> {
    const session = await agentApi.createSession(title);
    sessions.value = [session, ...sessions.value];
    await selectSession(session.id);
  }

  async function selectSession(id: number): Promise<void> {
    unsubscribe?.();
    unsubscribe = null;
    selectedSession.value = await agentApi.getSession(id);
    activeRun.value = null;
    const latest = selectedSession.value.runs[0];
    if (latest) await watchRun(latest);
  }

  async function startRun(input: StartAgentRunInput): Promise<void> {
    if (!selectedSession.value) await createSession();
    if (!selectedSession.value) return;
    submitting.value = true;
    error.value = null;
    try {
      const run = await agentApi.startRun(selectedSession.value.id, input);
      selectedSession.value.messages.push({
        id: -Date.now(),
        sessionId: selectedSession.value.id,
        runId: run.id,
        role: "user",
        content: input.input,
        createdAt: new Date().toISOString(),
      });
      selectedSession.value.runs.unshift(run);
      await watchRun(run);
    } catch (cause) {
      error.value = (cause as Error).message;
    } finally {
      submitting.value = false;
    }
  }

  async function watchRun(run: AgentRun): Promise<void> {
    unsubscribe?.();
    await refreshRun(run.id);
    if (!isTerminal(activeRun.value?.status)) {
      unsubscribe = agentApi.subscribeRun(run.id, () => void refreshRun(run.id));
    }
  }

  async function refreshRun(id: number): Promise<void> {
    activeRun.value = await agentApi.getRun(id);
    if (activeRun.value && isTerminal(activeRun.value.status)) {
      unsubscribe?.();
      unsubscribe = null;
      actions.value = await agentApi.listActions();
      if (selectedSession.value) {
        selectedSession.value = await agentApi.getSession(selectedSession.value.id);
      }
    }
  }

  async function approve(proposal: ActionProposal): Promise<void> {
    await act(proposal.id, async () => {
      await agentApi.approveAction(proposal.id, proposal.expectedVersion);
    });
  }
  async function reject(proposal: ActionProposal): Promise<void> {
    await act(proposal.id, async () => {
      await agentApi.rejectAction(proposal.id, proposal.expectedVersion);
    });
  }
  async function modify(proposal: ActionProposal, title: string): Promise<void> {
    await act(proposal.id, async () => {
      await agentApi.modifyAction(
        proposal.id,
        proposal.expectedVersion,
        title,
        proposal.payload,
      );
    });
  }
  async function execute(proposal: ActionProposal, confirmL3: boolean): Promise<void> {
    await act(proposal.id, async () => {
      await agentApi.executeAction(proposal.id, confirmL3);
    });
  }

  async function act(id: number, work: () => Promise<void>): Promise<void> {
    actionLoadingId.value = id;
    error.value = null;
    try {
      await work();
      actions.value = await agentApi.listActions();
      if (activeRun.value) await refreshRun(activeRun.value.id);
    } catch (cause) {
      error.value = (cause as Error).message;
    } finally {
      actionLoadingId.value = null;
    }
  }

  return {
    sessions,
    selectedSession,
    selectedSessionId,
    activeRun,
    actions,
    loading,
    submitting,
    actionLoadingId,
    error,
    fetchWorkspace,
    createSession,
    selectSession,
    startRun,
    approve,
    reject,
    modify,
    execute,
  };
});

function isTerminal(status: AgentRun["status"] | undefined): boolean {
  return status === undefined || [
    "completed", "failed", "cancelled", "waiting_approval",
  ].includes(status);
}
