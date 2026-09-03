import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useFunds } from "../lib/queries";
import { Card, EmptyState, LoadingScreen, ProgressBar, StatusBadge } from "../components/ui";
import { money } from "../lib/format";
import { FundIcon, PlusIcon } from "../components/icons";

export default function MyFundsPage() {
  const { user } = useAuth();
  const { data: funds, isLoading } = useFunds();

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{user!.role === "SUPER_ADMIN" ? "All Funds" : "My Fund"}</h1>
        {user!.role === "SUPER_ADMIN" && (
          <Link to="/app/funds/new" className="flex items-center gap-1 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <PlusIcon width={16} height={16} /> New
          </Link>
        )}
      </div>

      {!funds || funds.length === 0 ? (
        <EmptyState icon={<FundIcon width={36} height={36} />} title="No funds yet" message="Funds you belong to will show up here." />
      ) : (
        <div className="space-y-3">
          {funds.map((f) => (
            <Link key={f.fund.id} to={`/app/funds/${f.fund.id}`} className="block">
              <Card className="p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{f.fund.name}</p>
                    <p className="text-xs text-slate-500">
                      {f.memberCount} members · {money(f.fund.contributionAmount, f.fund.currency)}/month · {f.fund.durationMonths} months
                    </p>
                  </div>
                  <StatusBadge status={f.fund.status} />
                </div>
                {f.fund.status === "ACTIVE" && !f.isCompleted && (
                  <>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Current recipient: {f.currentBeneficiary?.name || "—"}</span>
                      <span>{f.monthsCompleted}/{f.fund.durationMonths}</span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={f.monthsCompleted} max={f.fund.durationMonths} />
                    </div>
                  </>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
