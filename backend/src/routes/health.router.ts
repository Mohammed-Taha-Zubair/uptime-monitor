import { Router, Request, Response } from "express";
import { pool } from "../db";

export const healthRouter = Router();

healthRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT NOW() AS now;");
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        connected: true,
        dbTime: result.rows[0].now,
      },
    });
  } catch (error: any) {
    res.status(503).json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error.message,
      },
    });
  }
});
