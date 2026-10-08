import { Router, Response } from "express";
import { pool } from "../db";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

export const monitorStatsRouter = Router();

// Ensure all telemetry routes require authentication
monitorStatsRouter.use(authMiddleware);

// Helper: parse ID from URL params
function parseId(param: string): number | null {
  const id = parseInt(param, 10);
  return Number.isNaN(id) ? null : id;
}

// Helper: check if monitor exists and belongs to the authenticated user
async function verifyMonitorOwnership(monitorId: number, userId: number): Promise<boolean> {
  const check = await pool.query(
    "SELECT id FROM monitors WHERE id = $1 AND user_id = $2",
    [monitorId, userId]
  );
  return check.rows.length > 0;
}

// GET /monitors/:id/checks?limit= — Retrieve recent check results
monitorStatsRouter.get("/:id/checks", async (req: AuthenticatedRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid monitor ID" });
    return;
  }

  let limit = 50;
  if (req.query.limit !== undefined) {
    const parsedLimit = parseInt(req.query.limit as string, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
      res.status(400).json({ error: "Limit must be a number between 1 and 100" });
      return;
    }
    limit = parsedLimit;
  }

  try {
    const isOwner = await verifyMonitorOwnership(id, req.user!.id);
    if (!isOwner) {
      res.status(404).json({ error: "Monitor not found" });
      return;
    }

    const result = await pool.query(
      `SELECT id, monitor_id, is_up, status_code, response_ms, error, checked_at
       FROM check_results
       WHERE monitor_id = $1
       ORDER BY checked_at DESC
       LIMIT $2`,
      [id, limit]
    );

    res.status(200).json({ checks: result.rows });
  } catch (err) {
    console.error("GET checks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /monitors/:id/incidents — Outage incident history
monitorStatsRouter.get("/:id/incidents", async (req: AuthenticatedRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid monitor ID" });
    return;
  }

  try {
    const isOwner = await verifyMonitorOwnership(id, req.user!.id);
    if (!isOwner) {
      res.status(404).json({ error: "Monitor not found" });
      return;
    }

    const result = await pool.query(
      `SELECT id, monitor_id, started_at, ended_at
       FROM incidents
       WHERE monitor_id = $1
       ORDER BY started_at DESC`,
      [id]
    );

    res.status(200).json({ incidents: result.rows });
  } catch (err) {
    console.error("GET incidents error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /monitors/:id/open-incident — Check if there is an active outage right now
monitorStatsRouter.get("/:id/open-incident", async (req: AuthenticatedRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid monitor ID" });
    return;
  }

  try {
    const isOwner = await verifyMonitorOwnership(id, req.user!.id);
    if (!isOwner) {
      res.status(404).json({ error: "Monitor not found" });
      return;
    }

    const result = await pool.query(
      `SELECT id, monitor_id, started_at, ended_at
       FROM incidents
       WHERE monitor_id = $1 AND ended_at IS NULL
       LIMIT 1`,
      [id]
    );

    res.status(200).json({ incident: result.rows[0] ?? null });
  } catch (err) {
    console.error("GET open-incident error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /monitors/:id/uptime?days=30 — Calculate uptime percentage over a time window
monitorStatsRouter.get("/:id/uptime", async (req: AuthenticatedRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid monitor ID" });
    return;
  }

  let days = 30;
  if (req.query.days !== undefined) {
    const parsedDays = parseInt(req.query.days as string, 10);
    if (Number.isNaN(parsedDays) || parsedDays <= 0 || parsedDays > 365) {
      res.status(400).json({ error: "Days must be a number between 1 and 365" });
      return;
    }
    days = parsedDays;
  }

  try {
    const isOwner = await verifyMonitorOwnership(id, req.user!.id);
    if (!isOwner) {
      res.status(404).json({ error: "Monitor not found" });
      return;
    }

    // Use SQL COUNT(*) FILTER for clean and fast aggregation directly in Postgres
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total_checks,
         COUNT(*) FILTER (WHERE is_up = true)::int AS up_checks,
         ROUND(
           COALESCE(
             (COUNT(*) FILTER (WHERE is_up = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
             100.0
           ),
           2
         )::float AS uptime_percentage
       FROM check_results
       WHERE monitor_id = $1
         AND checked_at >= NOW() - ($2 || ' days')::interval`,
      [id, days]
    );

    const stats = result.rows[0];
    res.status(200).json({
      uptimePercentage: stats.uptime_percentage,
      totalChecks: stats.total_checks,
      upChecks: stats.up_checks,
      days,
    });
  } catch (err) {
    console.error("GET uptime error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
