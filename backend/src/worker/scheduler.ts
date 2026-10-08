import { pool } from "../db";
import { monitorQueue } from "../queue/queue";

/**
 * scheduleDueChecks:
 * Queries all active monitors whose check interval has passed, then enqueues
 * a BullMQ job for each monitor.
 *
 * Deduplication:
 * By passing jobId = `monitor-${id}`, BullMQ will silently ignore adding a new job
 * if a job with the same ID is already waiting or currently active in the queue.
 */
export async function scheduleDueChecks(): Promise<number> {
  const query = `
    SELECT id
    FROM monitors
    WHERE is_active = TRUE
      AND (
        last_checked_at IS NULL
        OR last_checked_at + interval_seconds * interval '1 second' <= NOW()
      )
  `;

  try {
    const result = await pool.query(query);
    const dueMonitors = result.rows;

    for (const monitor of dueMonitors) {
      await monitorQueue.add(
        "check-monitor",
        { monitorId: monitor.id },
        {
          jobId: `monitor-${monitor.id}`,
        }
      );
    }

    return dueMonitors.length;
  } catch (err) {
    console.error("Scheduler error querying due monitors:", err);
    return 0;
  }
}

/**
 * startSchedulerLoop:
 * Runs scheduleDueChecks every 15 seconds.
 */
export function startSchedulerLoop(intervalMs = 15000): NodeJS.Timeout {
  // Fire once on startup
  scheduleDueChecks().catch((err) => console.error("Initial schedule run failed:", err));

  return setInterval(() => {
    scheduleDueChecks().catch((err) => console.error("Scheduled check run failed:", err));
  }, intervalMs);
}
