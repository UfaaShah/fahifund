import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useFunds, useSuperAdminDashboard } from "../../lib/queries";
import { Card, LoadingScreen, ProgressBar, StatusBadge } from "../../components/ui";
import { money } from "../../lib/format";
import { PlusIcon } from "../../components/icons";

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useSuperAdminDashboard();
  const { data: funds, isLoading: fundsLoading } = useFunds();

  if (statsLoading || fundsLoading) return <LoadingScreen />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Welcome back,</p>
          <h1 className="text-2xl font-bold text-slate-900">{user!.name.split(" ")[0]}</h1>
        </div>
        <Link to="/app/funds/new" className="hidden items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 md:flex">
          <PlusIcon width={18} height={18} /> Create Fund
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Total Funds" value={String(stats?.totalFunds ?? 0)} />
        <StatTile label="Active Funds" value={String(stats?.activeFunds ?? 0)} />
        <StatTile label="Total Members" value={String(stats?.totalMembers ?? 0)} />
        <StatTile label="Monthly Contributions" value={money(stats?.totalMonthlyContributions ?? 0)} />
        <StatTile label="Pending Payments" value={String(stats?.pendingPayments ?? 0)} accent="text-amber-600" />
        <StatTile label="Pending Payouts" value={String(stats?.pendingPayouts ?? 0)} accent="text-fortune-600" />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your Funds</h2>
          <Link to="/app/funds" className="text-sm font-medium text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-3">
          {funds?.slice(0, 4).map((f) => (
            <Link key={f.fund.id} to={`/app/funds/${f.fund.id}`} className="block">
              <Card className="p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{f.fund.name}</p>
                    <p className="text-xs text-slate-500">
                      {f.memberCount} Members · {money(f.fund.contributionAmount, f.fund.currency)}/month
                    </p>
                  </div>
                  <StatusBadge status={f.fund.status} />
                </div>
                {f.fund.status === "ACTIVE" && (
                  <>
                    <p className="mt-3 text-xs text-slate-500">
                      Month {f.currentMonth ?? f.fund.durationMonths} of {f.fund.durationMonths} · Current recipient: {f.currentBeneficiary?.name || "—"}
                    </p>
                    <div className="mt-2">
                      <ProgressBar value={f.monthsCompleted} max={f.fund.durationMonths} />
                    </div>
                  </>
                )}
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Link to="/app/funds/new" className="flex items-center justify-center gap-1.5 rounded-2xl bg-brand-600 p-4 text-sm font-semibold text-white hover:bg-brand-700 md:hidden">
        <PlusIcon width={18} height={18} /> Create Fund
      </Link>
    </div>
  );
}

function StatTile({ label, value, accent = "text-slate-900" }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1.5 text-xl font-bold ${accent}`}>{value}</p>
    </Card>
  );
}
