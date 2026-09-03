import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { newId } from "../lib/ids";
import { authenticate, authorize, AuthedRequest } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { notify, notifyMany } from "../lib/notify";
import { getFund } from "../lib/fundCycle";
import { checkFundAccess } from "./funds";

const router = Router({ mergeParams: true });

function listSwapRequests(fundId: string) {
  return db
    .prepare(
      `SELECT sr.*,
              ua.name as member_a_name, ua.member_code as member_a_code, ua.photo_url as member_a_photo,
              ub.name as member_b_name, ub.member_code as member_b_code, ub.photo_url as member_b_photo,
              ureq.name as requested_by_name,
              foa.position as member_a_position, fob.position as member_b_position
       FROM fortune_swap_requests sr
       JOIN users ua ON ua.id = sr.member_a_id
       JOIN users ub ON ub.id = sr.member_b_id
       JOIN users ureq ON ureq.id = sr.requested_by_id
       LEFT JOIN fortune_orders foa ON foa.fund_id = sr.fund_id AND foa.member_id = sr.member_a_id
       LEFT JOIN fortune_orders fob ON fob.fund_id = sr.fund_id AND fob.member_id = sr.member_b_id
       WHERE sr.fund_id = ?
       ORDER BY sr.created_at DESC`
    )
    .all(fundId);
}

function getSwapRequest(id: string) {
  return db.prepare("SELECT * FROM fortune_swap_requests WHERE id = ?").get(id) as any;
}

/** True if either member's current position already has a COMPLETED payout —
 * their position in the fund's history is locked in and can no longer move. */
function hasCompletedPayoutBlocking(fundId: string, memberAId: string, memberBId: string) {
  const rows = db
    .prepare(
      `SELECT fo.member_id, fo.position FROM fortune_orders fo WHERE fo.fund_id = ? AND fo.member_id IN (?, ?)`
    )
    .all(fundId, memberAId, memberBId) as { member_id: string; position: number }[];
  if (rows.length !== 2) return { blocked: true, reason: "Could not find both members in this fund's Fortune order" };
  const positions = rows.map((r) => r.position);
  const completed = db
    .prepare(
      `SELECT COUNT(*) as c FROM payouts WHERE fund_id = ? AND month_number IN (?, ?) AND status = 'COMPLETED'`
    )
    .get(fundId, positions[0], positions[1]) as any;
  return { blocked: completed.c > 0, reason: completed.c > 0 ? "One of these members has already received a completed payout — their position can no longer be changed" : null };
}

router.get("/", authenticate, (req: AuthedRequest, res) => {
  const fundId = req.params.fundId;
  const access = checkFundAccess(req, fundId);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  res.json(listSwapRequests(fundId));
});

const createSwapSchema = z.object({
  memberAId: z.string().min(1),
  memberBId: z.string().min(1),
  reason: z.string().optional(),
});

// Request a swap of two members' positions in an already-locked Fortune order.
// - A regular member (or the fund's Admin) must name themselves as one of the
//   two parties — they can't request a swap between two other people.
// - Super Admin may request a swap between any two members.
// Whichever named party made the request is auto-approved on their own side;
// the other party (or both, for a Super-Admin-initiated request) must still
// approve, and Super Admin must always give a separate final approval before
// the positions actually change.
router.post("/", authenticate, (req: AuthedRequest, res) => {
  const fundId = req.params.fundId;
  const fund = getFund(fundId);
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  const access = checkFundAccess(req, fundId);
  if (!access) return res.status(403).json({ error: "You do not have access to this fund" });
  if (!fund.fortune_locked_at) return res.status(400).json({ error: "The Fortune order must be locked before a swap can be requested" });
  if (fund.status === "COMPLETED" || fund.status === "CANCELLED") {
    return res.status(400).json({ error: "This fund is no longer active" });
  }

  const parsed = createSwapSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { memberAId, memberBId, reason } = parsed.data;
  if (memberAId === memberBId) return res.status(400).json({ error: "Choose two different members" });

  if (access !== "SUPER_ADMIN" && req.user!.userId !== memberAId && req.user!.userId !== memberBId) {
    return res.status(403).json({ error: "You can only request a swap that includes yourself. Ask a Super Admin to request one between two other members." });
  }

  const memberRows = db
    .prepare(`SELECT member_id FROM fortune_orders WHERE fund_id = ? AND member_id IN (?, ?)`)
    .all(fundId, memberAId, memberBId) as { member_id: string }[];
  if (memberRows.length !== 2) {
    return res.status(400).json({ error: "Both members must currently be in this fund's Fortune order" });
  }

  const { blocked, reason: blockReason } = hasCompletedPayoutBlocking(fundId, memberAId, memberBId);
  if (blocked) return res.status(400).json({ error: blockReason });

  const existing = db
    .prepare(
      `SELECT id FROM fortune_swap_requests WHERE fund_id = ? AND status IN ('PENDING','READY_FOR_FINAL_APPROVAL')
       AND (member_a_id IN (?, ?) OR member_b_id IN (?, ?))`
    )
    .get(fundId, memberAId, memberBId, memberAId, memberBId);
  if (existing) {
    return res.status(409).json({ error: "One of these members already has an open swap request pending" });
  }

  const now = new Date().toISOString();
  const requesterIsA = req.user!.userId === memberAId;
  const requesterIsB = req.user!.userId === memberBId;
  const memberAApprovedAt = requesterIsA ? now : null;
  const memberBApprovedAt = requesterIsB ? now : null;
  const status = memberAApprovedAt && memberBApprovedAt ? "READY_FOR_FINAL_APPROVAL" : "PENDING";

  const id = newId();
  db.prepare(
    `INSERT INTO fortune_swap_requests
       (id, fund_id, requested_by_id, member_a_id, member_b_id, reason, status, member_a_approved_at, member_b_approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, fundId, req.user!.userId, memberAId, memberBId, reason ?? null, status, memberAApprovedAt, memberBApprovedAt);

  logAudit({
    userId: req.user!.userId,
    fundId,
    action: "REQUEST_FORTUNE_SWAP",
    description: `Requested a position swap between two members of "${fund.name}"${reason ? ` — ${reason}` : ""}`,
  });

  if (status === "READY_FOR_FINAL_APPROVAL") {
    const superAdmins = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN'").all() as { id: string }[];
    notifyMany(superAdmins.map((u) => u.id), {
      title: "Swap ready for final approval",
      message: `A position swap in "${fund.name}" has been approved by both members and needs your final approval.`,
      type: "INFO",
    });
  } else {
    // Whichever party (or parties) did NOT auto-approve as the requester still need to approve.
    const pendingIds = [
      !memberAApprovedAt ? memberAId : null,
      !memberBApprovedAt ? memberBId : null,
    ].filter((id): id is string => !!id);
    notifyMany(pendingIds, {
      title: "Swap request needs your approval",
      message: `A request to swap your position in "${fund.name}" is waiting for your approval.`,
      type: "INFO",
    });
  }

  res.status(201).json(listSwapRequests(fundId));
});

router.post("/:requestId/approve", authenticate, (req: AuthedRequest, res) => {
  const swap = getSwapRequest(req.params.requestId);
  if (!swap || swap.fund_id !== req.params.fundId) return res.status(404).json({ error: "Swap request not found" });
  if (swap.status !== "PENDING") return res.status(400).json({ error: "This request is no longer waiting for member approval" });

  const userId = req.user!.userId;
  const isA = swap.member_a_id === userId;
  const isB = swap.member_b_id === userId;
  if (!isA && !isB) return res.status(403).json({ error: "You are not one of the members named in this swap request" });
  if ((isA && swap.member_a_approved_at) || (isB && swap.member_b_approved_at)) {
    return res.status(400).json({ error: "You have already approved this request" });
  }

  const now = new Date().toISOString();
  const memberAApprovedAt = isA ? now : swap.member_a_approved_at;
  const memberBApprovedAt = isB ? now : swap.member_b_approved_at;
  const status = memberAApprovedAt && memberBApprovedAt ? "READY_FOR_FINAL_APPROVAL" : "PENDING";

  db.prepare(`UPDATE fortune_swap_requests SET member_a_approved_at = ?, member_b_approved_at = ?, status = ? WHERE id = ?`).run(
    memberAApprovedAt,
    memberBApprovedAt,
    status,
    swap.id
  );

  const fund = getFund(swap.fund_id)!;
  logAudit({ userId, fundId: fund.id, action: "APPROVE_FORTUNE_SWAP", description: `Member approved a position swap request in "${fund.name}"` });

  if (status === "READY_FOR_FINAL_APPROVAL") {
    const superAdmins = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN'").all() as { id: string }[];
    notifyMany(superAdmins.map((u) => u.id), {
      title: "Swap ready for final approval",
      message: `A position swap in "${fund.name}" has been approved by both members and needs your final approval.`,
      type: "INFO",
    });
  } else {
    const otherId = isA ? swap.member_b_id : swap.member_a_id;
    notify({ userId: otherId, title: "Swap request needs your approval", message: `A request to swap your position in "${fund.name}" is waiting for your approval.`, type: "INFO" });
  }

  res.json(listSwapRequests(swap.fund_id));
});

router.post("/:requestId/reject", authenticate, (req: AuthedRequest, res) => {
  const swap = getSwapRequest(req.params.requestId);
  if (!swap || swap.fund_id !== req.params.fundId) return res.status(404).json({ error: "Swap request not found" });
  if (swap.status !== "PENDING" && swap.status !== "READY_FOR_FINAL_APPROVAL") {
    return res.status(400).json({ error: "This request has already been settled" });
  }

  const userId = req.user!.userId;
  const isA = swap.member_a_id === userId;
  const isB = swap.member_b_id === userId;
  const isSuperAdmin = req.user!.role === "SUPER_ADMIN";
  if (!isA && !isB && !isSuperAdmin) {
    return res.status(403).json({ error: "Only a named member or Super Admin can decline this request" });
  }

  const now = new Date().toISOString();
  const reason = req.body?.reason || null;
  db.prepare(`UPDATE fortune_swap_requests SET status = 'REJECTED', rejected_by_id = ?, rejected_at = ?, rejection_reason = ? WHERE id = ?`).run(
    userId,
    now,
    reason,
    swap.id
  );

  const fund = getFund(swap.fund_id)!;
  logAudit({ userId, fundId: fund.id, action: "REJECT_FORTUNE_SWAP", description: `Declined a position swap request in "${fund.name}"${reason ? `: ${reason}` : ""}` });

  const others = [swap.member_a_id, swap.member_b_id, swap.requested_by_id].filter((id, idx, arr) => id !== userId && arr.indexOf(id) === idx);
  notifyMany(others, {
    title: "Swap request declined",
    message: `A position swap request in "${fund.name}" was declined${reason ? `: ${reason}` : "."}`,
    type: "WARNING",
  });

  res.json(listSwapRequests(swap.fund_id));
});

// Super Admin's final approval — this is the step that actually executes the
// swap. Always a distinct action from either member's own approval, even when
// Super Admin was the one who made the original request.
router.post("/:requestId/approve-final", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const swap = getSwapRequest(req.params.requestId);
  if (!swap || swap.fund_id !== req.params.fundId) return res.status(404).json({ error: "Swap request not found" });
  if (swap.status !== "READY_FOR_FINAL_APPROVAL") {
    return res.status(400).json({ error: "Both members must approve before this can receive final approval" });
  }

  const fund = getFund(swap.fund_id)!;
  const { blocked, reason: blockReason } = hasCompletedPayoutBlocking(fund.id, swap.member_a_id, swap.member_b_id);
  if (blocked) return res.status(400).json({ error: blockReason });

  const rows = db
    .prepare(`SELECT * FROM fortune_orders WHERE fund_id = ? AND member_id IN (?, ?)`)
    .all(fund.id, swap.member_a_id, swap.member_b_id) as any[];
  const rowA = rows.find((r) => r.member_id === swap.member_a_id);
  const rowB = rows.find((r) => r.member_id === swap.member_b_id);
  if (!rowA || !rowB) return res.status(400).json({ error: "Could not find both members in this fund's Fortune order" });

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    // Swap position AND month_number together — they're always kept equal.
    // fortune_orders has a UNIQUE(fund_id, position) constraint, so the swap
    // has to pass through a temporary, out-of-range position first or the
    // two UPDATEs would momentarily collide.
    db.prepare(`UPDATE fortune_orders SET position = -1 WHERE id = ?`).run(rowA.id);
    db.prepare(`UPDATE fortune_orders SET position = ?, month_number = ? WHERE id = ?`).run(rowA.position, rowA.month_number, rowB.id);
    db.prepare(`UPDATE fortune_orders SET position = ?, month_number = ? WHERE id = ?`).run(rowB.position, rowB.month_number, rowA.id);
    db.prepare(`UPDATE fortune_swap_requests SET status = 'APPROVED', final_approved_by_id = ?, final_approved_at = ? WHERE id = ?`).run(
      req.user!.userId,
      now,
      swap.id
    );
  });
  tx();

  logAudit({
    userId: req.user!.userId,
    fundId: fund.id,
    action: "EXECUTE_FORTUNE_SWAP",
    description: `Super Admin gave final approval and swapped two members' positions (#${rowA.position} ⇄ #${rowB.position}) in "${fund.name}"`,
  });

  notifyMany([swap.member_a_id, swap.member_b_id], {
    title: "Position swap completed",
    message: `Your position in "${fund.name}" has been swapped following Super Admin's final approval.`,
    type: "SUCCESS",
  });

  res.json(listSwapRequests(fund.id));
});

// Super Admin can delete any swap request outright, at any stage — a full
// override on top of the normal reject flow.
router.delete("/:requestId", authenticate, authorize("SUPER_ADMIN"), (req: AuthedRequest, res) => {
  const swap = getSwapRequest(req.params.requestId);
  if (!swap || swap.fund_id !== req.params.fundId) return res.status(404).json({ error: "Swap request not found" });
  const fund = getFund(swap.fund_id)!;

  db.prepare("DELETE FROM fortune_swap_requests WHERE id = ?").run(swap.id);
  logAudit({ userId: req.user!.userId, fundId: fund.id, action: "DELETE_FORTUNE_SWAP", description: `Super Admin deleted a position swap request record in "${fund.name}"` });

  res.json(listSwapRequests(fund.id));
});

export default router;
