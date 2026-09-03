import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { usePrimaryFund } from "../../lib/usePrimaryFund";
import { useMonth } from "../../lib/queries";
import { Card, EmptyState, LoadingScreen, ProgressBar, StatusBadge, Avatar } from "../../components/ui";
import { money, monthLabel } from "../../lib/format";
import { PaymentsIcon } from "../../components/icons";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { primary, isLoading, data: funds } = usePrimaryFund();
  const { data: month } = useMonth(primary?.fund.id, primary?.currentMonth);

  if (isLoading) return <LoadingScreen />;

  if (!funds || funds.length === 0 || !primary) {
    return (
      <div>
        <Header name={user!.name} />
        <EmptyState icon={<PaymentsIcon width={36} height={36} />} title="No fund assigned yet" message="Once a Super Admin assigns you as Admin of a fund, it will appear here." />
      </div>
    );
  }

  const fund = primary.fund;

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

      {primary.isCompleted ? (
        <Card className="bg-brand-600 p-5 text-white">
          <p className="text-sm font-medium text-brand-100">Fund Completed 🎉</p>
          <p className="mt-1 text-lg font-bold">{fund.name}</p>
        </Card>
      ) : month ? (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">{monthLabel(fund.startDate, month.monthNumber)}</p>
              <StatusBadge status={month.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <Stat label="Monthly Contribution" value={money(month.contributionAmount, fund.currency)} />
              <Stat label="Expected Collection" value={money(month.expectedTotal, fund.currency)} />
              <Stat label="Received" value={money(month.receivedTotal, fund.currency)} valueClass="text-brand-600" />
              <Stat label="Pending" value={money(month.expectedTotal - month.receivedTotal, fund.currency)} valueClass="text-amber-600" />
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                <span>{month.paidCount} of {month.expectedMembers} members paid</span>
                <span>{month.pendingCount} pending</span>
              </div>
              <ProgressBar value={month.paidCount} max={month.expectedMembers} />
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Beneficiary</p>
            <div className="mt-2 flex items-center gap-3">
              <Avatar name={month.beneficiary?.name || "?"} photoUrl={month.beneficiary?.photoUrl} size={40} />
              <div>
                <p className="font-semibold text-slate-900">{month.beneficiary?.name || "TBD"}</p>
                <p className="text-xs text-slate-500">Payout {money(month.expectedTotal, fund.currency)}</p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Link to={`/app/funds/${fund.id}/collection`} className="rounded-2xl bg-brand-600 p-4 text-center text-sm font-semibold text-white hover:bg-brand-700">
              Manage Collection
            </Link>
            <Link to={`/app/funds/${fund.id}/payout`} className="rounded-2xl bg-white p-4 text-center text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5 hover:bg-slate-50">
              Manage Payout
            </Link>
          </div>
        </>
      ) : (
        <LoadingScreen />
      )}
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
      <p className="text-xs text-slate-400">Admin</p>
    </div>
  );
}

function Stat({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-base font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
