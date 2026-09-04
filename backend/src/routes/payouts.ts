import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { newId } from "../lib/ids";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { upload, publicUploadPath, deleteUploadedFile } from "../middleware/upload";
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

function addMonthsIso(iso: string, months: number) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

const backfillSchema = z.object({
  throughMonth: z.number().int().positive(),
});

// Super Admin only: for setting up a round that was already running before it was
// entered into the app (e.g. a real fund several months in). Marks every active
// member's contribution as collected and that month's payout as completed for
// every month from 1 up to `throughMonth`, without anyone needing to log in and
// submit a receipt for months that already happened in real life. Idempotent and
// safe to re-run: any month whose payout is already COMPLETED is left untouched
// and reported back as skipped, so calling this again with a larger throughMonth
// only fills in the newly-added months.
router.post("/backfill", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fundId = req.params.fundId;
  const fund = getFund(fundId);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (!fund.fortune_locked_at) {
    return res.status(400).json({ error: "Lock the Fortune order first — a beneficiary must be known for each month before it can be backfilled." });
  }
  const parsed = backfillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const throughMonth = Math.min(parsed.data.throughMonth, fund.duration_months);

  const members = getActiveFundMembers(fundId);
  const now = new Date().toISOString();
  const processed: number[] = [];
  const skipped: { month: number; reason: string }[] = [];

  const tx = db.transaction(() => {
    for (let m = 1; m <= throughMonth; m++) {
      const existingPayout = db.prepare("SELECT * FROM payouts WHERE fund_id=? AND month_number=?").get(fundId, m) as any;
      if (existingPayout?.status === "COMPLETED") {
        skipped.push({ month: m, reason: "Already completed" });
        continue;
      }
      const summary = getMonthSummary(fundId, m);
      if (!summary.beneficiary) {
        skipped.push({ month: m, reason: "No Fortune order beneficiary for this position" });
        continue;
      }
      const monthDate = addMonthsIso(fund.start_date, m - 1);

      for (const member of members) {
        const amount = fund.contribution_amount * (member.slots || 1);
        const existingPayment = db
          .prepare("SELECT * FROM payments WHERE fund_id=? AND month_number=? AND member_id=?")
          .get(fundId, m, member.user_id) as any;
        if (existingPayment) {
          if (existingPayment.status !== "CONFIRMED") {
            db.prepare(
              `UPDATE payments SET status='CONFIRMED', amount=?, payment_date=?, verified_by_id=?, verified_at=?, updated_at=? WHERE id=?`
            ).run(amount, monthDate, req.user!.userId, now, now, existingPayment.id);
          }
        } else {
          db.prepare(
            `INSERT INTO payments (id, fund_id, month_number, member_id, amount, payment_date, status, reference_number, verified_by_id, verified_at)
             VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', 'Backfilled — recorded by Super Admin', ?, ?)`
          ).run(newId(), fundId, m, member.user_id, amount, monthDate, req.user!.userId, now);
        }
      }

      if (existingPayout) {
        db.prepare(
          `UPDATE payouts SET status='COMPLETED', amount=?, payout_date=?, completed_by_id=?, completed_at=? WHERE id=?`
        ).run(summary.expectedTotal, monthDate, req.user!.userId, now, existingPayout.id);
      } else {
        db.prepare(
          `INSERT INTO payouts (id, fund_id, month_number, beneficiary_id, amount, payout_date, reference_number, status, completed_by_id, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, 'Backfilled — recorded by Super Admin', 'COMPLETED', ?, ?)`
        ).run(newId(), fundId, m, summary.beneficiary.id, summary.expectedTotal, monthDate, req.user!.userId, now);
      }

      if (m >= fund.duration_months) {
        db.prepare("UPDATE funds SET status='COMPLETED' WHERE id=?").run(fundId);
      } else if (fund.status === "FORTUNE_PENDING" || fund.status === "DRAFT") {
        db.prepare("UPDATE funds SET status='ACTIVE' WHERE id=?").run(fundId);
      }

      processed.push(m);
    }
  });
  tx();

  if (processed.length > 0) {
    logAudit({
      userId: req.user!.userId,
      fundId,
      action: "BACKFILL_MONTHS",
      description: `Super Admin backfilled months ${processed.join(", ")} of "${fund.name}" as already collected and paid out`,
    });
  }

  res.json({ processed, skipped });
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

const editPayoutSchema = z.object({
  amount: z.number().positive().optional(),
  status: z.enum(["WAITING_COLLECTION", "READY", "PROCESSING", "COMPLETED"]).optional(),
  payoutDate: z.string().optional(),
  referenceNumber: z.string().optional(),
});

// Super Admin override: directly edit any field on a payout record (e.g. to
// fix a data-entry mistake made while re-entering a round's history), without
// going through the normal complete-payout flow.
router.patch("/:payoutId", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const payout = db.prepare("SELECT * FROM payouts WHERE id = ?").get(req.params.payoutId) as any;
  if (!payout) return res.status(404).json({ error: "Payout not found" });
  const fund = getFund(payout.fund_id)!;
  const parsed = editPayoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const next = {
    amount: d.amount ?? payout.amount,
    status: d.status ?? payout.status,
    payout_date: d.payoutDate ?? payout.payout_date,
    reference_number: d.referenceNumber ?? payout.reference_number,
  };
  db.prepare(`UPDATE payouts SET amount=?, status=?, payout_date=?, reference_number=? WHERE id=?`).run(
    next.amount,
    next.status,
    next.payout_date,
    next.reference_number,
    payout.id
  );

  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "EDIT_PAYOUT",
    description: `Super Admin directly edited a month ${payout.month_number} payout record for "${fund.name}"`,
  });

  res.json(getMonthSummary(fund.id, payout.month_number));
});

// Super Admin override: permanently delete a payout record (and its uploaded
// proof, if any).
router.delete("/:payoutId", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const payout = db.prepare("SELECT * FROM payouts WHERE id = ?").get(req.params.payoutId) as any;
  if (!payout) return res.status(404).json({ error: "Payout not found" });
  const fund = getFund(payout.fund_id)!;

  db.prepare("DELETE FROM payouts WHERE id = ?").run(payout.id);
  deleteUploadedFile(payout.receipt_path);

  // If deleting the final month's completed payout, the fund is no longer fully finished.
  if (fund.status === "COMPLETED" && payout.month_number >= fund.duration_months) {
    db.prepare("UPDATE funds SET status='ACTIVE' WHERE id=?").run(fund.id);
  }

  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "DELETE_PAYOUT",
    description: `Super Admin permanently deleted a month ${payout.month_number} payout record for "${fund.name}"`,
  });

  res.json(getMonthSummary(fund.id, payout.month_number));
});

export default router;
