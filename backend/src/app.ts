import express from "express";
import cors from "cors";
import { pool } from "./db";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { monitorsRouter } from "./routes/monitors";
import { monitorStatsRouter } from "./routes/monitorStats";

export const app = express();

// Enable Cross-Origin Resource Sharing for frontend access
app.use(cors());

// Parse incoming JSON request bodies
app.use(express.json());

// Public health check endpoint
app.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.status(200).json({ status: "ok", dbTime: result.rows[0].now });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ status: "error", error: "Database unreachable" });
  }
});

// Mount modular route handlers
app.use("/auth", authRouter);
app.use("/", usersRouter); // provides /me
app.use("/monitors", monitorsRouter);
app.use("/monitors", monitorStatsRouter);
