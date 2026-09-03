import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { newId, nextMemberCode } from "../lib/ids";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { notify } from "../lib/notify";
import { asyncHandler } from "../lib/asyncHandler";
import { DEFAULT_PASSWORD } from "../lib/constants";

const router = Router();

function serializeUser(u: any) {
  return {
    id: u.id,
    memberCode: u.member_code,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    photoUrl: u.photo_url,
    nationalId: u.national_id,
    createdAt: u.created_at,
  };
}

// List all users (Super Admin only) — used for member picking / admin assignment
router.get("/", authenticate, authorize("SUPER_ADMIN"), (_req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as any[];
  res.json(users.map(serializeUser));
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(4),
  nationalId: z.string().optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "USER"]).default("USER"),
});

router.post("/", authenticate, authorize("SUPER_ADMIN"), asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { name, email, phone, nationalId, role } = parsed.data;

  const existing = db.prepare("SELECT id FROM users WHERE email = ? OR phone = ?").get(email, phone);
  if (existing) return res.status(409).json({ error: "A user with this email or phone already exists" });

  // Ordered by the numeric suffix itself, not created_at — seeded/batch-inserted rows can
  // share the same millisecond timestamp, which previously picked an arbitrary "last" row
  // and could hand out a member_code that already existed (crashing on the UNIQUE constraint).
  const last = db
    .prepare("SELECT member_code FROM users WHERE member_code LIKE 'FF-%' ORDER BY CAST(SUBSTR(member_code, 4) AS INTEGER) DESC LIMIT 1")
    .get() as any;
  const memberCode = nextMemberCode(last?.member_code ?? null);
  const tempPassword = DEFAULT_PASSWORD;
  const passwordHash = await hashPassword(tempPassword);
  const id = newId();

  db.prepare(
    `INSERT INTO users (id, member_code, name, email, phone, password_hash, role, national_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, memberCode, name, email, phone, passwordHash, role, nationalId ?? null);

  logAudit({
    userId: req.user!.userId,
    action: "ADD_MEMBER",
    description: `Super Admin added ${name} (${memberCode}) as ${role}`,
  });

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.status(201).json({
    user: serializeUser(user),
    tempPassword,
    note: `Everyone starts with the default password "${DEFAULT_PASSWORD}" — ask them to change it after their first login via Profile → Change Password.`,
  });
}));

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(4).optional(),
  nationalId: z.string().optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "USER"]).optional(),
});

router.patch("/:id", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const next = { ...user, ...parsed.data };
  db.prepare(
    `UPDATE users SET name = ?, email = ?, phone = ?, national_id = ?, role = ? WHERE id = ?`
  ).run(next.name, next.email, next.phone, next.nationalId ?? next.national_id, next.role, user.id);

  logAudit({ userId: req.user!.userId, action: "EDIT_MEMBER", description: `Super Admin edited ${user.name}'s profile` });
  res.json(serializeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)));
});

router.patch("/:id/status", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const status = req.body?.status;
  if (!["ACTIVE", "SUSPENDED"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, user.id);
  logAudit({
    userId: req.user!.userId,
    action: status === "SUSPENDED" ? "SUSPEND_USER" : "ACTIVATE_USER",
    description: `Super Admin ${status === "SUSPENDED" ? "suspended" : "reactivated"} ${user.name}`,
  });
  res.json(serializeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)));
});

router.delete("/:id", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!target) return res.status(404).json({ error: "User not found" });

  if (target.id === req.user!.userId) {
    return res.status(400).json({ error: "You can't delete your own account while logged in." });
  }
  if (target.role === "SUPER_ADMIN") {
    const remaining = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'SUPER_ADMIN'").get() as any).c;
    if (remaining <= 1) {
      return res.status(400).json({ error: "You can't delete the last remaining Super Admin account." });
    }
  }

  let blocker: string | null = null;
  if (!blocker && (db.prepare("SELECT COUNT(*) as c FROM fund_members WHERE user_id = ?").get(target.id) as any).c > 0) {
    blocker = "have been a member of a fund";
  }
  if (!blocker && (db.prepare("SELECT COUNT(*) as c FROM payments WHERE member_id = ?").get(target.id) as any).c > 0) {
    blocker = "have submitted payments";
  }
  if (!blocker && (db.prepare("SELECT COUNT(*) as c FROM payouts WHERE beneficiary_id = ?").get(target.id) as any).c > 0) {
    blocker = "have received a payout";
  }
  if (!blocker && (db.prepare("SELECT COUNT(*) as c FROM fortune_orders WHERE member_id = ?").get(target.id) as any).c > 0) {
    blocker = "are part of a locked Fortune order";
  }
  if (
    !blocker &&
    (db.prepare("SELECT COUNT(*) as c FROM funds WHERE admin_id = ? OR created_by_id = ?").get(target.id, target.id) as any).c > 0
  ) {
    blocker = "are a fund's Admin or creator";
  }
  if (blocker) {
    return res.status(400).json({
      error: `${target.name} can't be permanently deleted because they ${blocker}. Suspend the account instead to preserve fund records.`,
    });
  }

  const wipe = db.transaction(() => {
    db.prepare("UPDATE payments SET verified_by_id = NULL WHERE verified_by_id = ?").run(target.id);
    db.prepare("UPDATE payouts SET completed_by_id = NULL WHERE completed_by_id = ?").run(target.id);
    db.prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id = ?").run(target.id);
    db.prepare("DELETE FROM bank_accounts WHERE user_id = ?").run(target.id);
    db.prepare("DELETE FROM notifications WHERE user_id = ?").run(target.id);
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(target.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
  });
  wipe();

  logAudit({ userId: req.user!.userId, action: "DELETE_MEMBER", description: `Super Admin permanently deleted ${target.name}'s account` });
  res.json({ success: true });
});

router.get("/:id", authenticate, (req: AuthedRequest, res) => {
  if (req.user!.role !== "SUPER_ADMIN" && req.user!.userId !== req.params.id) {
    return res.status(403).json({ error: "You can only view your own profile" });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });
  const bankAccount = db
    .prepare("SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(user.id) as any;
  res.json({
    ...serializeUser(user),
    bankAccount: bankAccount
      ? {
          id: bankAccount.id,
          bankName: bankAccount.bank_name,
          accountName: bankAccount.account_name,
          accountNumber: bankAccount.account_number,
          branch: bankAccount.branch,
        }
      : null,
  });
});

const bankAccountSchema = z.object({
  bankName: z.string().min(1),
  accountName: z.string().min(1),
  accountNumber: z.string().min(1),
  branch: z.string().optional(),
});

router.put("/:id/bank-account", authenticate, (req: AuthedRequest, res) => {
  if (req.user!.role !== "SUPER_ADMIN" && req.user!.userId !== req.params.id) {
    return res.status(403).json({ error: "You can only edit your own bank account" });
  }
  const parsed = bankAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const existing = db.prepare("SELECT id FROM bank_accounts WHERE user_id = ?").get(user.id) as any;
  if (existing) {
    db.prepare(
      `UPDATE bank_accounts SET bank_name = ?, account_name = ?, account_number = ?, branch = ? WHERE id = ?`
    ).run(parsed.data.bankName, parsed.data.accountName, parsed.data.accountNumber, parsed.data.branch ?? null, existing.id);
  } else {
    db.prepare(
      `INSERT INTO bank_accounts (id, user_id, bank_name, account_name, account_number, branch) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(newId(), user.id, parsed.data.bankName, parsed.data.accountName, parsed.data.accountNumber, parsed.data.branch ?? null);
  }

  logAudit({ userId: req.user!.userId, action: "UPDATE_BANK_ACCOUNT", description: `Bank account updated for ${user.name}` });
  res.json({ success: true });
});

export default router;
