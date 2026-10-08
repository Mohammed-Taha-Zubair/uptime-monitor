import { monitorService } from "../services/monitor.service";
import { probeService } from "../services/probe.service";
import { alertService } from "../services/alert.service";
import { config } from "../config";

let isRunning = false;
let stopRequested = false;

/**
 * Executes a single probe iteration over active monitors due for a check.
 */
export async function runProbeIteration(): Promise<number> {
  try {
    const dueMonitors = await monitorService.getMonitorsDueForCheck(config.probeConcurrency);
    if (dueMonitors.length === 0) {
      return 0;
    }

    console.log(`[Worker] Enqueued ${dueMonitors.length} monitor probe(s)...`);

    // Process probes concurrently up to concurrency limit
    await Promise.allSettled(
      dueMonitors.map(async (monitor) => {
        try {
          const probeResult = await probeService.executeProbe(
            monitor.url,
            config.probeTimeoutMs
          );
          const evaluation = await alertService.processProbeResult(monitor, probeResult);

          if (evaluation.notified) {
            console.log(`[Worker] State transition for #${monitor.id} (${monitor.name}): ${evaluation.transition}`);
          }
        } catch (err) {
          console.error(`[Worker] Error probing monitor #${monitor.id}:`, err);
        }
      })
    );

    return dueMonitors.length;
  } catch (err) {
    console.error("[Worker] Error in probe iteration:", err);
    return 0;
  }
}

/**
 * Continuous loop for background worker execution.
 */
export async function startProbeWorkerLoop(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  stopRequested = false;

  console.log(`[Worker] Health-check probe worker started (Interval: ${config.workerIntervalMs}ms, Concurrency: ${config.probeConcurrency})`);

  while (!stopRequested) {
    await runProbeIteration();
    await new Promise((resolve) => setTimeout(resolve, config.workerIntervalMs));
  }

  console.log("[Worker] Probe worker gracefully stopped.");
  isRunning = false;
}

export function stopProbeWorker(): void {
  stopRequested = true;
}

// Standalone execution when run directly via CLI
if (require.main === module) {
  startProbeWorkerLoop().catch((err) => {
    console.error("[Worker] Fatal error:", err);
    process.exit(1);
  });

  const handleShutdown = () => {
    console.log("\n[Worker] Received termination signal, shutting down...");
    stopProbeWorker();
    setTimeout(() => process.exit(0), 1000);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}
