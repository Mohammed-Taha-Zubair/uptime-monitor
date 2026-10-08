import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl: process.env.DATABASE_URL || "postgres://uptime:uptime_dev_pw@localhost:5432/uptime_monitor",
  probeTimeoutMs: parseInt(process.env.PROBE_TIMEOUT_MS || "10000", 10),
  workerIntervalMs: parseInt(process.env.PROBE_SCHEDULER_INTERVAL_MS || "5000", 10),
  probeConcurrency: parseInt(process.env.PROBE_CONCURRENCY || "10", 10),
  enableInternalWorker: process.env.ENABLE_INTERNAL_WORKER === "true",
};
