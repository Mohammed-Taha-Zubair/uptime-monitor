import "dotenv/config";
import express from "express";
import { config } from "./config";
import { pool } from "./db";
import { healthRouter } from "./routes/health.router";
import { monitorsRouter } from "./routes/monitors.router";
import { incidentsRouter } from "./routes/incidents.router";
import { errorHandler } from "./middlewares/errorHandler";
import { startProbeWorkerLoop, stopProbeWorker } from "./worker/probeWorker";

const app = express();

// Core Middleware
app.use(express.json());

// Request logging in development
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
  });
}

// Modular REST API Routes
app.use("/health", healthRouter);
app.use("/monitors", monitorsRouter);
app.use("/incidents", incidentsRouter);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global Error Handler
app.use(errorHandler);

// Server startup
const server = app.listen(config.port, () => {
  console.log(`🚀 Uptime Monitor API running on http://localhost:${config.port}`);

  if (config.enableInternalWorker) {
    console.log("⚡ Starting internal probe worker scheduler...");
    startProbeWorkerLoop().catch((err) => {
      console.error("Internal probe worker failed:", err);
    });
  }
});

// Graceful Shutdown
const shutdown = async (signal: string) => {
  console.log(`\n[Server] ${signal} signal received: closing HTTP server and pool...`);
  stopProbeWorker();
  server.close(async () => {
    console.log("[Server] HTTP server closed.");
    try {
      await pool.end();
      console.log("[Server] Database connection pool drained.");
      process.exit(0);
    } catch (err) {
      console.error("[Server] Error closing pool:", err);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { app };
