import { useParams } from "react-router-dom";
import { useFund, usePayoutHistory } from "../lib/queries";
import { BackButton, Card, EmptyState, LoadingScreen, StatusBadge, Avatar } from "../components/ui";
import { money, monthLabel, shortDate } from "../lib/format";
import { FundIcon } from "../components/icons";

export default function PayoutHistoryPage() {
  const { fundId } = useParams();
  const { data: fund } = useFund(fundId);
  const { data: payouts, isLoading } = usePayoutHistory(fundId);

  if (isLoading || !fund) return <LoadingScreen />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-xl font-bold text-slate-900">Payout History</h1>
      </div>
      {!payouts || payouts.length === 0 ? (
        <EmptyState icon={<FundIcon width={36} height={36} />} title="No payouts yet" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {payouts.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 p-4">
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
          ))}
        </Card>
      )}
    </div>
  );
}
