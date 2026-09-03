import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/auth";
import { db } from "../lib/db";

export interface AuthedRequest extends Request {
  user?: JwtPayload & { status: string };
}

export function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyToken(token);
    const row = db
      .prepare("SELECT status FROM users WHERE id = ?")
      .get(payload.userId) as { status: string } | undefined;
    if (!row) return res.status(401).json({ error: "User no longer exists" });
    if (row.status === "SUSPENDED") {
      return res.status(403).json({ error: "This account has been suspended" });
    }
    req.user = { ...payload, status: row.status };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function authorize(...roles: Array<"SUPER_ADMIN" | "ADMIN" | "USER">) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }
    next();
  };
}
