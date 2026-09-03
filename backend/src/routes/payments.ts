import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { newId } from "../lib/ids";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { upload, publicUploadPath, deleteUploadedFile } from "../middleware/upload";
import { logAudit } from "../lib/audit";
import { notify } from "../lib/notify";
import { getFund, getCurrentMonthNumber, getMonthSummary, getActiveFundMembers } from "../lib/fundCycle";
import { checkFundAccess } from "./funds";

const router = Router({ mergeParams: true });

/** Shared by the normal verify-CONFIRM flow and Super Admin's direct edit
 * override: if this month is now fully collected, mark its payout READY
 * (or create it) and notify the Admin + beneficiary. */
function readyPayoutIfComplete(fund: any, monthNumber: number) {
  const summary = getMonthSummary(fund.id, monthNumber);
  if (summary.paidCount >= summary.expectedMembers && summary.beneficiary) {
    const existingPayout = db.prepare("SELECT * FROM payouts WHERE fund_id=? AND month_number=?").get(fund.id, monthNumber) as any;
    if (!existingPayout) {
      db.prepare(
        `INSERT INTO payouts (id, fund_id, month_number, beneficiary_id, amount, status) VALUES (?, ?, ?, ?, ?, 'READY')`
      ).run(newId(), fund.id, monthNumber, summary.beneficiary.id, summary.expectedTotal);
    } else if (existingPayout.status === "WAITING_COLLECTION") {
      db.prepare("UPDATE payouts SET status='READY' WHERE id=?").run(existingPayout.id);
    }
    logAudit({ fundId: fund.id, action: "COLLECTION_COMPLETE", description: `Month ${monthNumber} collection complete for "${fund.name}" — ready for payout` });
    if (fund.admin_id) {
      notify({ userId: fund.admin_id, title: "Collection complete", message: `Month ${monthNumber} is fully collected. Ready to pay out to ${summary.beneficiary.name}.`, type: "PAYOUT" });
    }
    notify({ userId: summary.beneficiary.id, title: "Your payout is ready", message: `Month ${monthNumber} collection is complete. Your payout will be sent shortly.`, type: "PAYOUT" });
  }
}

// Member submits / resubmits a payment for the fund's current month.
router.post("/", authenticate, authorize("USER", "ADMIN"), upload.single("receipt"), (req: AuthedRequest, res) => {
  const fundId = req.params.fundId;
  const fund = getFund(fundId);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  const access = checkFundAccess(req, fundId);
  if (access !== "MEMBER" && access !== "ADMIN") return res.status(403).json({ error: "You are not a member of this fund" });
  if (fund.status !== "ACTIVE") return res.status(400).json({ error: "This fund is not currently accepting contributions" });

  const currentMonth = getCurrentMonthNumber(fundId);
  if (currentMonth > fund.duration_months) return res.status(400).json({ error: "This fund has already completed all months" });

  const existing = db
    .prepare("SELECT * FROM payments WHERE fund_id = ? AND month_number = ? AND member_id = ?")
    .get(fundId, currentMonth, req.user!.userId) as any;

  if (existing && existing.status === "CONFIRMED") {
    return res.status(400).json({ error: "This month's payment has already been confirmed" });
  }

  const receiptPath = req.file ? publicUploadPath(req.file.filename) : existing?.receipt_path ?? null;
  const referenceNumber = req.body?.referenceNumber || existing?.reference_number || null;
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(
      `UPDATE payments SET status = 'SENT', payment_date = ?, receipt_path = ?, reference_number = ?, note = NULL, verified_by_id = NULL, verified_at = NULL, updated_at = ? WHERE id = ?`
    ).run(now, receiptPath, referenceNumber, now, existing.id);
  } else {
    db.prepare(
      `INSERT INTO payments (id, fund_id, month_number, member_id, amount, payment_date, status, receipt_path, reference_number)
       VALUES (?, ?, ?, ?, ?, ?, 'SENT', ?, ?)`
    ).run(newId(), fundId, currentMonth, req.user!.userId, fund.contribution_amount, now, receiptPath, referenceNumber);
  }

  logAudit({ userId: req.user!.userId, fundId, action: "SUBMIT_PAYMENT", description: `Member submitted month ${currentMonth} payment for "${fund.name}"` });
  if (fund.admin_id) {
    notify({ userId: fund.admin_id, title: "New payment submitted", message: `A member submitted their month ${currentMonth} contribution — please verify it.`, type: "PAYMENT" });
  }

  res.json(getMonthSummary(fundId, currentMonth));
});

router.get("/mine", authenticate, (req: AuthedRequest, res) => {
  const fundId = req.params.fundId;
  const access = checkFundAccess(req, fundId);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  const rows = db
    .prepare("SELECT * FROM payments WHERE fund_id = ? AND member_id = ? ORDER BY month_number ASC")
    .all(fundId, req.user!.userId);
  res.json(rows);
});

// Admin sends a reminder notification to every member who hasn't paid yet this month.
router.post("/remind", authenticate, authorize("ADMIN", "SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fundId = req.params.fundId;
  const fund = getFund(fundId);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (req.user!.role === "ADMIN" && fund.admin_id !== req.user!.userId) {
    return res.status(403).json({ error: "Only this fund's assigned Admin can send reminders" });
  }
  const currentMonth = getCurrentMonthNumber(fundId);
  const summary = getMonthSummary(fundId, currentMonth);
  const paidIds = new Set(summary.payments.filter((p) => p.status === "CONFIRMED").map((p) => p.member_id));
  const members = getActiveFundMembers(fundId).filter((m) => !paidIds.has(m.user_id));

  for (const m of members) {
    notify({
      userId: m.user_id,
      title: "Contribution reminder",
      message: `Your month ${currentMonth} contribution of ${fund.currency} ${fund.contribution_amount} for "${fund.name}" is due.`,
      type: "REMINDER",
    });
  }
  logAudit({ userId: req.user!.userId, fundId, action: "SEND_REMINDER", description: `Admin sent contribution reminders to ${members.length} member(s) for month ${currentMonth}` });
  res.json({ remindedCount: members.length });
});

router.patch("/:paymentId/verify", authenticate, authorize("ADMIN", "SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.paymentId) as any;
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const fund = getFund(payment.fund_id)!;
  if (req.user!.role === "ADMIN" && fund.admin_id !== req.user!.userId) {
    return res.status(403).json({ error: "Only this fund's assigned Admin can verify its payments" });
  }
  const action = req.body?.action;
  if (!["CONFIRM", "REJECT"].includes(action)) return res.status(400).json({ error: "action must be CONFIRM or REJECT" });

  const now = new Date().toISOString();
  if (action === "CONFIRM") {
    db.prepare(
      `UPDATE payments SET status='CONFIRMED', verified_by_id=?, verified_at=?, updated_at=? WHERE id=?`
    ).run(req.user!.userId, now, now, payment.id);
    notify({ userId: payment.member_id, title: "Payment confirmed", message: `Your month ${payment.month_number} payment for "${fund.name}" has been confirmed.`, type: "SUCCESS" });
    logAudit({ userId: req.user!.userId, fundId: fund.id, action: "CONFIRM_PAYMENT", description: `Admin confirmed month ${payment.month_number} payment` });

    // If collection is now complete, mark the payout as ready and notify.
    readyPayoutIfComplete(fund, payment.month_number);
  } else {
    const reason = req.body?.note || "No reason provided";
    db.prepare(
      `UPDATE payments SET status='REJECTED', verified_by_id=?, verified_at=?, note=?, updated_at=? WHERE id=?`
    ).run(req.user!.userId, now, reason, now, payment.id);
    notify({ userId: payment.member_id, title: "Payment rejected", message: `Your month ${payment.month_number} payment for "${fund.name}" was rejected: ${reason}. Please resubmit.`, type: "WARNING" });
    logAudit({ userId: req.user!.userId, fundId: fund.id, action: "REJECT_PAYMENT", description: `Admin rejected month ${payment.month_number} payment: ${reason}` });
  }

  res.json(getMonthSummary(fund.id, payment.month_number));
});

const editPaymentSchema = z.object({
  amount: z.number().positive().optional(),
  status: z.enum(["PENDING", "SENT", "CONFIRMED", "REJECTED"]).optional(),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().optional(),
  note: z.string().optional(),
});

// Super Admin override: directly edit any field on a payment record (e.g. to
// fix a data-entry mistake made while re-entering a round's history), without
// going through the normal submit/verify flow.
router.patch("/:paymentId", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.paymentId) as any;
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const fund = getFund(payment.fund_id)!;
  const parsed = editPaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const next = {
    amount: d.amount ?? payment.amount,
    status: d.status ?? payment.status,
    payment_date: d.paymentDate ?? payment.payment_date,
    reference_number: d.referenceNumber ?? payment.reference_number,
    note: d.note ?? payment.note,
  };
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE payments SET amount=?, status=?, payment_date=?, reference_number=?, note=?, updated_at=? WHERE id=?`
  ).run(next.amount, next.status, next.payment_date, next.reference_number, next.note, now, payment.id);

  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "EDIT_PAYMENT",
    description: `Super Admin directly edited a month ${payment.month_number} payment record for "${fund.name}"`,
  });

  // Editing status into CONFIRMED can complete this month's collection, same as the normal verify flow.
  if (next.status === "CONFIRMED" && payment.status !== "CONFIRMED") {
    readyPayoutIfComplete(fund, payment.month_number);
  }

  res.json(getMonthSummary(fund.id, payment.month_number));
});

// Super Admin override: permanently delete a payment record (and its uploaded
// receipt, if any). Use with care — this does not automatically un-ready a
// payout that this payment had completed; review the payout separately.
router.delete("/:paymentId", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.paymentId) as any;
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const fund = getFund(payment.fund_id)!;

  db.prepare("DELETE FROM payments WHERE id = ?").run(payment.id);
  deleteUploadedFile(payment.receipt_path);

  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "DELETE_PAYMENT",
    description: `Super Admin permanently deleted a month ${payment.month_number} payment record for "${fund.name}"`,
  });

  res.json(getMonthSummary(fund.id, payment.month_number));
});

export default router;
