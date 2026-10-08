import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Structure of user data decoded from a signed JWT token
export interface AuthUser {
  id: number;
  email: string;
}

// Extend standard Express Request so route handlers have access to req.user
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * authMiddleware:
 * Protects private endpoints. Expects an 'Authorization: Bearer <token>' header.
 * If valid, attaches req.user = { id, email } and lets the request continue.
 * If missing, malformed, or invalid/expired, responds with 401 Unauthorized.
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.substring(7); // Strip 'Bearer ' prefix
  const secret = process.env.JWT_SECRET || "dev-secret-key-change-in-production";

  try {
    const decoded = jwt.verify(token, secret) as AuthUser;
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch (_err) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
}
