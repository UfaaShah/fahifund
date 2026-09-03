import { useSearchParams } from "react-router-dom";
import { useAuditLogs } from "../../lib/queries";
import { BackButton, Card, EmptyState, LoadingScreen } from "../../components/ui";
import { shortDate, timeAgo } from "../../lib/format";
import { AuditIcon } from "../../components/icons";

export default function AuditLogsPage() {
  const [params] = useSearchParams();
  const fundId = params.get("fundId") || undefined;
  const { data: logs, isLoading } = useAuditLogs(fundId);

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
      </div>
      {!logs || logs.length === 0 ? (
        <EmptyState icon={<AuditIcon width={36} height={36} />} title="No activity recorded yet" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {logs.map((l) => (
            <div key={l.id} className="p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l.action.replace(/_/g, " ")}</span>
                <span className="text-xs text-slate-400" title={shortDate(l.createdAt)}>
                  {timeAgo(l.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-700">{l.description}</p>
              <p className="mt-1 text-xs text-slate-400">
                {l.userName || "System"}
                {l.fundName ? ` · ${l.fundName}` : ""}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
