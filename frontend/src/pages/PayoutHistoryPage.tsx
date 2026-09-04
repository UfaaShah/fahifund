import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useFund, useInvalidateFund, usePayoutHistory } from "../lib/queries";
import { api, ApiError } from "../lib/api";
import { BackButton, Button, Card, EmptyState, ErrorBanner, Field, LoadingScreen, StatusBadge, Avatar, inputClass } from "../components/ui";
import { money, monthLabel, shortDate } from "../lib/format";
import { FundIcon } from "../components/icons";

const PAYOUT_STATUSES = ["WAITING_COLLECTION", "READY", "PROCESSING", "COMPLETED"] as const;

export default function PayoutHistoryPage() {
  const { fundId } = useParams();
  const { user } = useAuth();
  const { data: fund } = useFund(fundId);
  const { data: payouts, isLoading } = usePayoutHistory(fundId);
  const invalidate = useInvalidateFund();

  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editStatus, setEditStatus] = useState<string>("READY");
  const [editReference, setEditReference] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (isLoading || !fund) return <LoadingScreen />;

  const isSuperAdmin = user!.role === "SUPER_ADMIN";

  function startEdit(p: any) {
    setEditingId(p.id);
    setEditAmount(String(p.amount));
    setEditStatus(p.status);
    setEditReference(p.reference_number || "");
  }

  async function saveEdit(payoutId: string) {
    setSavingEdit(true);
    setError(null);
    try {
      await api.patch(`/funds/${fundId}/payouts/${payoutId}`, {
        amount: Number(editAmount),
        status: editStatus,
        referenceNumber: editReference || undefined,
      });
      invalidate(fundId!);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update payout");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deletePayout(payoutId: string) {
    setError(null);
    try {
      await api.delete(`/funds/${fundId}/payouts/${payoutId}`);
      invalidate(fundId!);
      setDeletingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete payout");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-xl font-bold text-slate-900">Payout History</h1>
      </div>
      {error && <ErrorBanner message={error} />}
      {!payouts || payouts.length === 0 ? (
        <EmptyState icon={<FundIcon width={36} height={36} />} title="No payouts yet" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {payouts.map((p: any) => (
            <div key={p.id} className="p-4">
              <div className="flex items-center gap-3">
                <Avatar name={p.beneficiary_name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{p.beneficiary_name}</p>
                  <p className="text-xs text-slate-500">
                    {monthLabel(fund.fund.startDate, p.month_number)} · {shortDate(p.payout_date)}
                    {p.reference_number ? ` · ${p.reference_number}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{money(p.amount, fund.fund.currency)}</p>
                  <StatusBadge status={p.status} />
                </div>
              </div>
              {isSuperAdmin && editingId !== p.id && deletingId !== p.id && (
                <div className="mt-2 flex gap-3">
                  <button type="button" onClick={() => startEdit(p)} className="text-xs font-medium text-slate-500 hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => setDeletingId(p.id)} className="text-xs font-medium text-rose-600 hover:underline">
                    Delete
                  </button>
                </div>
              )}
              {isSuperAdmin && editingId === p.id && (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                  <Field label="Amount">
                    <input className={inputClass} type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                  </Field>
                  <Field label="Status">
                    <select className={inputClass} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                      {PAYOUT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Reference number">
                    <input className={inputClass} value={editReference} onChange={(e) => setEditReference(e.target.value)} />
                  </Field>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button className="flex-1" disabled={savingEdit} onClick={() => saveEdit(p.id)}>
                      {savingEdit ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              )}
              {isSuperAdmin && deletingId === p.id && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 p-3">
                  <p className="flex-1 text-xs text-rose-700">Permanently delete this payout record?</p>
                  <Button variant="secondary" onClick={() => setDeletingId(null)}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={() => deletePayout(p.id)}>
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
