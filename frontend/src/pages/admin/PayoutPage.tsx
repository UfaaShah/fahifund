import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useFund, useInvalidateFund, useMonth } from "../../lib/queries";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorBanner, LoadingScreen, StatusBadge, SuccessBanner, Avatar, inputClass, Field } from "../../components/ui";
import { money, monthLabel } from "../../lib/format";
import { UploadIcon, BankIcon } from "../../components/icons";

export default function PayoutPage() {
  const { fundId } = useParams();
  const { user } = useAuth();
  const { data: fund } = useFund(fundId);
  const { data: month, isLoading } = useMonth(fundId, fund?.currentMonth);
  const invalidate = useInvalidateFund();

  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [override, setOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (isLoading || !fund) return <LoadingScreen />;

  if (fund.isCompleted || !month) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Payout</h1>
        <Card className="p-5"><p className="text-sm text-slate-500">No payout is currently due for this fund.</p></Card>
      </div>
    );
  }

  const f = fund.fund;
  const collectionComplete = month.paidCount >= month.expectedMembers;
  const alreadyDone = month.status === "COMPLETED";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("payoutDate", payoutDate);
      if (referenceNumber) form.append("referenceNumber", referenceNumber);
      if (file) form.append("proof", file);
      if (override) form.append("override", "true");
      await api.post(`/funds/${fundId}/payouts/${month!.monthNumber}/complete`, form);
      invalidate(fundId!);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to complete payout");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">Payout</h1>

      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{monthLabel(f.startDate, month.monthNumber)} Beneficiary</p>
        <div className="mt-2 flex items-center gap-3">
          <Avatar name={month.beneficiary?.name || "?"} photoUrl={month.beneficiary?.photoUrl} size={44} />
          <div>
            <p className="font-semibold text-slate-900">{month.beneficiary?.name || "TBD"}</p>
            <p className="text-xs text-slate-500">{money(month.expectedTotal, f.currency)}</p>
          </div>
        </div>
        {month.beneficiary?.bankAccount ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <BankIcon width={14} height={14} /> Send to
            </div>
            <p className="mt-1 text-sm text-slate-800">
              {month.beneficiary.bankAccount.bankName} · {month.beneficiary.bankAccount.accountName}
            </p>
            <p className="text-xs text-slate-500">{month.beneficiary.bankAccount.accountNumber}</p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-600">This member hasn't added a bank account yet.</p>
        )}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">Status</span>
          <StatusBadge status={month.status} />
        </div>
      </Card>

      {alreadyDone || done ? (
        <SuccessBanner message="Payout completed ✓" />
      ) : (
        <Card className="p-5">
          {!collectionComplete && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              Collection isn't complete yet ({month.paidCount}/{month.expectedMembers} paid).{" "}
              {user!.role === "SUPER_ADMIN" ? "You may override this as Super Admin." : "Ask your Super Admin to override if needed."}
            </p>
          )}
          {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
          <form onSubmit={submit} className="space-y-3">
            <Field label="Payout date">
              <input type="date" className={inputClass} value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} required />
            </Field>
            <Field label="Transaction / reference number">
              <input className={inputClass} value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="e.g. TXN-000123" />
            </Field>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 hover:border-brand-300">
              <UploadIcon width={18} height={18} />
              {file ? file.name : "Upload payment proof (optional)"}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            {!collectionComplete && user!.role === "SUPER_ADMIN" && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                Override — send payout even though collection is incomplete
              </label>
            )}
            <Button
              type="submit"
              disabled={submitting || (!collectionComplete && !override)}
              className="w-full"
            >
              {submitting ? "Sending…" : "Mark Payout as Sent"}
            </Button>
          </form>
        </Card>
      )}

      <Link to={`/app/funds/${fundId}/payout-history`} className="block text-center text-sm font-medium text-brand-600 hover:underline">
        View payout history
      </Link>
    </div>
  );
}
