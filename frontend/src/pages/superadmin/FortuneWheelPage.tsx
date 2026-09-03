import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFund, useInvalidateFund } from "../../lib/queries";
import { api, ApiError } from "../../lib/api";
import { Button, Card, EmptyState, ErrorBanner, LoadingScreen, Avatar } from "../../components/ui";
import { FortuneWheel } from "../../components/FortuneWheel";
import { UsersIcon, WheelIcon } from "../../components/icons";
import type { FortuneOrderRow, FundMemberRow } from "../../lib/types";

export default function FortuneWheelPage() {
  const { fundId } = useParams();
  const { data: fund, isLoading } = useFund(fundId);
  const invalidate = useInvalidateFund();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"spin" | "manual">("spin");
  const [spinning, setSpinning] = useState(false);
  const [spinToken, setSpinToken] = useState(0);
  const [order, setOrder] = useState<FortuneOrderRow[] | null>(null);
  const [revealed, setRevealed] = useState<FortuneOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  const [manualPicks, setManualPicks] = useState<FundMemberRow[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  if (isLoading || !fund) return <LoadingScreen />;

  if (fund.fund.fortuneLockedAt) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Fortune Wheel</h1>
        <EmptyState icon={<WheelIcon width={36} height={36} />} title="Already locked" message="This fund's Fortune order has already been finalized." />
      </div>
    );
  }

  const members = fund.members;
  if (members.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Fortune Wheel</h1>
        <EmptyState icon={<UsersIcon width={36} height={36} />} title="Add members first" message="You need at least one active member before running the Fortune Wheel." />
      </div>
    );
  }

  async function spin() {
    setError(null);
    setOrder(null);
    setRevealed([]);
    setSpinning(true);
    setSpinToken((t) => t + 1);
    try {
      const res = await api.post<{ order: FortuneOrderRow[] }>(`/funds/${fundId}/fortune-wheel/generate`);
      // Let the wheel spin visually first, then reveal the (already-decided) order one by one.
      setTimeout(() => {
        setOrder(res.order);
        let i = 0;
        const interval = setInterval(() => {
          i++;
          setRevealed(res.order.slice(0, i));
          if (i >= res.order.length) {
            clearInterval(interval);
            setSpinning(false);
          }
        }, 450);
      }, 3300);
    } catch (err) {
      setSpinning(false);
      setError(err instanceof ApiError ? err.message : "Failed to run the Fortune Wheel");
    }
  }

  async function lock() {
    setLocking(true);
    setError(null);
    try {
      await api.post(`/funds/${fundId}/fortune-wheel/lock`);
      invalidate(fundId!);
      navigate(`/app/funds/${fundId}/fortune`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to lock the order");
    } finally {
      setLocking(false);
    }
  }

  function pickMember(m: FundMemberRow) {
    setManualPicks((picks) => (picks.some((p) => p.user_id === m.user_id) ? picks : [...picks, m]));
  }

  function unpickMember(userId: string) {
    setManualPicks((picks) => picks.filter((p) => p.user_id !== userId));
  }

  async function saveManualOrder() {
    setError(null);
    setSavingOrder(true);
    try {
      const res = await api.post<{ order: FortuneOrderRow[] }>(`/funds/${fundId}/fortune-wheel/set-order`, {
        order: manualPicks.map((p) => p.user_id),
      });
      setOrder(res.order);
      setRevealed(res.order);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the order");
    } finally {
      setSavingOrder(false);
    }
  }

  const remainingToPick = members.filter((m) => !manualPicks.some((p) => p.user_id === m.user_id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Fortune Wheel</h1>
        <p className="text-sm text-slate-500">{fund.fund.name} — establishes the fixed receiving order, once.</p>
      </div>

      {error && <ErrorBanner message={error} />}

      {!order && (
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("spin")}
            className={`flex-1 rounded-md px-2.5 py-1.5 ${mode === "spin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            Spin the wheel
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex-1 rounded-md px-2.5 py-1.5 ${mode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            Enter a known order
          </button>
        </div>
      )}

      {!order && mode === "spin" && (
        <Card className="p-6">
          <FortuneWheel segments={members.map((m) => ({ id: m.id, label: m.name.split(" ")[0] }))} spinning={spinning} spinToken={spinToken} />
          <div className="mt-6 flex justify-center">
            <Button onClick={spin} disabled={spinning} className="px-8">
              {spinning ? "Spinning…" : "Spin Now"}
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">
            Each of the {members.length} members is selected exactly once. This purely fixes the order — everyone still contributes and receives the same amount.
          </p>
        </Card>
      )}

      {!order && mode === "manual" && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-slate-900">Tap members in payout order</p>
          <p className="mt-1 text-xs text-slate-500">
            Use this when the receiving order was already decided outside the app (e.g. a round carried over from before).
            Tap each member in the order they should receive their payout, starting with #1.
          </p>

          {manualPicks.length > 0 && (
            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {manualPicks.map((m, idx) => (
                <div key={m.user_id} className="flex items-center gap-3 p-3">
                  <span className="w-6 text-sm font-bold text-slate-400">{idx + 1}</span>
                  <Avatar name={m.name} photoUrl={m.photo_url} size={32} />
                  <p className="flex-1 text-sm font-semibold text-slate-900">{m.name}</p>
                  <button
                    type="button"
                    onClick={() => unpickMember(m.user_id)}
                    className="text-xs font-medium text-slate-400 hover:text-rose-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {remainingToPick.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Remaining ({remainingToPick.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {remainingToPick.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => pickMember(m)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {manualPicks.length === members.length && (
            <Button onClick={saveManualOrder} disabled={savingOrder} className="mt-4 w-full">
              {savingOrder ? "Saving…" : "Save This Order"}
            </Button>
          )}
        </Card>
      )}

      {revealed.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {revealed.map((o) => (
            <div key={o.id} className="flex animate-[fadeIn_0.3s_ease] items-center gap-3 p-4">
              <span className="w-6 text-sm font-bold text-slate-400">{o.position}</span>
              <Avatar name={o.name} photoUrl={o.photo_url} size={36} />
              <p className="text-sm font-semibold text-slate-900">{o.name}</p>
            </div>
          ))}
        </Card>
      )}

      {order && revealed.length === order.length && !spinning && (
        <div className="space-y-2">
          <Button onClick={lock} disabled={locking} className="w-full">
            {locking ? "Locking…" : "Confirm & Lock Order"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setOrder(null);
              setRevealed([]);
              setManualPicks([]);
            }}
            disabled={locking}
            className="w-full text-center text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
