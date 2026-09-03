import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useFund, useInvalidateFund, useMyPayments } from "../lib/queries";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorBanner, LoadingScreen, StatusBadge, SuccessBanner, SectionTitle, inputClass } from "../components/ui";
import { money, monthLabel, shortDate } from "../lib/format";
import { UploadIcon, BankIcon } from "../components/icons";

export default function PaymentsPage() {
  const { fundId } = useParams();
  const { user } = useAuth();
  const { data: fund, isLoading } = useFund(fundId);
  const { data: history } = useMyPayments(fundId);
  const invalidate = useInvalidateFund();

  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (isLoading || !fund) return <LoadingScreen />;

  const f = fund.fund;
  const month = fund.currentMonthSummary;
  const myPayment = month?.payments.find((p) => p.member_id === user!.id);
  const alreadyConfirmed = myPayment?.status === "CONFIRMED";
  const alreadySent = myPayment?.status === "SENT";

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      if (file) form.append("receipt", file);
      if (reference) form.append("referenceNumber", reference);
      await api.post(`/funds/${fundId}/payments`, form);
      invalidate(fundId!);
      setSubmitted(true);
      setFile(null);
      setReference("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">Monthly Contribution</h1>

      {fund.isCompleted ? (
        <Card className="p-5">
          <p className="text-sm text-slate-500">This fund has completed all {f.durationMonths} months. No further contributions are due.</p>
        </Card>
      ) : month ? (
        <>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{monthLabel(f.startDate, month.monthNumber)}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{money(month.contributionAmount, f.currency)}</p>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <BankIcon width={14} height={14} /> Pay to
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-800">{fund.admin?.name || "Admin not yet assigned"}</p>
              {fund.adminBankAccount ? (
                <p className="text-xs text-slate-500">
                  {fund.adminBankAccount.bankName} · {fund.adminBankAccount.accountName} · {fund.adminBankAccount.accountNumber}
                </p>
              ) : (
                <p className="text-xs text-amber-600">Bank details not on file yet — contact your Admin.</p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-slate-500">Payment Status</span>
              <StatusBadge status={myPayment?.status || "PENDING"} />
            </div>
            {myPayment?.status === "REJECTED" && myPayment.note && (
              <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">Rejected: {myPayment.note}. You can resubmit below.</p>
            )}
          </Card>

          {alreadyConfirmed ? (
            <SuccessBanner message="Your payment for this month has been confirmed. Thank you!" />
          ) : submitted && alreadySent ? (
            <SuccessBanner message="Payment submitted. Waiting for Admin confirmation." />
          ) : (
            <Card className="p-5">
              <SectionTitle>{alreadySent ? "Update your submission" : "I Have Paid"}</SectionTitle>
              {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
              <form onSubmit={submitPayment} className="space-y-3">
                <input
                  className={inputClass}
                  placeholder="Reference number (optional)"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 hover:border-brand-300">
                  <UploadIcon width={18} height={18} />
                  {file ? file.name : "Upload receipt (optional)"}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Submitting…" : alreadySent ? "Update Submission" : "I Have Paid"}
                </Button>
              </form>
            </Card>
          )}
        </>
      ) : (
        <LoadingScreen />
      )}

      <div>
        <SectionTitle>Payment History</SectionTitle>
        <Card className="divide-y divide-slate-100">
          {!history || history.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No payments yet.</p>
          ) : (
            history.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">{monthLabel(f.startDate, p.month_number)}</p>
                  <p className="text-xs text-slate-400">{shortDate(p.payment_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{money(p.amount, f.currency)}</p>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
