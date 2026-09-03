import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { usePrimaryFund } from "../../lib/usePrimaryFund";
import { useFund, useMonth } from "../../lib/queries";
import { Card, EmptyState, LoadingScreen, ProgressBar, StatusBadge, Avatar } from "../../components/ui";
import { money, monthLabel } from "../../lib/format";
import { FundIcon, ChevronRightIcon } from "../../components/icons";

export default function UserDashboard() {
  const { user } = useAuth();
  const { primary, isLoading, data: funds } = usePrimaryFund();
  const { data: detail } = useFund(primary?.fund.id);
  const { data: month } = useMonth(primary?.fund.id, primary?.currentMonth);

  if (isLoading) return <LoadingScreen />;

  if (!funds || funds.length === 0 || !primary) {
    return (
      <div>
        <Header name={user!.name} />
        <EmptyState
          icon={<FundIcon width={36} height={36} />}
          title="You're not in a fund yet"
          message="Once a Super Admin adds you to a Fahi Fund group, it will appear here."
        />
      </div>
    );
  }

  const myPayment = month?.payments.find((p) => p.member_id === user!.id);
  // Most members hold exactly one slot; a multi-slot member holds one
  // position per slot, so this can be more than one entry.
  const myOrderEntries = detail?.fortuneOrder.filter((o) => o.member_id === user!.id) ?? [];
  const myMembership = detail?.members.find((m) => m.user_id === user!.id);
  const mySlots = myMembership?.slots || 1;
  const fund = primary.fund;
  const isFundCompleted = primary.isCompleted;

  return (
    <div className="space-y-5">
      <Header name={user!.name} />

      {funds.length > 1 && (
        <p className="text-sm text-slate-500">
          Showing <span className="font-medium text-slate-700">{fund.name}</span> ·{" "}
          <Link to="/app/funds" className="text-brand-600 hover:underline">
            view all {funds.length} funds
          </Link>
        </p>
      )}

      {isFundCompleted ? (
        <Card className="bg-brand-600 p-5 text-white">
          <p className="text-sm font-medium text-brand-100">Fund Completed 🎉</p>
          <p className="mt-1 text-lg font-bold">{fund.name}</p>
          <p className="mt-1 text-sm text-brand-100">All members received their scheduled fund.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={mySlots > 1 ? `My Monthly Contribution (${mySlots} slots)` : "My Monthly Contribution"}
              value={money(fund.contributionAmount * mySlots, fund.currency)}
            />
            <StatCard label="Current Month" value={primary.currentMonth ? monthLabel(fund.startDate, primary.currentMonth) : "—"} />
          </div>

          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Beneficiary</p>
            <div className="mt-2 flex items-center gap-3">
              <Avatar name={primary.currentBeneficiary?.name || "?"} photoUrl={primary.currentBeneficiary?.photoUrl} size={40} />
              <div>
                <p className="font-semibold text-slate-900">{primary.currentBeneficiary?.name || "TBD"}</p>
                <p className="text-xs text-slate-500">{primary.currentBeneficiary?.memberCode}</p>
              </div>
              {month && <span className="ml-auto"><StatusBadge status={month.status} /></span>}
            </div>
          </Card>

          {myPayment?.status !== "CONFIRMED" && (
            <Link
              to={`/app/funds/${fund.id}/payments`}
              className="flex items-center justify-between rounded-2xl bg-fortune-500/10 px-4 py-3.5 text-sm font-semibold text-fortune-600 ring-1 ring-fortune-500/20"
            >
              {myPayment?.status === "SENT" ? "Your payment is awaiting confirmation" : "Your contribution is due — pay now"}
              <ChevronRightIcon />
            </Link>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={myOrderEntries.length > 1 ? "My Fortune Positions" : "My Fortune Position"}
              value={myOrderEntries.length > 0 ? myOrderEntries.map((o) => `#${o.position}`).join(", ") : "—"}
            />
            <StatCard
              label={myOrderEntries.length > 1 ? "My Payout Months" : "My Payout Month"}
              value={
                myOrderEntries.length > 0
                  ? myOrderEntries.map((o) => monthLabel(fund.startDate, o.month_number)).join(", ")
                  : "—"
              }
            />
          </div>

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fund Progress</p>
              <p className="text-xs font-medium text-slate-500">
                {primary.monthsCompleted} / {fund.durationMonths} months
              </p>
            </div>
            <ProgressBar value={primary.monthsCompleted} max={fund.durationMonths} />
          </Card>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to={`/app/funds/${fund.id}/fortune`} className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5 hover:bg-slate-50">
          View Fortune Order
        </Link>
        <Link to={`/app/funds/${fund.id}/timeline`} className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5 hover:bg-slate-50">
          View Fund Timeline
        </Link>
      </div>
    </div>
  );
}

function Header({ name }: { name: string }) {
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <p className="text-sm text-slate-500">{greeting},</p>
      <h1 className="text-2xl font-bold text-slate-900">{name.split(" ")[0]}</h1>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1.5 text-lg font-bold text-slate-900">{value}</p>
    </Card>
  );
}
