import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection, MONITOR_QUEUE_NAME } from "../queue/queue";
import { executeCheck } from "./executeCheck";
import { startSchedulerLoop } from "./scheduler";

// Concurrency determines how many HTTP checks run simultaneously
const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);

console.log(`Starting Uptime Monitor Worker with concurrency = ${concurrency}...`);

export const worker = new Worker(
  MONITOR_QUEUE_NAME,
  async (job) => {
    const { monitorId } = job.data;

    /**
     * Important architecture note:
     * A down website is a normal RESULT, not a job failure.
     * executeCheck handles timeouts, offline sites, and 500 errors safely without throwing.
     * Only unexpected internal errors (e.g. database connection lost) will throw,
     * triggering BullMQ's automatic retry mechanism (attempts: 3, exponential backoff).
     */
    await executeCheck(monitorId);
  },
  {
    connection: redisConnection,
    concurrency,
  }
);

worker.on("ready", () => {
  console.log("Worker connected to Redis and listening for check jobs.");
});

worker.on("failed", (job, err) => {
  console.error(`Check job ${job?.id} failed unexpectedly:`, err);
});

// Start background scheduler loop (checks for due monitors every 15s)
const schedulerInterval = startSchedulerLoop(15000);

// Graceful shutdown handler
async function handleShutdown() {
  console.log("Gracefully stopping worker and scheduler...");
  clearInterval(schedulerInterval);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
