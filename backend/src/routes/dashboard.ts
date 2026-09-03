import { Router } from "express";
import { db } from "../lib/db";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { getCurrentMonthNumber, getMonthSummary } from "../lib/fundCycle";

const router = Router();

router.get("/super-admin", authenticate, authorize("SUPER_ADMIN"), (_req: AuthedRequest, res) => {
  const totalFunds = (db.prepare("SELECT COUNT(*) as c FROM funds").get() as any).c;
  const activeFunds = (db.prepare("SELECT COUNT(*) as c FROM funds WHERE status='ACTIVE'").get() as any).c;
  const totalMembers = (db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM fund_members WHERE status='ACTIVE'").get() as any).c;

  const activeFundRows = db.prepare("SELECT * FROM funds WHERE status='ACTIVE'").all() as any[];
  let totalMonthlyContributions = 0;
  let pendingPayments = 0;
  let pendingPayouts = 0;
  for (const f of activeFundRows) {
    const month = getCurrentMonthNumber(f.id);
    if (month > f.duration_months) continue;
    const summary = getMonthSummary(f.id, month);
    totalMonthlyContributions += summary.expectedTotal;
    pendingPayments += summary.pendingCount;
    if (summary.status === "READY_FOR_PAYOUT") pendingPayouts += 1;
  }

  res.json({ totalFunds, activeFunds, totalMembers, totalMonthlyContributions, pendingPayments, pendingPayouts });
});

export default router;
