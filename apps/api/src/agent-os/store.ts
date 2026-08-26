import type { DatabaseSync } from "node:sqlite";
import { createActionStore } from "./actions.js";
import { createGoalStore } from "./goals.js";
import { createMemoryStore } from "./memory.js";
import { initializeAgentOsSchema } from "./schema.js";
import { createWorkflowStore } from "./workflows.js";
import type { AgentOsPersistenceAdapter, AgentOsStore } from "./types.js";

/**
 * Self-contained adapter for the roadmap's Goal/Memory/Workflow/Action slice.
 * The host API only needs to pass its DatabaseSync connection; no existing
 * store factory or schema registration is required.
 */
export function createAgentOsStore(db: DatabaseSync): AgentOsStore {
  initializeAgentOsSchema(db);
  return {
    ...createGoalStore(db),
    ...createMemoryStore(db),
    ...createWorkflowStore(db),
    ...createActionStore(db),
  } satisfies AgentOsPersistenceAdapter;
}

export type { AgentOsPersistenceAdapter, AgentOsStore } from "./types.js";
