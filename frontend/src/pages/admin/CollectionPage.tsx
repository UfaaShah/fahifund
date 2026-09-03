import { useState } from "react";
import { useParams } from "react-router-dom";
import { useFund, useInvalidateFund, useMonth } from "../../lib/queries";
import { api, ApiError, assetUrl } from "../../lib/api";
import { Button, Card, ErrorBanner, LoadingScreen, ProgressBar, StatusBadge, Avatar, inputClass } from "../../components/ui";
import { money } from "../../lib/format";

export default function CollectionPage() {
  const { fundId } = useParams();
  const { data: fund } = useFund(fundId);
  const { data: month, isLoading } = useMonth(fundId, fund?.currentMonth);
  const invalidate = useInvalidateFund();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState<number | null>(null);

  if (isLoading || !fund) return <LoadingScreen />;

  if (fund.isCompleted || !month) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Collection</h1>
        <Card className="p-5"><p className="text-sm text-slate-500">This fund has no open month right now.</p></Card>
      </div>
    );
  }

  const f = fund.fund;

  async function verify(paymentId: string, action: "CONFIRM" | "REJECT", note?: string) {
    setBusyId(paymentId);
    setError(null);
    try {
      await api.patch(`/funds/${fundId}/payments/${paymentId}/verify`, { action, note });
      invalidate(fundId!);
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update payment");
    } finally {
      setBusyId(null);
    }
  }

  async function remind() {
    setReminding(true);
    try {
      const res = await api.post<{ remindedCount: number }>(`/funds/${fundId}/payments/remind`);
      setReminded(res.remindedCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send reminders");
    } finally {
      setReminding(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Collection</h1>
        <Button variant="secondary" onClick={remind} disabled={reminding || month.pendingCount === 0}>
          {reminding ? "Sending…" : "Send Reminder"}
        </Button>
      </div>
      {error && <ErrorBanner message={error} />}
      {reminded !== null && <p className="text-sm text-brand-600">Reminded {reminded} member(s).</p>}

      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Month {month.monthNumber} Collection</p>
        <div className="mt-2 flex items-baseline justify-between">
          <p className="text-sm text-slate-500">Expected: {money(month.expectedTotal, f.currency)}</p>
          <p className="text-sm text-slate-500">Received: {money(month.receivedTotal, f.currency)}</p>
        </div>
        <div className="mt-3">
          <ProgressBar value={month.paidCount} max={month.expectedMembers} />
          <p className="mt-1.5 text-xs text-slate-500">
            {month.paidCount} / {month.expectedMembers} Members Paid
          </p>
        </div>
      </Card>

      <Card className="divide-y divide-slate-100">
        {month.payments.length === 0 && fund.members.length === 0 && <p className="p-4 text-sm text-slate-500">No members in this fund yet.</p>}
        {month.payments.map((p) => (
          <div key={p.id} className="p-4">
            <div className="flex items-center gap-3">
              <Avatar name={p.name || "?"} photoUrl={p.photo_url} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">{money(p.amount, f.currency)}</p>
              </div>
              <StatusBadge status={p.status} />
            </div>
            {p.receipt_path && (
              <a href={assetUrl(p.receipt_path)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">
                View receipt
              </a>
            )}
            {p.status === "SENT" && (
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" disabled={busyId === p.id} onClick={() => verify(p.id, "CONFIRM")}>
                  {busyId === p.id ? "…" : "Confirm"}
                </Button>
                <Button variant="danger" className="flex-1" disabled={busyId === p.id} onClick={() => setRejectingId(p.id)}>
                  Reject
                </Button>
              </div>
            )}
            {rejectingId === p.id && (
              <div className="mt-3 space-y-2">
                <input className={inputClass} placeholder="Reason for rejection" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setRejectingId(null)}>
                    Cancel
                  </Button>
                  <Button variant="danger" className="flex-1" disabled={busyId === p.id} onClick={() => verify(p.id, "REJECT", rejectReason)}>
                    Confirm Reject
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {fund.members
          .filter((m) => !month.payments.some((p) => p.member_id === m.user_id))
          .map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4 opacity-70">
              <Avatar name={m.name} photoUrl={m.photo_url} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{m.name}</p>
                <p className="text-xs text-slate-400">Not yet submitted</p>
              </div>
              <StatusBadge status="PENDING" />
            </div>
          ))}
      </Card>
    </div>
  );
}
