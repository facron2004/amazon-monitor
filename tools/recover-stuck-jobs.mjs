import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("E:/Program/Amazon/data/amazon-monitor.sqlite");

const before = db.prepare(`
  SELECT id, task_type, target_id, status, started_at FROM amazon_collect_job_queue WHERE status = 'processing'
`).all();
console.log("Stuck processing jobs:", JSON.stringify(before, null, 2));

const now = new Date().toISOString();
const result = db.prepare(`
  UPDATE amazon_collect_job_queue
  SET status = 'failed', completed_at = ?, error_message = ?
  WHERE status = 'processing'
`).run(now, "服务重启，前次 Worker 进程被回收，任务被回收");

console.log(`Recovered ${result.changes} stuck job(s).`);

const after = db.prepare(`
  SELECT id, task_type, status, completed_at, error_message FROM amazon_collect_job_queue WHERE id = ?
`).all(before[0]?.id);
console.log("After:", JSON.stringify(after, null, 2));