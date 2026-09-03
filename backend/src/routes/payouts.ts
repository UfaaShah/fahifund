import { Router } from "express";
import { db } from "../lib/db";
import { newId } from "../lib/ids";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { upload, publicUploadPath } from "../middleware/upload";
import { logAudit } from "../lib/audit";
import { notify, notifyMany } from "../lib/notify";
import { getFund, getCurrentMonthNumber, getMonthSummary, getActiveFundMembers } from "../lib/fundCycle";
import { checkFundAccess } from "./funds";

const router = Router({ mergeParams: true });

router.get("/current", authenticate, (req: AuthedRequest, res) => {
  const fundId = req.params.fundId;
  const access = checkFundAccess(req, fundId);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  const fund = getFund(fundId);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  const currentMonth = getCurrentMonthNumber(fundId);
  if (currentMonth > fund.duration_months) return res.json({ fundCompleted: true });
  res.json(getMonthSummary(fundId, currentMonth));
});

router.get("/", authenticate, (req: AuthedRequest, res) => {
  const fundId = req.params.fundId;
  const access = checkFundAccess(req, fundId);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  const rows = db
    .prepare(
      `SELECT po.*, u.name as beneficiary_name, u.member_code as beneficiary_code
       FROM payouts po JOIN users u ON u.id = po.beneficiary_id
       WHERE po.fund_id = ? ORDER BY po.month_number ASC`
    )
    .all(fundId);
  res.json(rows);
});

router.post(
  "/:monthNumber/complete",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN"),
  upload.single("proof"),
  (req: AuthedRequest, res) => {
    const fundId = req.params.fundId;
    const fund = getFund(fundId);
    if (!fund) return res.status(404).json({ error: "Fund not found" });
    if (req.user!.role === "ADMIN" && fund.admin_id !== req.user!.userId) {
      return res.status(403).json({ error: "Only this fund's assigned Admin can complete its payouts" });
    }
    const monthNumber = parseInt(req.params.monthNumber, 10);
    const summary = getMonthSummary(fundId, monthNumber);
    if (!summary.beneficiary) return res.status(400).json({ error: "No Fortune order beneficiary found for this month" });

    const override = req.user!.role === "SUPER_ADMIN" && req.body?.override === "true";
    if (summary.paidCount < summary.expectedMembers && !override) {
      return res.status(400).json({ error: "Collection is not complete yet. Only Super Admin can override this." });
    }
    const existingPayout = db.prepare("SELECT * FROM payouts WHERE fund_id=? AND month_number=?").get(fundId, monthNumber) as any;
    if (existingPayout?.status === "COMPLETED") {
      return res.status(400).json({ error: "This month's payout has already been completed" });
    }

    const receiptPath = req.file ? publicUploadPath(req.file.filename) : null;
    const payoutDate = req.body?.payoutDate || new Date().toISOString();
    const referenceNumber = req.body?.referenceNumber || null;
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      if (existingPayout) {
        db.prepare(
          `UPDATE payouts SET status='COMPLETED', payout_date=?, reference_number=?, receipt_path=?, completed_by_id=?, completed_at=? WHERE id=?`
        ).run(payoutDate, referenceNumber, receiptPath, req.user!.userId, now, existingPayout.id);
      } else {
        db.prepare(
          `INSERT INTO payouts (id, fund_id, month_number, beneficiary_id, amount, payout_date, reference_number, receipt_path, status, completed_by_id, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`
        ).run(newId(), fundId, monthNumber, summary.beneficiary!.id, summary.expectedTotal, payoutDate, referenceNumber, receiptPath, req.user!.userId, now);
      }
      if (monthNumber >= fund.duration_months) {
        db.prepare("UPDATE funds SET status='COMPLETED' WHERE id=?").run(fundId);
      }
    });
    tx();

    logAudit({
      userId: req.user!.userId,
      fundId,
      action: "COMPLETE_PAYOUT",
      description: `Admin completed month ${monthNumber} payout of ${fund.currency} ${summary.expectedTotal} to ${summary.beneficiary.name}${override ? " (Super Admin override — collection was incomplete)" : ""}`,
    });

    notify({
      userId: summary.beneficiary.id,
      title: "Payout completed",
      message: `Month ${monthNumber}'s fund of ${fund.currency} ${summary.expectedTotal} has been paid to you.`,
      type: "SUCCESS",
    });

    if (monthNumber >= fund.duration_months) {
      const members = getActiveFundMembers(fundId);
      notifyMany(members.map((m) => m.user_id), {
        title: "Fund completed",
        message: `"${fund.name}" is complete — every member has received their scheduled fund.`,
        type: "SUCCESS",
      });
      logAudit({ fundId, action: "FUND_COMPLETED", description: `All ${fund.duration_months} months of "${fund.name}" are complete` });
    } else {
      const members = getActiveFundMembers(fundId);
      notifyMany(members.map((m) => m.user_id), {
        title: `Month ${monthNumber} completed`,
        message: `Month ${monthNumber} of "${fund.name}" is complete. Month ${monthNumber + 1} contributions are now open.`,
        type: "INFO",
      });
    }

    res.json(getMonthSummary(fundId, monthNumber));
  }
);

export default router;
