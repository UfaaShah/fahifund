import { useParams } from "react-router-dom";
import { useFund, useFundTimeline } from "../lib/queries";
import { BackButton, Card, LoadingScreen, StatusBadge } from "../components/ui";
import { money, monthLabel } from "../lib/format";
import { CheckCircleIcon, ClockIcon } from "../components/icons";

export default function TimelinePage() {
  const { fundId } = useParams();
  const { data: fund } = useFund(fundId);
  const { data: timeline, isLoading } = useFundTimeline(fundId);

  if (isLoading || !fund || !timeline) return <LoadingScreen />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-xl font-bold text-slate-900">Fund Timeline</h1>
      </div>
      <p className="text-sm text-slate-500">{fund.fund.name}</p>

      <Card className="divide-y divide-slate-100">
        {timeline.map((m) => {
          const isCompleted = m.status === "COMPLETED";
          const isCurrent = !isCompleted && m.monthNumber === fund.currentMonth;
          return (
            <div key={m.monthNumber} className="flex items-start gap-3 p-4">
              <div className="mt-0.5">
                {isCompleted ? (
                  <CheckCircleIcon className="text-brand-600" width={20} height={20} />
                ) : isCurrent ? (
                  <ClockIcon className="text-fortune-600" width={20} height={20} />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-slate-200" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{monthLabel(fund.fund.startDate, m.monthNumber)}</p>
                <p className="text-xs text-slate-500">
                  Recipient: {m.beneficiary?.name || "TBD"} · {money(m.expectedTotal, fund.fund.currency)}
                </p>
              </div>
              <StatusBadge status={m.status} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}
