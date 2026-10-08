import { Router, Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

export const usersRouter = Router();

// Ensure all user routes require a valid JWT token
usersRouter.use(authMiddleware);

// Schema for updating user settings (e.g. Telegram chat ID)
const updateMeSchema = z.object({
  telegram_chat_id: z.string().trim().nullable(),
});

// GET /me — Returns the profile of the currently logged-in user
usersRouter.get("/me", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, telegram_chat_id, created_at FROM users WHERE id = $1",
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /me — Update telegram_chat_id for alert notifications
usersRouter.patch("/me", async (req: AuthenticatedRequest, res: Response) => {
  const parseResult = updateMeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.issues[0].message });
    return;
  }

  const { telegram_chat_id } = parseResult.data;

  try {
    const result = await pool.query(
      `UPDATE users
       SET telegram_chat_id = $1
       WHERE id = $2
       RETURNING id, name, email, telegram_chat_id, created_at`,
      [telegram_chat_id, req.user!.id]
    );

    res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error("PATCH /me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
