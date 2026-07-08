/**
 * Workflow schema (Stage 1)
 *
 * Closes the "event → task → review → SOP" loop. Existing insight_events
 * table is untouched; we only add new tables that link from an event to a
 * task and from a task to a reusable SOP.
 *
 * Migration key: workflow_v1
 *
 * Tables:
 *   tasks             — assignable work items with 5-state lifecycle
 *   task_notes        — threaded comments on a task
 *   insight_event_tasks — many-to-many: an event may generate ≥1 task
 *   sops              — distilled best practices promoted from reviewed tasks
 *   sop_tags          — flat tag list (for matching during retrieval)
 */
export const workflowSchemaSql = `
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'P1',
  status TEXT NOT NULL DEFAULT 'pending',
  assignee_id INTEGER,
  due_date TEXT,
  related_asin TEXT,
  related_keyword TEXT,
  related_brand TEXT,
  related_category_id INTEGER,
  ai_recommendation TEXT,
  action_taken TEXT,
  result_before_json TEXT,
  result_after_json TEXT,
  review_note TEXT,
  review_result TEXT,
  promoted_to_sop_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_asin ON tasks(related_asin);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source_type, source_id);

CREATE TABLE IF NOT EXISTS task_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  author_id INTEGER,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_notes_task ON task_notes(task_id);

CREATE TABLE IF NOT EXISTS insight_event_tasks (
  event_id TEXT NOT NULL,
  task_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  body_md TEXT NOT NULL,
  source_task_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sops_category ON sops(category);
CREATE INDEX IF NOT EXISTS idx_sops_status ON sops(status);
`;
