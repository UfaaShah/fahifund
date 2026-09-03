import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useFund, useInvalidateFund, useUsers } from "../lib/queries";
import { api, ApiError } from "../lib/api";
import { BackButton, Button, Card, ErrorBanner, LoadingScreen, Avatar, SectionTitle } from "../components/ui";
import { money } from "../lib/format";

export default function FundMembersPage() {
  const { fundId } = useParams();
  const { user } = useAuth();
  const { data: fund, isLoading } = useFund(fundId);
  const { data: allUsers } = useUsers();
  const invalidate = useInvalidateFund();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [savingSlots, setSavingSlots] = useState<string | null>(null);

  if (isLoading || !fund) return <LoadingScreen />;

  const isSuperAdmin = user!.role === "SUPER_ADMIN";
  const canManage = isSuperAdmin && !fund.fund.fortuneLockedAt;
  const availableUsers = allUsers?.filter((u) => !fund.members.some((m) => m.user_id === u.id) && u.status === "ACTIVE");
  const totalSlots = fund.members.reduce((sum, m) => sum + (m.slots || 1), 0);

  async function addMember(userId: string) {
    setAdding(true);
    setError(null);
    try {
      await api.post(`/funds/${fundId}/members`, { userId });
      invalidate(fundId!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  async function updateSlots(userId: string, slots: number) {
    if (slots < 1) return;
    setSavingSlots(userId);
    setError(null);
    try {
      await api.patch(`/funds/${fundId}/members/${userId}`, { slots });
      invalidate(fundId!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update slots");
    } finally {
      setSavingSlots(null);
    }
  }

  async function removeMember(userId: string) {
    setError(null);
    try {
      await api.delete(`/funds/${fundId}/members/${userId}`, fund!.fund.fortuneLockedAt ? { reason } : undefined);
      invalidate(fundId!);
      setRemoving(null);
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove member");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-xl font-bold text-slate-900">Members</h1>
      </div>
      <p className="text-sm text-slate-500">
        {fund.fund.name} · {fund.members.length} members · {totalSlots} slots total
      </p>
      {canManage && totalSlots !== fund.fund.durationMonths && (
        <p className="text-xs text-amber-600">
          This fund runs {fund.fund.durationMonths} months but members currently hold {totalSlots} slots — for one payout per
          slot, these should match before running the Fortune Wheel.
        </p>
      )}
      {error && <ErrorBanner message={error} />}

      <Card className="divide-y divide-slate-100">
        {fund.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-4">
            <span className="w-6 text-sm font-bold text-slate-400">{m.member_number}</span>
            <Avatar name={m.name} photoUrl={m.photo_url} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{m.name}</p>
              <p className="text-xs text-slate-500">
                {m.member_code} · {m.phone}
                {m.slots > 1 && ` · pays ${money(fund.fund.contributionAmount * m.slots, fund.fund.currency)}/mo`}
              </p>
            </div>
            {canManage && removing !== m.user_id && (
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-1.5 py-1">
                <button
                  type="button"
                  disabled={savingSlots === m.user_id || m.slots <= 1}
                  onClick={() => updateSlots(m.user_id, m.slots - 1)}
                  className="h-5 w-5 rounded text-sm font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-14 text-center text-xs font-medium text-slate-600">{m.slots} slot{m.slots !== 1 ? "s" : ""}</span>
                <button
                  type="button"
                  disabled={savingSlots === m.user_id || m.slots >= 20}
                  onClick={() => updateSlots(m.user_id, m.slots + 1)}
                  className="h-5 w-5 rounded text-sm font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            )}
            {!canManage && m.slots > 1 && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{m.slots} slots</span>
            )}
            {canManage && removing !== m.user_id && (
              <button onClick={() => setRemoving(m.user_id)} className="text-xs font-medium text-rose-600 hover:underline">
                Remove
              </button>
            )}
            {isSuperAdmin && fund.fund.fortuneLockedAt && removing !== m.user_id && (
              <button onClick={() => setRemoving(m.user_id)} className="text-xs font-medium text-rose-600 hover:underline">
                Exit (exception)
              </button>
            )}
            {removing === m.user_id && (
              <div className="flex items-center gap-2">
                {fund.fund.fortuneLockedAt && (
                  <input
                    className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    placeholder="Reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}
                <button onClick={() => removeMember(m.user_id)} className="text-xs font-semibold text-rose-600">
                  Confirm
                </button>
                <button onClick={() => setRemoving(null)} className="text-xs text-slate-400">
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </Card>

      {canManage && (
        <div>
          <SectionTitle>Add member</SectionTitle>
          {availableUsers && availableUsers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableUsers.map((u) => (
                <Button key={u.id} variant="secondary" disabled={adding} onClick={() => addMember(u.id)} className="text-xs">
                  + {u.name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Every existing user is already in this fund. Add new members from the Members page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
