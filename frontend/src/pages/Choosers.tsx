import { Link, Navigate } from "react-router-dom";
import { useFunds } from "../lib/queries";
import { Card, LoadingScreen, EmptyState, StatusBadge } from "../components/ui";
import type { FundOverview } from "../lib/types";
import { FundIcon } from "../components/icons";

function useAutoPick(funds: FundOverview[] | undefined) {
  return funds && funds.length === 1 ? funds[0] : null;
}

function ChooserList({
  title,
  emptyMessage,
  suffix,
  funds,
}: {
  title: string;
  emptyMessage: string;
  suffix: string;
  funds: FundOverview[];
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      {funds.length === 0 ? (
        <EmptyState icon={<FundIcon width={36} height={36} />} title={emptyMessage} />
      ) : (
        <div className="space-y-3">
          {funds.map((f) => (
            <Link key={f.fund.id} to={`/app/funds/${f.fund.id}${suffix}`} className="block">
              <Card className="flex items-center justify-between p-4 hover:bg-slate-50">
                <div>
                  <p className="font-semibold text-slate-900">{f.fund.name}</p>
                  <p className="text-xs text-slate-500">{f.memberCount} members</p>
                </div>
                <StatusBadge status={f.fund.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Chooser({ title, suffix, emptyMessage, filter }: { title: string; suffix: string; emptyMessage: string; filter: (f: FundOverview) => boolean }) {
  const { data, isLoading } = useFunds();
  const relevant = data?.filter(filter) ?? [];
  const auto = useAutoPick(relevant);

  if (isLoading) return <LoadingScreen />;
  if (auto) return <Navigate to={`/app/funds/${auto.fund.id}${suffix}`} replace />;
  return <ChooserList title={title} emptyMessage={emptyMessage} suffix={suffix} funds={relevant} />;
}

export function PaymentsChooser() {
  return <Chooser title="Payments" suffix="/payments" emptyMessage="You're not in any fund yet" filter={() => true} />;
}

export function FortuneChooser() {
  return <Chooser title="Fortune Order" suffix="/fortune" emptyMessage="You're not in any fund yet" filter={() => true} />;
}

export function CollectionChooser() {
  return <Chooser title="Collection" suffix="/collection" emptyMessage="You're not administering any fund yet" filter={(f) => f.fund.status === "ACTIVE"} />;
}

export function PayoutChooser() {
  return <Chooser title="Payout" suffix="/payout" emptyMessage="You're not administering any fund yet" filter={(f) => f.fund.status === "ACTIVE"} />;
}
