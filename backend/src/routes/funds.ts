import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db } from "../lib/db";
import { newId } from "../lib/ids";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { notify, notifyMany } from "../lib/notify";
import {
  getFund,
  getActiveFundMembers,
  getFortuneOrder,
  getCurrentMonthNumber,
  getMonthSummary,
  getFundTimeline,
} from "../lib/fundCycle";

const router = Router();

function serializeFund(fund: any) {
  return {
    id: fund.id,
    name: fund.name,
    description: fund.description,
    contributionAmount: fund.contribution_amount,
    currency: fund.currency,
    startDate: fund.start_date,
    durationMonths: fund.duration_months,
    adminId: fund.admin_id,
    createdById: fund.created_by_id,
    status: fund.status,
    fortuneLockedAt: fund.fortune_locked_at,
    createdAt: fund.created_at,
  };
}

function fundOverview(fundId: string) {
  const fund = getFund(fundId);
  if (!fund) return null;
  const members = getActiveFundMembers(fundId);
  const currentMonth = getCurrentMonthNumber(fundId);
  const monthSummary = currentMonth <= fund.duration_months ? getMonthSummary(fundId, currentMonth) : null;
  const admin = fund.admin_id ? (db.prepare("SELECT * FROM users WHERE id = ?").get(fund.admin_id) as any) : null;
  const adminBank = fund.admin_id
    ? (db.prepare("SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(fund.admin_id) as any)
    : null;
  const completedMonths = db
    .prepare("SELECT COUNT(*) as c FROM payouts WHERE fund_id = ? AND status = 'COMPLETED'")
    .get(fundId) as any;

  return {
    fund: serializeFund(fund),
    memberCount: members.length,
    currentMonth: currentMonth <= fund.duration_months ? currentMonth : null,
    monthsCompleted: completedMonths.c,
    isCompleted: fund.status === "COMPLETED" || completedMonths.c >= fund.duration_months,
    currentBeneficiary: monthSummary?.beneficiary ?? null,
    admin: admin
      ? { id: admin.id, name: admin.name, memberCode: admin.member_code, photoUrl: admin.photo_url }
      : null,
    adminBankAccount: adminBank
      ? {
          bankName: adminBank.bank_name,
          accountName: adminBank.account_name,
          accountNumber: adminBank.account_number,
          branch: adminBank.branch,
        }
      : null,
    currentMonthSummary: monthSummary,
  };
}

/** Ensures the requester may see this fund; returns their relationship to it. */
function checkFundAccess(req: AuthedRequest, fundId: string): "SUPER_ADMIN" | "ADMIN" | "MEMBER" | null {
  const fund = getFund(fundId);
  if (!fund) return null;
  if (req.user!.role === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (fund.admin_id === req.user!.userId) return "ADMIN";
  const member = db
    .prepare("SELECT id FROM fund_members WHERE fund_id = ? AND user_id = ?")
    .get(fundId, req.user!.userId);
  if (member) return "MEMBER";
  return null;
}

// ---------- List / Create ----------

router.get("/", authenticate, (req: AuthedRequest, res) => {
  let funds: any[];
  if (req.user!.role === "SUPER_ADMIN") {
    funds = db.prepare("SELECT * FROM funds ORDER BY created_at DESC").all() as any[];
  } else if (req.user!.role === "ADMIN") {
    funds = db.prepare("SELECT * FROM funds WHERE admin_id = ? ORDER BY created_at DESC").all(req.user!.userId) as any[];
  } else {
    funds = db
      .prepare(
        `SELECT f.* FROM funds f JOIN fund_members fm ON fm.fund_id = f.id
         WHERE fm.user_id = ? ORDER BY f.created_at DESC`
      )
      .all(req.user!.userId) as any[];
  }
  res.json(funds.map((f) => fundOverview(f.id)));
});

const createFundSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  contributionAmount: z.number().positive(),
  currency: z.string().min(1).default("MVR"),
  startDate: z.string().min(1),
  durationMonths: z.number().int().positive(),
  adminId: z.string().optional(),
});

router.post("/", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const parsed = createFundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const id = newId();
  db.prepare(
    `INSERT INTO funds (id, name, description, contribution_amount, currency, start_date, duration_months, admin_id, created_by_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`
  ).run(id, d.name, d.description ?? null, d.contributionAmount, d.currency, d.startDate, d.durationMonths, d.adminId ?? null, req.user!.userId);

  // Picking an Admin here is a shortcut for adding them, then assigning them
  // Admin, in one step — so it needs to do both halves of that: make them an
  // active fund member (the /:id/admin reassignment route below requires
  // this already be true, since a brand-new fund can't) and promote their
  // login from USER to ADMIN. Skipping either half was the actual bug: the
  // fund simply never showed up in that person's `GET /funds` (still
  // querying by fund_members, not admin_id) or bottom nav (still the USER
  // set), so they had no way to reach Collection/Payout at all.
  if (d.adminId) {
    const adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(d.adminId) as any;
    if (adminUser) {
      db.prepare(
        `INSERT INTO fund_members (id, fund_id, user_id, member_number, slots) VALUES (?, ?, ?, 1, 1)`
      ).run(newId(), id, d.adminId);
      db.prepare("UPDATE users SET role = CASE WHEN role = 'USER' THEN 'ADMIN' ELSE role END WHERE id = ?").run(d.adminId);
      notify({ userId: d.adminId, title: "You've been assigned as Admin", message: `You are now the collecting Admin for "${d.name}".`, type: "INFO" });
    }
  }

  logAudit({ userId: req.user!.userId, fundId: id, action: "CREATE_FUND", description: `Super Admin created fund "${d.name}"` });
  res.status(201).json(fundOverview(id));
});

router.get("/:id", authenticate, (req: AuthedRequest, res) => {
  const access = checkFundAccess(req, req.params.id);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  const overview = fundOverview(req.params.id);
  const members = getActiveFundMembers(req.params.id);
  const order = getFortuneOrder(req.params.id);
  res.json({ ...overview, viewerRole: access, members, fortuneOrder: order });
});

const updateFundSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  contributionAmount: z.number().positive().optional(),
  currency: z.string().optional(),
  startDate: z.string().optional(),
  durationMonths: z.number().int().positive().optional(),
});

router.patch("/:id", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (fund.fortune_locked_at) {
    return res.status(400).json({ error: "This fund's Fortune order is locked; core terms can no longer be edited" });
  }
  const parsed = updateFundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const next = {
    name: d.name ?? fund.name,
    description: d.description ?? fund.description,
    contribution_amount: d.contributionAmount ?? fund.contribution_amount,
    currency: d.currency ?? fund.currency,
    start_date: d.startDate ?? fund.start_date,
    duration_months: d.durationMonths ?? fund.duration_months,
  };
  db.prepare(
    `UPDATE funds SET name=?, description=?, contribution_amount=?, currency=?, start_date=?, duration_months=? WHERE id=?`
  ).run(next.name, next.description, next.contribution_amount, next.currency, next.start_date, next.duration_months, fund.id);

  logAudit({ userId: req.user!.userId, fundId: fund.id, action: "EDIT_FUND", description: `Super Admin updated fund "${next.name}" terms` });
  res.json(fundOverview(fund.id));
});

router.post("/:id/cancel", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (fund.status === "ACTIVE" || fund.status === "COMPLETED") {
    return res.status(400).json({ error: "Only a fund that hasn't started (Fortune order not yet locked) can be reset/cancelled" });
  }
  db.prepare("UPDATE funds SET status = 'CANCELLED' WHERE id = ?").run(fund.id);
  logAudit({ userId: req.user!.userId, fundId: fund.id, action: "CANCEL_FUND", description: `Super Admin cancelled fund "${fund.name}" before it started` });
  res.json({ success: true });
});

router.delete("/:id", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });

  const paymentCount = (db.prepare("SELECT COUNT(*) as c FROM payments WHERE fund_id = ?").get(fund.id) as any).c;
  const payoutCount = (db.prepare("SELECT COUNT(*) as c FROM payouts WHERE fund_id = ?").get(fund.id) as any).c;
  if (paymentCount > 0 || payoutCount > 0) {
    return res.status(400).json({
      error:
        "This fund has payment or payout history and can't be permanently deleted — cancel it instead to keep the records.",
    });
  }

  const wipe = db.transaction(() => {
    db.prepare("DELETE FROM fortune_orders WHERE fund_id = ?").run(fund.id);
    db.prepare("DELETE FROM fund_members WHERE fund_id = ?").run(fund.id);
    db.prepare("UPDATE audit_logs SET fund_id = NULL WHERE fund_id = ?").run(fund.id);
    db.prepare("DELETE FROM funds WHERE id = ?").run(fund.id);
  });
  wipe();

  logAudit({ userId: req.user!.userId, action: "DELETE_FUND", description: `Super Admin permanently deleted fund "${fund.name}"` });
  res.json({ success: true });
});

// ---------- Admin assignment ----------

router.post("/:id/admin", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  const adminId = req.body?.adminId as string | undefined;
  if (!adminId) return res.status(400).json({ error: "adminId is required" });
  const member = db.prepare("SELECT * FROM fund_members WHERE fund_id = ? AND user_id = ? AND status='ACTIVE'").get(fund.id, adminId);
  if (!member) return res.status(400).json({ error: "The assigned Admin must be an active member of this fund" });

  const previousAdminId = fund.admin_id;
  db.prepare("UPDATE funds SET admin_id = ? WHERE id = ?").run(adminId, fund.id);
  db.prepare("UPDATE users SET role = CASE WHEN role = 'USER' THEN 'ADMIN' ELSE role END WHERE id = ?").run(adminId);

  const newAdmin = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId) as any;
  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "ASSIGN_ADMIN",
    description: previousAdminId
      ? `Super Admin changed the collecting Admin for "${fund.name}" — new Admin's bank account becomes the collection account from now on`
      : `Super Admin assigned ${newAdmin.name} as the collecting Admin for "${fund.name}"`,
  });
  notify({ userId: adminId, title: "You've been assigned as Admin", message: `You are now the collecting Admin for "${fund.name}".`, type: "INFO" });
  res.json(fundOverview(fund.id));
});

// ---------- Members ----------

router.get("/:id/members", authenticate, (req: AuthedRequest, res) => {
  const access = checkFundAccess(req, req.params.id);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  res.json(getActiveFundMembers(req.params.id));
});

const addMemberSchema = z.object({ userId: z.string().min(1), slots: z.number().int().min(1).max(20).optional() });

router.post("/:id/members", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (fund.fortune_locked_at) return res.status(400).json({ error: "Members cannot be added after the Fortune order is locked" });
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const slots = parsed.data.slots ?? 1;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(parsed.data.userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });
  const existing = db.prepare("SELECT * FROM fund_members WHERE fund_id = ? AND user_id = ?").get(fund.id, user.id) as any;
  if (existing) {
    if (existing.status === "ACTIVE") return res.status(409).json({ error: "This member is already in the fund" });
    db.prepare("UPDATE fund_members SET status = 'ACTIVE', slots = ? WHERE id = ?").run(slots, existing.id);
  } else {
    const maxRow = db.prepare("SELECT MAX(member_number) as m FROM fund_members WHERE fund_id = ?").get(fund.id) as any;
    const memberNumber = (maxRow?.m || 0) + 1;
    db.prepare(
      `INSERT INTO fund_members (id, fund_id, user_id, member_number, slots) VALUES (?, ?, ?, ?, ?)`
    ).run(newId(), fund.id, user.id, memberNumber, slots);
  }
  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "ADD_FUND_MEMBER",
    description: `Super Admin added ${user.name} to "${fund.name}"${slots > 1 ? ` with ${slots} slots` : ""}`,
  });
  notify({ userId: user.id, title: "Added to a fund", message: `You've been added to "${fund.name}".`, type: "INFO" });
  res.status(201).json(getActiveFundMembers(fund.id));
});

const updateMemberSlotsSchema = z.object({ slots: z.number().int().min(1).max(20) });

// Change how many slots (shares) a member holds in this fund — e.g. someone
// who joined with 1 slot decides to take 2. Only while the Fortune order
// isn't locked yet, since the order is generated from each member's slot
// count and changing it afterwards would desync the two.
router.patch("/:id/members/:userId", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (fund.fortune_locked_at) return res.status(400).json({ error: "Slots can't be changed after the Fortune order is locked" });
  const member = db
    .prepare("SELECT * FROM fund_members WHERE fund_id = ? AND user_id = ? AND status = 'ACTIVE'")
    .get(fund.id, req.params.userId) as any;
  if (!member) return res.status(404).json({ error: "Member not found in this fund" });
  const parsed = updateMemberSlotsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  db.prepare("UPDATE fund_members SET slots = ? WHERE id = ?").run(parsed.data.slots, member.id);
  const user = db.prepare("SELECT name FROM users WHERE id = ?").get(req.params.userId) as any;
  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "EDIT_MEMBER_SLOTS",
    description: `Super Admin set ${user?.name ?? "a member"}'s slots to ${parsed.data.slots} in "${fund.name}"`,
  });
  res.json(getActiveFundMembers(fund.id));
});

router.delete("/:id/members/:userId", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  const member = db.prepare("SELECT * FROM fund_members WHERE fund_id = ? AND user_id = ?").get(fund.id, req.params.userId) as any;
  if (!member) return res.status(404).json({ error: "Member not found in this fund" });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.userId) as any;

  if (!fund.fortune_locked_at) {
    // Before the fund starts: simple removal, Super Admin should then re-run the Fortune Wheel.
    db.prepare("UPDATE fund_members SET status = 'REMOVED' WHERE id = ?").run(member.id);
    logAudit({
      userId: req.user!.userId,
      fundId: fund.id,
      action: "REMOVE_MEMBER",
      description: `Super Admin removed ${user.name} from "${fund.name}" before the fund started. Re-run the Fortune Wheel to update the order.`,
    });
    return res.json({ success: true, requiresFortuneRerun: true });
  }

  // After the fund has started: controlled exception workflow — never silently
  // change the locked Fortune order. Requires the reason in the request body.
  const reason = req.body?.reason as string | undefined;
  if (!reason) {
    return res.status(400).json({ error: "A reason is required to remove a member after the fund has started" });
  }
  db.prepare("UPDATE fund_members SET status = 'REMOVED' WHERE id = ?").run(member.id);
  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "MEMBER_EXIT_EXCEPTION",
    description: `Super Admin approved ${user.name} leaving "${fund.name}" after it started. Reason: ${reason}. The locked Fortune order was NOT changed automatically — review remaining payout obligations manually.`,
  });
  res.json({ success: true, requiresFortuneRerun: false, note: "Locked Fortune order was left unchanged. Review remaining months manually." });
});

// ---------- Fortune Wheel ----------

router.get("/:id/fortune-wheel", authenticate, (req: AuthedRequest, res) => {
  const access = checkFundAccess(req, req.params.id);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  const fund = getFund(req.params.id)!;
  res.json({ locked: !!fund.fortune_locked_at, order: getFortuneOrder(req.params.id) });
});

router.post("/:id/fortune-wheel/generate", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (fund.fortune_locked_at) return res.status(400).json({ error: "The Fortune order is already locked for this fund" });
  const members = getActiveFundMembers(fund.id);
  if (members.length === 0) return res.status(400).json({ error: "Add members before running the Fortune Wheel" });

  // Expand each member into one pool entry per slot they hold — a 2-slot
  // member gets 2 separate (not necessarily adjacent) turns in the order.
  const pool: string[] = [];
  members.forEach((m: any) => {
    for (let i = 0; i < (m.slots || 1); i++) pool.push(m.user_id);
  });

  // Fisher-Yates shuffle using a CSPRNG so the order is genuinely random and
  // each slot is selected exactly once.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM fortune_orders WHERE fund_id = ?").run(fund.id);
    const stmt = db.prepare(
      `INSERT INTO fortune_orders (id, fund_id, member_id, position, month_number) VALUES (?, ?, ?, ?, ?)`
    );
    shuffled.forEach((userId, idx) => stmt.run(newId(), fund.id, userId, idx + 1, idx + 1));
    db.prepare("UPDATE funds SET status = 'FORTUNE_PENDING' WHERE id = ?").run(fund.id);
  });
  tx();

  logAudit({ userId: req.user!.userId, fundId: fund.id, action: "FORTUNE_WHEEL_SPIN", description: `Super Admin ran the Fortune Wheel for "${fund.name}" (${shuffled.length} slots across ${members.length} member(s))` });
  res.json({ order: getFortuneOrder(fund.id) });
});

// For a round that already had its receiving order decided outside the app (e.g. a physical
// draw done before the members were entered here) — sets a specific order instead of
// generating a random one. Same downstream effect as /generate (still requires /lock to
// finalize), just with the Super Admin supplying the sequence.
router.post("/:id/fortune-wheel/set-order", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (fund.fortune_locked_at) return res.status(400).json({ error: "The Fortune order is already locked for this fund" });

  const order = req.body?.order;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty "order" array of member user IDs' });
  }

  const members = getActiveFundMembers(fund.id);
  if (members.length === 0) return res.status(400).json({ error: "Add members before setting the Fortune order" });

  // A multi-slot member's user ID must appear in the list once per slot they
  // hold (their separate turns can be anywhere in the sequence, not
  // necessarily adjacent) — so this checks slot counts, not simple uniqueness.
  const slotsById = new Map<string, number>(members.map((m: any) => [m.user_id, m.slots || 1]));
  const totalSlots = [...slotsById.values()].reduce((sum, s) => sum + s, 0);
  const counts = new Map<string, number>();
  for (const id of order as string[]) counts.set(id, (counts.get(id) || 0) + 1);

  if (order.length !== totalSlots) {
    return res.status(400).json({ error: `The order list must contain exactly ${totalSlots} entries (one per slot)` });
  }
  for (const id of counts.keys()) {
    if (!slotsById.has(id)) return res.status(400).json({ error: "The order list includes someone who isn't a current member of this fund" });
  }
  for (const [userId, slots] of slotsById) {
    if ((counts.get(userId) || 0) !== slots) {
      return res.status(400).json({ error: "The order list must include each member exactly as many times as the slots they hold" });
    }
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM fortune_orders WHERE fund_id = ?").run(fund.id);
    const stmt = db.prepare(
      `INSERT INTO fortune_orders (id, fund_id, member_id, position, month_number) VALUES (?, ?, ?, ?, ?)`
    );
    (order as string[]).forEach((userId, idx) => stmt.run(newId(), fund.id, userId, idx + 1, idx + 1));
    db.prepare("UPDATE funds SET status = 'FORTUNE_PENDING' WHERE id = ?").run(fund.id);
  });
  tx();

  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "FORTUNE_WHEEL_SPIN",
    description: `Super Admin entered a pre-decided Fortune order for "${fund.name}" (${order.length} members)`,
  });
  res.json({ order: getFortuneOrder(fund.id) });
});

router.post("/:id/fortune-wheel/lock", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (fund.fortune_locked_at) return res.status(400).json({ error: "Already locked" });
  const order = getFortuneOrder(fund.id);
  if (order.length === 0) return res.status(400).json({ error: "Run the Fortune Wheel before locking the order" });

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("UPDATE fortune_orders SET locked_at = ? WHERE fund_id = ?").run(now, fund.id);
    db.prepare("UPDATE funds SET fortune_locked_at = ?, status = 'ACTIVE' WHERE id = ?").run(now, fund.id);
  });
  tx();

  logAudit({ userId: req.user!.userId, fundId: fund.id, action: "LOCK_FORTUNE_ORDER", description: `Fortune Wheel order finalized and locked for "${fund.name}"` });

  const members = getActiveFundMembers(fund.id);
  notifyMany(members.map((m) => m.user_id), {
    title: "Fortune Wheel result is in!",
    message: `The receiving order for "${fund.name}" has been finalized and locked. Check your position.`,
    type: "SUCCESS",
  });
  notify({
    userId: order[0].member_id,
    title: "You're first in line",
    message: `You are #1 in "${fund.name}" and will receive the first payout once Month 1 collection is complete.`,
    type: "PAYOUT",
  });

  res.json(fundOverview(fund.id));
});

router.post("/:id/fortune-wheel/reset", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const fund = getFund(req.params.id);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (!fund.fortune_locked_at) return res.status(400).json({ error: "This fund's Fortune order is not locked" });
  if (req.body?.confirm !== true) {
    return res.status(400).json({ error: "This is a destructive action. Resend with confirm: true to proceed." });
  }
  const anyProgress = db
    .prepare("SELECT COUNT(*) as c FROM payments WHERE fund_id = ? AND status = 'CONFIRMED'")
    .get(fund.id) as any;
  if (anyProgress.c > 0) {
    return res.status(400).json({ error: "This fund already has confirmed payments — the order can no longer be reset." });
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM fortune_orders WHERE fund_id = ?").run(fund.id);
    db.prepare("UPDATE funds SET fortune_locked_at = NULL, status = 'FORTUNE_PENDING' WHERE id = ?").run(fund.id);
  });
  tx();

  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "RESET_FORTUNE_ORDER",
    description: `Super Admin reset the locked Fortune order for "${fund.name}". Reason: ${req.body?.reason || "not provided"}`,
  });
  res.json({ success: true });
});

// ---------- Timeline / months ----------

router.get("/:id/timeline", authenticate, (req: AuthedRequest, res) => {
  const access = checkFundAccess(req, req.params.id);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  res.json(getFundTimeline(req.params.id));
});

router.get("/:id/months/:monthNumber", authenticate, (req: AuthedRequest, res) => {
  const access = checkFundAccess(req, req.params.id);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  const monthNumber = parseInt(req.params.monthNumber, 10);
  res.json(getMonthSummary(req.params.id, monthNumber));
});

export { checkFundAccess, fundOverview };
export default router;
