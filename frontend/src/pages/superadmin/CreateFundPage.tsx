import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { useUsers } from "../../lib/queries";
import { Button, Card, ErrorBanner, Field, inputClass } from "../../components/ui";
import type { FundOverview } from "../../lib/types";

export default function CreateFundPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: users } = useUsers();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contributionAmount, setContributionAmount] = useState("1000");
  const [currency, setCurrency] = useState("MVR");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [durationMonths, setDurationMonths] = useState("10");
  const [adminId, setAdminId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fund = await api.post<FundOverview>("/funds", {
        name,
        description: description || undefined,
        contributionAmount: Number(contributionAmount),
        currency,
        startDate,
        durationMonths: Number(durationMonths),
        adminId: adminId || undefined,
      });
      qc.invalidateQueries({ queryKey: ["funds"] });
      qc.invalidateQueries({ queryKey: ["dashboard-super-admin"] });
      navigate(`/app/funds/${fund.fund.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create fund");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-xl font-bold text-slate-900">Create Fund</h1>
      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <Field label="Fund Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fahi Fund - September 2026" required />
          </Field>
          <Field label="Description" hint="Optional">
            <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly Contribution">
              <input className={inputClass} type="number" min="1" step="0.01" value={contributionAmount} onChange={(e) => setContributionAmount(e.target.value)} required />
            </Field>
            <Field label="Currency">
              <input className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={5} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </Field>
            <Field label="Duration (months)">
              <input className={inputClass} type="number" min="1" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} required />
            </Field>
          </div>
          <Field label="Assigned Admin" hint="Optional for now — you can assign this later">
            <select className={inputClass} value={adminId} onChange={(e) => setAdminId(e.target.value)}>
              <option value="">Not assigned yet</option>
              {users?.filter((u) => u.status === "ACTIVE").map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-slate-400">
            Add members and run the Fortune Wheel from the fund's page after it's created.
          </p>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating…" : "Create Fund"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
