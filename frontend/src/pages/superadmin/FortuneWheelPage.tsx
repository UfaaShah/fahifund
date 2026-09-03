import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFund, useInvalidateFund } from "../../lib/queries";
import { api, ApiError } from "../../lib/api";
import { Button, Card, EmptyState, ErrorBanner, LoadingScreen, Avatar } from "../../components/ui";
import { FortuneWheel } from "../../components/FortuneWheel";
import { UsersIcon, WheelIcon } from "../../components/icons";
import type { FortuneOrderRow } from "../../lib/types";

export default function FortuneWheelPage() {
  const { fundId } = useParams();
  const { data: fund, isLoading } = useFund(fundId);
  const invalidate = useInvalidateFund();
  const navigate = useNavigate();

  const [spinning, setSpinning] = useState(false);
  const [spinToken, setSpinToken] = useState(0);
  const [order, setOrder] = useState<FortuneOrderRow[] | null>(null);
  const [revealed, setRevealed] = useState<FortuneOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Fortune Wheel</h1>
        <p className="text-sm text-slate-500">{fund.fund.name} — establishes the fixed receiving order, once.</p>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card className="p-6">
        <FortuneWheel segments={members.map((m) => ({ id: m.id, label: m.name.split(" ")[0] }))} spinning={spinning} spinToken={spinToken} />
        <div className="mt-6 flex justify-center">
          <Button onClick={spin} disabled={spinning} className="px-8">
            {spinning ? "Spinning…" : order ? "Spin Again" : "Spin Now"}
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">
          Each of the {members.length} members is selected exactly once. This purely fixes the order — everyone still contributes and receives the same amount.
        </p>
      </Card>

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
        <Button onClick={lock} disabled={locking} className="w-full">
          {locking ? "Locking…" : "Confirm & Lock Order"}
        </Button>
      )}
    </div>
  );
}
