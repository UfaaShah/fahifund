import { db } from "./db";
import { newId } from "./ids";

export function logAudit(params: {
  userId?: string | null;
  fundId?: string | null;
  action: string;
  description: string;
}) {
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, fund_id, action, description) VALUES (?, ?, ?, ?, ?)`
  ).run(newId(), params.userId ?? null, params.fundId ?? null, params.action, params.description);
}
