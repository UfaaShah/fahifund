import { useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useFund } from "../lib/queries";
import { Card, LoadingScreen, EmptyState, Avatar } from "../components/ui";
import { monthLabel } from "../lib/format";
import { WheelIcon, CheckCircleIcon, ClockIcon } from "../components/icons";

export default function FortuneOrderPage() {
  const { fundId } = useParams();
  const { user } = useAuth();
  const { data: fund, isLoading } = useFund(fundId);

  if (isLoading || !fund) return <LoadingScreen />;

  if (!fund.fund.fortuneLockedAt) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Fortune Order</h1>
        <EmptyState
          icon={<WheelIcon width={36} height={36} />}
          title="The Fortune Wheel hasn't run yet"
          message="Once the Super Admin runs and locks the Fortune Wheel, the receiving order will appear here."
        />
      </div>
    );
  }

  const currentMonth = fund.currentMonth;
  const mine = fund.fortuneOrder.find((o) => o.member_id === user!.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Fortune Order</h1>
        <p className="text-sm text-slate-500">{fund.fund.name} — locked and final</p>
      </div>

      {mine && (
        <Card className="bg-brand-600 p-5 text-white">
          <p className="text-sm font-medium text-brand-100">Your position</p>
          <p className="mt-1 text-3xl font-bold">#{mine.position}</p>
          <p className="mt-1 text-sm text-brand-100">
            {fund.isCompleted ? "Already received" : `Estimated month: ${monthLabel(fund.fund.startDate, mine.month_number)}`}
          </p>
        </Card>
      )}

      <Card className="divide-y divide-slate-100">
        {fund.fortuneOrder.map((o) => {
          const state = getState(o.month_number, currentMonth, fund.isCompleted);
          const isMe = o.member_id === user!.id;
          return (
            <div key={o.id} className={`flex items-center gap-3 p-4 ${isMe ? "bg-brand-50/60" : ""}`}>
              <span className="w-6 text-sm font-bold text-slate-400">{o.position}</span>
              <Avatar name={o.name} photoUrl={o.photo_url} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {o.name} {isMe && <span className="text-xs font-normal text-brand-600">(you)</span>}
                </p>
                <p className="text-xs text-slate-500">{o.member_code}</p>
              </div>
              <StateBadge state={state} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

type St = "received" | "current" | "upcoming";
function getState(monthNumber: number, currentMonth: number | null, isCompleted: boolean): St {
  if (isCompleted) return "received";
  if (currentMonth == null) return "upcoming";
  if (monthNumber < currentMonth) return "received";
  if (monthNumber === currentMonth) return "current";
  return "upcoming";
}

function StateBadge({ state }: { state: St }) {
  if (state === "received")
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
        <CheckCircleIcon width={16} height={16} /> Received
      </span>
    );
  if (state === "current")
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-fortune-600">
        <ClockIcon width={16} height={16} /> Current
      </span>
    );
  return <span className="text-xs text-slate-400">Upcoming</span>;
}
