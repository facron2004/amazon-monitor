import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("E:/Program/Amazon/data/amazon-monitor.sqlite");

// Push a fresh category job for target_id=1 (Ice makers), today's date.
const today = new Date().toISOString().slice(0, 10);

const existing = db.prepare(`
  SELECT * FROM amazon_collect_job_queue
  WHERE task_type = ? AND target_id = ? AND date = ? AND status IN ('pending','processing')
`).get("category", 1, today);

if (existing) {
  console.log("Already pending/processing job:", JSON.stringify(existing));
  process.exit(0);
}

const now = new Date().toISOString();
const result = db.prepare(`
  INSERT INTO amazon_collect_job_queue (task_type, target_id, date, status, created_at)
  VALUES (?, ?, ?, 'pending', ?)
`).run("category", 1, today, now);

const job = db.prepare(`SELECT * FROM amazon_collect_job_queue WHERE id = ?`).get(Number(result.lastInsertRowid));
console.log("Pushed:", JSON.stringify(job, null, 2));