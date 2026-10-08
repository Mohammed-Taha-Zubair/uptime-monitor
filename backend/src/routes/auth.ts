import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db";

export const authRouter = Router();

// Zod schemas for input validation
const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50, "Name cannot exceed 50 characters"),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Helper to sign JWT tokens
function createToken(userId: number, email: string): string {
  const secret = process.env.JWT_SECRET || "dev-secret-key-change-in-production";
  return jwt.sign({ id: userId, email }, secret, { expiresIn: "7d" });
}

// POST /auth/signup
authRouter.post("/signup", async (req: Request, res: Response) => {
  const parseResult = signupSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.issues[0].message });
    return;
  }

  const { name, email, password } = parseResult.data;

  try {
    // Check if the email is already in use
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: "Email is already registered" });
      return;
    }

    // Hash the password with bcrypt (salt rounds = 10)
    const passwordHash = await bcrypt.hash(password, 10);

    const insertResult = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, telegram_chat_id, created_at`,
      [name, email, passwordHash]
    );

    const user = insertResult.rows[0];
    const token = createToken(user.id, user.email);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/login
authRouter.post("/login", async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.issues[0].message });
    return;
  }

  const { email, password } = parseResult.data;

  try {
    const userResult = await pool.query(
      "SELECT id, name, email, password_hash, telegram_chat_id, created_at FROM users WHERE email = $1",
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      res.status(400).json({ error: "Invalid email or password" });
      return;
    }

    // Compare provided password with bcrypt hash
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      res.status(400).json({ error: "Invalid email or password" });
      return;
    }

    const token = createToken(user.id, user.email);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        telegram_chat_id: user.telegram_chat_id,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
