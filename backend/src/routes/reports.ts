import { Router } from "express";
import { db } from "../lib/db";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { toCsv } from "../lib/csv";
import { getFund, getActiveFundMembers, getFundTimeline, getFortuneOrder } from "../lib/fundCycle";
import { checkFundAccess } from "./funds";

const router = Router();

function addMonths(iso: string, months: number) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

router.get("/funds", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const funds = db.prepare("SELECT * FROM funds ORDER BY created_at DESC").all() as any[];
  const rows = funds.map((f) => {
    const members = getActiveFundMembers(f.id);
    const admin = f.admin_id ? (db.prepare("SELECT name FROM users WHERE id=?").get(f.admin_id) as any) : null;
    return {
      "Fund Name": f.name,
      Members: members.length,
      "Contribution Amount": f.contribution_amount,
      Currency: f.currency,
      "Start Date": f.start_date.slice(0, 10),
      "End Date": addMonths(f.start_date, f.duration_months),
      Admin: admin?.name || "—",
      Status: f.status,
    };
  });
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="fahi-fund-report.csv"');
    return res.send(toCsv(rows));
  }
  res.json(rows);
});

router.get("/funds/:id/monthly", authenticate, (req: AuthedRequest, res) => {
  const access = checkFundAccess(req, req.params.id);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  const timeline = getFundTimeline(req.params.id);
  const rows = timeline.map((m) => ({
    Month: m.monthNumber,
    "Expected Amount": m.expectedTotal,
    "Collected Amount": m.receivedTotal,
    "Pending Amount": m.expectedTotal - m.receivedTotal,
    Beneficiary: m.beneficiary?.name || "—",
    "Payout Amount": m.payout?.amount ?? "—",
    "Payout Status": m.status,
  }));
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fund.name.replace(/\s+/g, "-")}-monthly-report.csv"`);
    return res.send(toCsv(rows));
  }
  res.json(rows);
});

router.get("/funds/:id/members", authenticate, (req: AuthedRequest, res) => {
  const access = checkFundAccess(req, req.params.id);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  const members = getActiveFundMembers(req.params.id);
  const order = getFortuneOrder(req.params.id);
  const orderMap = new Map(order.map((o: any) => [o.member_id, o.position]));

  const rows = members.map((m: any) => {
    const payments = db.prepare("SELECT * FROM payments WHERE fund_id=? AND member_id=?").all(fund.id, m.user_id) as any[];
    const confirmed = payments.filter((p) => p.status === "CONFIRMED");
    const rejected = payments.filter((p) => p.status === "REJECTED");
    const payout = db.prepare("SELECT * FROM payouts WHERE fund_id=? AND beneficiary_id=? AND status='COMPLETED'").get(fund.id, m.user_id) as any;
    return {
      "Member Name": m.name,
      "Member Code": m.member_code,
      "Total Contributions Paid": confirmed.reduce((s, p) => s + p.amount, 0),
      "Payments Completed": confirmed.length,
      "Payment Delays (Rejections)": rejected.length,
      "Receiving Position": orderMap.get(m.user_id) ?? "—",
      "Amount Received": payout?.amount ?? 0,
    };
  });
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fund.name.replace(/\s+/g, "-")}-member-report.csv"`);
    return res.send(toCsv(rows));
  }
  res.json(rows);
});

export default router;
