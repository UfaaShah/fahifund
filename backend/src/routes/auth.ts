import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { hashPassword, verifyPassword, signToken } from "../lib/auth";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { notifyMany } from "../lib/notify";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or mobile number is required"),
  password: z.string().min(1, "Password is required"),
});

router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { identifier, password } = parsed.data;

  const user = db
    .prepare("SELECT * FROM users WHERE email = ? OR phone = ?")
    .get(identifier, identifier) as any;

  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.status === "SUSPENDED") {
    return res.status(403).json({ error: "This account has been suspended. Contact your Super Admin." });
  }

  verifyPassword(password, user.password_hash).then((ok) => {
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = signToken({ userId: user.id, role: user.role });
    logAudit({ userId: user.id, action: "LOGIN", description: `${user.name} logged in` });
    res.json({
      token,
      user: {
        id: user.id,
        memberCode: user.member_code,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        photoUrl: user.photo_url,
      },
    });
  });
});

router.get("/me", authenticate, (req: AuthedRequest, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    memberCode: user.member_code,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    photoUrl: user.photo_url,
    nationalId: user.national_id,
    createdAt: user.created_at,
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

router.post("/change-password", authenticate, asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.userId) as any;
  const ok = await verifyPassword(parsed.data.currentPassword, user.password_hash);
  if (!ok) return res.status(400).json({ error: "Current password is incorrect" });
  const newHash = await hashPassword(parsed.data.newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);
  logAudit({ userId: user.id, action: "CHANGE_PASSWORD", description: `${user.name} changed their password` });
  res.json({ success: true });
}));

const forgotSchema = z.object({ phone: z.string().min(1, "Mobile number is required") });

// This app has no email/SMS provider, so "forgot password" doesn't send a link at all —
// it notifies every Super Admin that this member needs a reset, and a Super Admin resets
// them back to the default password from Members management (see POST /users/:id/reset-password).
router.post("/forgot-password", (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const user = db.prepare("SELECT * FROM users WHERE phone = ?").get(parsed.data.phone) as any;

  // Always respond success either way, so this can't be used to probe which mobile numbers
  // have an account.
  if (user) {
    const superAdmins = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN'").all() as { id: string }[];
    notifyMany(
      superAdmins.map((s) => s.id),
      {
        title: "Password reset requested",
        message: `${user.name} (${user.member_code} · ${user.phone}) can't log in and requested a password reset. Reset them to the default password from Members.`,
        type: "WARNING",
      }
    );
    logAudit({ userId: user.id, action: "REQUEST_PASSWORD_RESET", description: `${user.name} requested a password reset` });
  }

  res.json({ success: true });
});

export default router;
