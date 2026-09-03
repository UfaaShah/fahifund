import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db } from "../lib/db";
import { hashPassword, verifyPassword, signToken } from "../lib/auth";
import { newId } from "../lib/ids";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../lib/audit";
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

const forgotSchema = z.object({ identifier: z.string().min(1) });

// Demo-friendly forgot-password flow: since this environment can't send real
// email/SMS, the reset token is returned directly in the response (clearly
// marked). In production this would be emailed/texted instead of returned.
router.post("/forgot-password", (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const user = db
    .prepare("SELECT * FROM users WHERE email = ? OR phone = ?")
    .get(parsed.data.identifier, parsed.data.identifier) as any;
  // Always respond success to avoid leaking which accounts exist.
  if (!user) return res.json({ success: true });

  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
  ).run(newId(), user.id, tokenHash, expiresAt);

  res.json({ success: true, devResetToken: rawToken, note: "In production this token is emailed/texted, not returned by the API." });
});

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

router.post("/reset-password", asyncHandler(async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  const record = db
    .prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL")
    .get(tokenHash) as any;
  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "Reset link is invalid or has expired" });
  }
  const newHash = await hashPassword(parsed.data.newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, record.user_id);
  db.prepare("UPDATE password_resets SET used_at = ? WHERE id = ?").run(new Date().toISOString(), record.id);
  logAudit({ userId: record.user_id, action: "RESET_PASSWORD", description: "Password reset via forgot-password flow" });
  res.json({ success: true });
}));

export default router;
