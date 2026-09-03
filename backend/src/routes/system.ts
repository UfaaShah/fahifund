import { Router } from "express";
import { db } from "../lib/db";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router = Router();

const CONFIRM_PHRASE = "DELETE ALL DATA";

/**
 * Super-Admin-only factory reset: wipes every fund, member, payment, payout,
 * notification, audit log entry and bank account — everything the demo seed
 * created plus anything added since — while always preserving every
 * SUPER_ADMIN account so nobody gets locked out (there is no public signup
 * flow, so a deleted last Super Admin would be unrecoverable without shell
 * access to the database).
 */
router.post("/reset-demo-data", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  if (req.body?.confirm !== CONFIRM_PHRASE) {
    return res.status(400).json({ error: `Type "${CONFIRM_PHRASE}" exactly to confirm.` });
  }

  // Order matters: SQLite enforces the REFERENCES constraints declared in
  // schema.sql, so every child row referencing a fund or user has to go
  // before that fund/user row is deleted — including audit_logs, whose
  // fund_id/user_id columns would otherwise block deleting the very
  // fund/user they describe.
  const wipe = db.transaction(() => {
    db.prepare("DELETE FROM payments").run();
    db.prepare("DELETE FROM payouts").run();
    db.prepare("DELETE FROM fortune_orders").run();
    db.prepare("DELETE FROM fund_members").run();
    db.prepare("DELETE FROM audit_logs").run();
    db.prepare("DELETE FROM notifications").run();
    db.prepare("DELETE FROM bank_accounts").run();
    db.prepare("DELETE FROM password_resets").run();
    db.prepare("DELETE FROM funds").run();
    db.prepare("DELETE FROM users WHERE role != 'SUPER_ADMIN'").run();
  });
  wipe();

  logAudit({
    userId: req.user!.userId,
    action: "SYSTEM_RESET",
    description: "Super Admin reset the system — all funds, members, and demo data were permanently removed.",
  });

  res.json({ success: true });
});

export default router;
