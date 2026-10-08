import { Router, Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

export const monitorsRouter = Router();

// Protect all monitor endpoints: user can only access their own monitors
monitorsRouter.use(authMiddleware);

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  url: z.string().trim().url("Must be a valid URL").refine(
    (u) => u.startsWith("http://") || u.startsWith("https://"),
    { message: "URL must start with http:// or https://" }
  ),
  interval_seconds: z.union([z.literal(60), z.literal(3600), z.literal(86400)]),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  url: z.string().trim().url().refine(
    (u) => u.startsWith("http://") || u.startsWith("https://"),
    { message: "URL must start with http:// or https://" }
  ).optional(),
  interval_seconds: z.union([z.literal(60), z.literal(3600), z.literal(86400)]).optional(),
  is_active: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided to update",
});

// Helper: validate integer ID from request params
function parseId(param: string): number | null {
  const id = parseInt(param, 10);
  return Number.isNaN(id) ? null : id;
}

// POST /monitors — Create a new monitor
monitorsRouter.post("/", async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { name, url, interval_seconds } = parsed.data;
  try {
    const result = await pool.query(
      `INSERT INTO monitors (user_id, name, url, interval_seconds)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user!.id, name, url, interval_seconds]
    );
    res.status(201).json({ monitor: result.rows[0] });
  } catch (err) {
    console.error("Create monitor error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /monitors — List all monitors belonging to the logged-in user
monitorsRouter.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM monitors WHERE user_id = $1 ORDER BY id DESC",
      [req.user!.id]
    );
    res.status(200).json({ monitors: result.rows });
  } catch (err) {
    console.error("List monitors error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /monitors/:id — Get a single monitor by ID
monitorsRouter.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid monitor ID" });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT * FROM monitors WHERE id = $1 AND user_id = $2",
      [id, req.user!.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Monitor not found" });
      return;
    }
    res.status(200).json({ monitor: result.rows[0] });
  } catch (err) {
    console.error("Get monitor error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /monitors/:id — Update monitor properties
monitorsRouter.patch("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid monitor ID" });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  try {
    const existing = await pool.query(
      "SELECT * FROM monitors WHERE id = $1 AND user_id = $2",
      [id, req.user!.id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Monitor not found" });
      return;
    }

    const current = existing.rows[0];
    const name = parsed.data.name ?? current.name;
    const url = parsed.data.url ?? current.url;
    const interval_seconds = parsed.data.interval_seconds ?? current.interval_seconds;
    const is_active = parsed.data.is_active ?? current.is_active;

    const updated = await pool.query(
      `UPDATE monitors
       SET name = $1, url = $2, interval_seconds = $3, is_active = $4
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [name, url, interval_seconds, is_active, id, req.user!.id]
    );
    res.status(200).json({ monitor: updated.rows[0] });
  } catch (err) {
    console.error("Update monitor error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /monitors/:id — Delete a monitor
monitorsRouter.delete("/:id", async (req: AuthenticatedRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid monitor ID" });
    return;
  }

  try {
    const result = await pool.query(
      "DELETE FROM monitors WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, req.user!.id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Monitor not found" });
      return;
    }
    res.status(200).json({ message: "Monitor deleted successfully" });
  } catch (err) {
    console.error("Delete monitor error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
