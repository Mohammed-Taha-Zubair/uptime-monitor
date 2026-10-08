import { Queue } from "bullmq";
import IORedis from "ioredis";

// Redis connection options for BullMQ
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// BullMQ requires maxRetriesPerRequest: null
export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const MONITOR_QUEUE_NAME = "monitor-checks";

// Export the singleton queue instance
export const monitorQueue = new Queue(MONITOR_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});
