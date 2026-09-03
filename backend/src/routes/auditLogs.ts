import { Router } from "express";
import { db } from "../lib/db";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fundId = req.query.fundId as string | undefined;
  let rows: any[];
  if (fundId) {
    rows = db
      .prepare(
        `SELECT al.*, u.name as user_name, f.name as fund_name FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id LEFT JOIN funds f ON f.id = al.fund_id
         WHERE al.fund_id = ? ORDER BY al.created_at DESC LIMIT 500`
      )
      .all(fundId) as any[];
  } else {
    rows = db
      .prepare(
        `SELECT al.*, u.name as user_name, f.name as fund_name FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id LEFT JOIN funds f ON f.id = al.fund_id
         ORDER BY al.created_at DESC LIMIT 500`
      )
      .all() as any[];
  }
  res.json(
    rows.map((r) => ({
      id: r.id,
      action: r.action,
      description: r.description,
      userName: r.user_name,
      fundName: r.fund_name,
      createdAt: r.created_at,
    }))
  );
});

export default router;
