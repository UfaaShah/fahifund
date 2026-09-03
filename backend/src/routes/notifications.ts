import { Router } from "express";
import { db } from "../lib/db";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/", authenticate, (req: AuthedRequest, res) => {
  const rows = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
    .all(req.user!.userId) as any[];
  res.json(
    rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: !!n.is_read,
      createdAt: n.created_at,
    }))
  );
});

router.get("/unread-count", authenticate, (req: AuthedRequest, res) => {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0")
    .get(req.user!.userId) as any;
  res.json({ count: row.c });
});

router.patch("/:id/read", authenticate, (req: AuthedRequest, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.userId);
  res.json({ success: true });
});

router.patch("/read-all", authenticate, (req: AuthedRequest, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user!.userId);
  res.json({ success: true });
});

export default router;
