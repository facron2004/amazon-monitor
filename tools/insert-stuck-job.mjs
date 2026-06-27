import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("E:/Program/Amazon/data/amazon-monitor.sqlite");

// Simulate a stuck 'processing' job (e.g., previous worker died).
const now = new Date().toISOString();
const result = db.prepare(`
  INSERT INTO amazon_collect_job_queue (task_type, target_id, date, status, created_at, started_at)
  VALUES (?, ?, ?, 'processing', ?, ?)
`).run("category", 1, "2026-06-25", now, now);

const job = db.prepare(`SELECT * FROM amazon_collect_job_queue WHERE id = ?`).get(Number(result.lastInsertRowid));
console.log("Inserted stuck job:", JSON.stringify(job, null, 2));