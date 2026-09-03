import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useFunds } from "../../lib/queries";
import { api, downloadFile } from "../../lib/api";
import { BackButton, Button, Card, LoadingScreen, SectionTitle } from "../../components/ui";

export default function ReportsPage() {
  const [params] = useSearchParams();
  const { data: funds } = useFunds();
  const [fundId, setFundId] = useState(params.get("fundId") || "");

  useEffect(() => {
    if (!fundId && funds && funds.length > 0) setFundId(funds[0].fund.id);
  }, [funds, fundId]);

  const fundReport = useQuery({ queryKey: ["report-funds"], queryFn: () => api.get<any[]>("/reports/funds") });
  const monthlyReport = useQuery({
    queryKey: ["report-monthly", fundId],
    queryFn: () => api.get<any[]>(`/reports/funds/${fundId}/monthly`),
    enabled: !!fundId,
  });
  const memberReport = useQuery({
    queryKey: ["report-members", fundId],
    queryFn: () => api.get<any[]>(`/reports/funds/${fundId}/members`),
    enabled: !!fundId,
  });

  const selectedFund = funds?.find((f) => f.fund.id === fundId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
      </div>

      <div>
        <SectionTitle
          action={
            <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => downloadFile("/reports/funds?format=csv", "fahi-fund-report.csv")}>
              Download CSV
            </Button>
          }
        >
          Fund Report
        </SectionTitle>
        <ReportTable rows={fundReport.data} loading={fundReport.isLoading} />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Fund</label>
        <select className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" value={fundId} onChange={(e) => setFundId(e.target.value)}>
          {funds?.map((f) => (
            <option key={f.fund.id} value={f.fund.id}>
              {f.fund.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <SectionTitle
          action={
            <Button
              variant="secondary"
              className="!px-3 !py-1.5 text-xs"
              disabled={!fundId}
              onClick={() => downloadFile(`/reports/funds/${fundId}/monthly?format=csv`, `${selectedFund?.fund.name || "fund"}-monthly.csv`)}
            >
              Download CSV
            </Button>
          }
        >
          Monthly Report
        </SectionTitle>
        <ReportTable rows={monthlyReport.data} loading={monthlyReport.isLoading} />
      </div>

      <div>
        <SectionTitle
          action={
            <Button
              variant="secondary"
              className="!px-3 !py-1.5 text-xs"
              disabled={!fundId}
              onClick={() => downloadFile(`/reports/funds/${fundId}/members?format=csv`, `${selectedFund?.fund.name || "fund"}-members.csv`)}
            >
              Download CSV
            </Button>
          }
        >
          Member Report
        </SectionTitle>
        <ReportTable rows={memberReport.data} loading={memberReport.isLoading} />
      </div>
    </div>
  );
}

function ReportTable({ rows, loading }: { rows?: any[]; loading: boolean }) {
  if (loading) return <LoadingScreen />;
  if (!rows || rows.length === 0) return <Card className="p-4 text-sm text-slate-500">No data yet.</Card>;
  const headers = Object.keys(rows[0]);
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0">
              {headers.map((h) => (
                <td key={h} className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                  {String(r[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
