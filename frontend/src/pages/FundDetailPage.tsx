import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useFund, useFortuneSwaps, useInvalidateFund, useUsers } from "../lib/queries";
import { api, ApiError } from "../lib/api";
import { Card, LoadingScreen, StatusBadge, Button, ErrorBanner, SectionTitle, Field, inputClass, Avatar } from "../components/ui";
import { money, shortDate } from "../lib/format";
import { BankIcon, ChevronRightIcon, UsersIcon, WheelIcon, ReportIcon, AuditIcon, SwapIcon } from "../components/icons";
import type { FundMemberRow } from "../lib/types";

export default function FundDetailPage() {
  const { fundId } = useParams();
  const { user } = useAuth();
  const { data: fund, isLoading } = useFund(fundId);
  const invalidate = useInvalidateFund();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !fund) return <LoadingScreen />;

  const isSuperAdmin = user!.role === "SUPER_ADMIN";
  const f = fund.fund;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{f.name}</h1>
            {f.description && <p className="mt-0.5 text-sm text-slate-500">{f.description}</p>}
          </div>
          <StatusBadge status={f.status} />
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card className="grid grid-cols-2 gap-4 p-4 text-sm">
        <Info label="Monthly Contribution" value={money(f.contributionAmount, f.currency)} />
        <Info label="Duration" value={`${f.durationMonths} months`} />
        <Info label="Start Date" value={shortDate(f.startDate)} />
        <Info label="Members" value={String(fund.memberCount)} />
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <BankIcon width={16} height={16} /> Collecting Admin
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-900">{fund.admin?.name || "Not assigned yet"}</p>
            {fund.adminBankAccount ? (
              <p className="text-xs text-slate-500">
                {fund.adminBankAccount.bankName} · {fund.adminBankAccount.accountNumber}
              </p>
            ) : (
              <p className="text-xs text-amber-600">No bank account on file yet</p>
            )}
          </div>
          {isSuperAdmin && !f.fortuneLockedAt && <AssignAdminButton fundId={f.id} currentAdminId={f.adminId} />}
        </div>
      </Card>

      {fund.currentMonthSummary && !fund.isCompleted && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">This month</p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900">{fund.currentBeneficiary?.name || "TBD"} is receiving</p>
              <p className="text-xs text-slate-500">
                {fund.currentMonthSummary.paidCount}/{fund.currentMonthSummary.expectedMembers} paid ·{" "}
                {money(fund.currentMonthSummary.receivedTotal, f.currency)} of {money(fund.currentMonthSummary.expectedTotal, f.currency)}
              </p>
            </div>
            <StatusBadge status={fund.currentMonthSummary.status} />
          </div>
        </Card>
      )}

      <div>
        <SectionTitle>Manage</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <LinkTile to={`/app/funds/${f.id}/members`} icon={<UsersIcon />} label="Members" />
          <LinkTile to={`/app/funds/${f.id}/fortune`} icon={<WheelIcon />} label="Fortune Order" />
          <LinkTile to={`/app/funds/${f.id}/timeline`} icon={<ChevronRightIcon />} label="Timeline" />
          {isSuperAdmin && !f.fortuneLockedAt && <LinkTile to={`/app/funds/${f.id}/fortune-wheel`} icon={<WheelIcon />} label="Run Fortune Wheel" highlight />}
          {isSuperAdmin && (
            <>
              <LinkTile to={`/app/reports?fundId=${f.id}`} icon={<ReportIcon />} label="Reports" />
              <LinkTile to={`/app/audit-logs?fundId=${f.id}`} icon={<AuditIcon />} label="Audit Log" />
            </>
          )}
        </div>
      </div>

      {isSuperAdmin && !f.fortuneLockedAt && <EditFundDetails fund={f} onError={setError} />}

      {isSuperAdmin && (f.status === "DRAFT" || f.status === "FORTUNE_PENDING") && (
        <DangerZone
          label="Cancel this fund"
          description="Cancel this fund before it starts. This cannot be undone."
          confirmLabel="Yes, cancel fund"
          onConfirm={async () => {
            setError(null);
            try {
              await api.post(`/funds/${f.id}/cancel`);
              invalidate(f.id);
              navigate("/app/funds");
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Failed to cancel fund");
            }
          }}
        />
      )}

      {isSuperAdmin && (f.status === "DRAFT" || f.status === "FORTUNE_PENDING") && (
        <DangerZone
          label="Delete this fund permanently"
          description="Only possible when the fund has no payment or payout history yet — otherwise cancel it instead. This removes it entirely rather than just marking it cancelled."
          confirmLabel="Yes, delete permanently"
          onConfirm={async () => {
            setError(null);
            try {
              await api.delete(`/funds/${f.id}`);
              navigate("/app/funds");
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Failed to delete fund");
            }
          }}
        />
      )}

      {f.fortuneLockedAt && f.status !== "COMPLETED" && f.status !== "CANCELLED" && (
        <FortuneSwapRequests members={fund.members} viewerRole={fund.viewerRole} currentUserId={user!.id} />
      )}

      {isSuperAdmin && f.fortuneLockedAt && f.status !== "COMPLETED" && (
        <ResetFortuneOrder fundId={f.id} onError={setError} />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function LinkTile({ to, icon, label, highlight }: { to: string; icon: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-start gap-2 rounded-2xl p-4 text-sm font-semibold shadow-sm ring-1 ${
        highlight ? "bg-fortune-500/10 text-fortune-600 ring-fortune-500/20" : "bg-white text-slate-700 ring-slate-900/5 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

function EditFundDetails({ fund, onError }: { fund: any; onError: (m: string) => void }) {
  const invalidate = useInvalidateFund();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fund.name);
  const [description, setDescription] = useState(fund.description || "");
  const [contributionAmount, setContributionAmount] = useState(String(fund.contributionAmount));
  const [durationMonths, setDurationMonths] = useState(String(fund.durationMonths));
  const [startDate, setStartDate] = useState(fund.startDate?.slice(0, 10) || "");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-left text-sm font-medium text-brand-600 hover:underline">
        Edit fund details
      </button>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      await api.patch(`/funds/${fund.id}`, {
        name,
        description: description || undefined,
        contributionAmount: Number(contributionAmount),
        durationMonths: Number(durationMonths),
        startDate,
      });
      invalidate(fund.id);
      setOpen(false);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Failed to update fund");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <SectionTitle>Edit fund details</SectionTitle>
      <form onSubmit={save} className="space-y-3">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description" hint="Optional">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monthly contribution">
            <input
              className={inputClass}
              type="number"
              min="1"
              step="0.01"
              value={contributionAmount}
              onChange={(e) => setContributionAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Duration (months)">
            <input
              className={inputClass}
              type="number"
              min="1"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Start date">
          <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AssignAdminButton({ fundId, currentAdminId }: { fundId: string; currentAdminId: string | null }) {
  const { data: users } = useUsers();
  const invalidate = useInvalidateFund();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function assign(userId: string) {
    setSaving(true);
    try {
      await api.post(`/funds/${fundId}/admin`, { adminId: userId });
      invalidate(fundId);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
        {currentAdminId ? "Change" : "Assign"}
      </button>
    );
  }

  return (
    <select
      autoFocus
      disabled={saving}
      defaultValue=""
      onChange={(e) => e.target.value && assign(e.target.value)}
      onBlur={() => setOpen(false)}
      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
    >
      <option value="" disabled>
        Select member…
      </option>
      {users?.filter((u) => u.status === "ACTIVE").map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}

function DangerZone({
  label,
  description,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="border border-rose-100 p-4">
      <p className="text-sm font-semibold text-rose-700">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      {!confirming ? (
        <Button variant="danger" className="mt-3" onClick={() => setConfirming(true)}>
          {label}
        </Button>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Never mind
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ResetFortuneOrder({ fundId, onError }: { fundId: string; onError: (m: string) => void }) {
  const invalidate = useInvalidateFund();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="border border-rose-100 p-4">
      <p className="text-sm font-semibold text-rose-700">Reset locked Fortune order</p>
      <p className="mt-1 text-xs text-slate-500">
        Only possible before any payment has been confirmed. This is destructive and is recorded in the audit log.
      </p>
      {!confirming ? (
        <Button variant="danger" className="mt-3" onClick={() => setConfirming(true)}>
          Reset Fortune order
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <input className={inputClass} placeholder="Reason for reset" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Never mind
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                onError("");
                try {
                  await api.post(`/funds/${fundId}/fortune-wheel/reset`, { confirm: true, reason });
                  invalidate(fundId);
                  navigate(`/app/funds/${fundId}/fortune-wheel`);
                } catch (err) {
                  onError(err instanceof ApiError ? err.message : "Failed to reset");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Working…" : "Confirm reset"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function FortuneSwapRequests({
  members,
  viewerRole,
  currentUserId,
}: {
  members: FundMemberRow[];
  viewerRole: "SUPER_ADMIN" | "ADMIN" | "MEMBER";
  currentUserId: string;
}) {
  const { fundId } = useParams();
  const { data: swaps, isLoading } = useFortuneSwaps(fundId);
  const invalidate = useInvalidateFund();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isSuperAdmin = viewerRole === "SUPER_ADMIN";

  async function act(id: string, action: string, body?: any) {
    setError(null);
    setBusyId(id);
    try {
      await api.post(`/funds/${fundId}/fortune-swaps/${action}`, body);
      invalidate(fundId!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await api.delete(`/funds/${fundId}/fortune-swaps/${id}`);
      invalidate(fundId!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  // Requests where this viewer has something to do (approve, or Super Admin's final approval)
  // float to the top so they aren't buried under settled/watching-only ones.
  const sorted = [...(swaps || [])].sort((a, b) => {
    const rank = (s: any) => {
      const myApprovalPending =
        (s.member_a_id === currentUserId && !s.member_a_approved_at) ||
        (s.member_b_id === currentUserId && !s.member_b_approved_at);
      if (s.status === "PENDING" && myApprovalPending) return 0;
      if (s.status === "READY_FOR_FINAL_APPROVAL" && isSuperAdmin) return 0;
      if (s.status === "PENDING" || s.status === "READY_FOR_FINAL_APPROVAL") return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <SwapIcon width={16} height={16} className="shrink-0" /> Swap Requests
        </h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="shrink-0 text-sm font-medium text-brand-600 hover:underline">
            Request a swap
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {showForm && (
        <SwapRequestForm
          members={members}
          isSuperAdmin={isSuperAdmin}
          currentUserId={currentUserId}
          onCancel={() => setShowForm(false)}
          onSubmit={async (memberAId, memberBId, reason) => {
            setError(null);
            try {
              await api.post(`/funds/${fundId}/fortune-swaps`, { memberAId, memberBId, reason: reason || undefined });
              invalidate(fundId!);
              setShowForm(false);
            } catch (err) {
              throw err;
            }
          }}
        />
      )}

      {!isLoading && sorted.length === 0 && !showForm && (
        <p className="mt-2 text-sm text-slate-500">No swap requests yet. A member can hold more than one open request at a time.</p>
      )}

      {sorted.length > 0 && (
        <div className="mt-3 space-y-2">
          {sorted.map((s) => {
            const myApprovalPending =
              (s.member_a_id === currentUserId && !s.member_a_approved_at) ||
              (s.member_b_id === currentUserId && !s.member_b_approved_at);
            const canApprove = s.status === "PENDING" && myApprovalPending;
            const canFinalApprove = s.status === "READY_FOR_FINAL_APPROVAL" && isSuperAdmin;
            const canReject = (s.status === "PENDING" || s.status === "READY_FOR_FINAL_APPROVAL") && (myApprovalPending || isSuperAdmin);
            const busy = busyId === s.id;
            const needsAction = canApprove || canFinalApprove;
            return (
              <div
                key={s.id}
                className={`rounded-xl p-3 ${
                  needsAction ? "bg-fortune-500/10 ring-1 ring-fortune-500/25" : "bg-slate-50 ring-1 ring-slate-100"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex -space-x-2.5 shrink-0">
                      <Avatar name={s.member_a_name} photoUrl={s.member_a_photo} size={30} />
                      <Avatar name={s.member_b_name} photoUrl={s.member_b_photo} size={30} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {s.member_a_id === currentUserId ? "You" : s.member_a_name}
                        <span className="mx-1 text-slate-300">⇄</span>
                        {s.member_b_id === currentUserId ? "You" : s.member_b_name}
                      </p>
                      {s.member_a_position && s.member_b_position && (
                        <p className="text-xs text-slate-400">Position #{s.member_a_position} ⇄ #{s.member_b_position}</p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                {needsAction && (
                  <p className="mt-2 text-xs font-semibold text-fortune-600">
                    {canFinalApprove ? "Ready for your final approval" : "Your approval is needed"}
                  </p>
                )}
                {s.reason && <p className="mt-2 text-xs text-slate-500">Reason: {s.reason}</p>}
                <p className="mt-1 text-xs text-slate-400">Requested by {s.requested_by_name}</p>
                {s.status === "REJECTED" && s.rejection_reason && (
                  <p className="mt-1 text-xs text-rose-600">Declined: {s.rejection_reason}</p>
                )}

                {(canApprove || canFinalApprove || canReject || isSuperAdmin) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canApprove && (
                      <Button className="px-3 py-2 text-xs" disabled={busy} onClick={() => act(s.id, `${s.id}/approve`)}>
                        Approve
                      </Button>
                    )}
                    {canFinalApprove && (
                      <Button className="bg-fortune-600 px-3 py-2 text-xs hover:bg-fortune-600/90" disabled={busy} onClick={() => act(s.id, `${s.id}/approve-final`)}>
                        Give Final Approval & Swap
                      </Button>
                    )}
                    {canReject && (
                      <Button variant="secondary" className="px-3 py-2 text-xs !text-rose-600" disabled={busy} onClick={() => act(s.id, `${s.id}/reject`)}>
                        Decline
                      </Button>
                    )}
                    {isSuperAdmin && (
                      <button
                        disabled={busy}
                        onClick={() => remove(s.id)}
                        className="ml-auto text-xs font-medium text-slate-400 hover:text-rose-600 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SwapRequestForm({
  members,
  isSuperAdmin,
  currentUserId,
  onCancel,
  onSubmit,
}: {
  members: FundMemberRow[];
  isSuperAdmin: boolean;
  currentUserId: string;
  onCancel: () => void;
  onSubmit: (memberAId: string, memberBId: string, reason: string) => Promise<void>;
}) {
  const [memberAId, setMemberAId] = useState(isSuperAdmin ? "" : currentUserId);
  const [memberBId, setMemberBId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const me = members.find((m) => m.user_id === currentUserId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberAId || !memberBId || memberAId === memberBId) {
      setErr("Choose two different members");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit(memberAId, memberBId, reason);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Failed to request swap");
    } finally {
      setSaving(false);
    }
  }

  const memberA = members.find((m) => m.user_id === memberAId);
  const memberB = members.find((m) => m.user_id === memberBId);

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-slate-100 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={isSuperAdmin ? "First member" : "You"}>
          {isSuperAdmin ? (
            <select className={inputClass} value={memberAId} onChange={(e) => setMemberAId(e.target.value)}>
              <option value="">Select…</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input className={inputClass} value={me?.name || "You"} disabled />
          )}
        </Field>
        <Field label="Swap with">
          <select className={inputClass} value={memberBId} onChange={(e) => setMemberBId(e.target.value)}>
            <option value="">Select…</option>
            {members
              .filter((m) => m.user_id !== memberAId)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      {memberA && memberB && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <Avatar name={memberA.name} photoUrl={memberA.photo_url} size={24} />
          <span className="text-xs font-medium text-slate-600">
            {isSuperAdmin ? memberA.name : "You"} will swap Fortune positions with {memberB.name}
          </span>
          <Avatar name={memberB.name} photoUrl={memberB.photo_url} size={24} />
        </div>
      )}

      <Field label="Reason" hint="Optional">
        <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {err && <p className="text-xs font-medium text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Requesting…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}
