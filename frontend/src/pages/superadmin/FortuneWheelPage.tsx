import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFund, useInvalidateFund } from "../../lib/queries";
import { api, ApiError } from "../../lib/api";
import { BackButton, Button, Card, EmptyState, ErrorBanner, LoadingScreen, Avatar } from "../../components/ui";
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
  const [rotation, setRotation] = useState(0);
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
        <div className="flex items-center gap-2">
          <BackButton />
          <h1 className="text-xl font-bold text-slate-900">Fortune Wheel</h1>
        </div>
        <EmptyState icon={<WheelIcon width={36} height={36} />} title="Already locked" message="This fund's Fortune order has already been finalized." />
      </div>
    );
  }

  const members = fund.members;
  if (members.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackButton />
          <h1 className="text-xl font-bold text-slate-900">Fortune Wheel</h1>
        </div>
        <EmptyState icon={<UsersIcon width={36} height={36} />} title="Add members first" message="You need at least one active member before running the Fortune Wheel." />
      </div>
    );
  }

  // Draws exactly one name per click, like a physical spinner — pressing
  // Spin again draws the next one, and the wheel visibly loses that slice.
  // The full order is still decided server-side in one cryptographically
  // random shot (on the first click) so the outcome can't be influenced by
  // when someone happens to click; this just gates *revealing* it to one
  // click per turn instead of animating the whole thing automatically.
  async function spinOnce() {
    if (spinning) return;
    setError(null);

    let fullOrder = order;
    if (!fullOrder) {
      setSpinning(true);
      try {
        const res = await api.post<{ order: FortuneOrderRow[] }>(`/funds/${fundId}/fortune-wheel/generate`);
        fullOrder = res.order;
        setOrder(fullOrder);
      } catch (err) {
        setSpinning(false);
        setError(err instanceof ApiError ? err.message : "Failed to run the Fortune Wheel");
        return;
      }
    }

    const nextEntry = fullOrder[revealed.length];
    if (!nextEntry) return; // every position already drawn

    const pool = poolSegments();
    const winIndex = pool.findIndex((s) => s.memberId === nextEntry.member_id);
    const n = pool.length;
    const slice = 360 / n;
    const mid = winIndex * slice + slice / 2;
    // The pointer sits fixed at the top (angle 0); rotating the wheel by R
    // moves whatever was at angle `mid` to angle `mid + R`. Solve for the R
    // (mod 360) that lands it exactly at 0, then add a few full turns on
    // top purely for the visual spin.
    const targetMod = (360 - mid) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    const forwardDelta = ((targetMod - currentMod) % 360 + 360) % 360;
    const extraTurns = (4 + Math.floor(Math.random() * 2)) * 360;

    setSpinning(true);
    setRotation(rotation + extraTurns + forwardDelta);
    setTimeout(() => {
      setRevealed((r) => [...r, nextEntry]);
      setSpinning(false);
    }, 3300);
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

  // A multi-slot member can be tapped again for each additional slot they
  // hold — they'll end up with that many separate turns in the order.
  function pickMember(m: FundMemberRow) {
    setManualPicks((picks) => {
      const usedSoFar = picks.filter((p) => p.user_id === m.user_id).length;
      if (usedSoFar >= (m.slots || 1)) return picks;
      return [...picks, m];
    });
  }

  function unpickAt(index: number) {
    setManualPicks((picks) => picks.filter((_, i) => i !== index));
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

  const totalSlots = members.reduce((sum, m) => sum + (m.slots || 1), 0);
  const remainingToPick = members.filter((m) => manualPicks.filter((p) => p.user_id === m.user_id).length < (m.slots || 1));

  // The wheel's current pool — every not-yet-drawn slot, one segment per
  // slot (a member with 2 slots gets two identical-looking segments, e.g.
  // "Ali - 1" / "Ali - 2", not one). Recomputed from `revealed` each time
  // rather than tracked separately, so there's a single source of truth for
  // what's still "on the wheel" — as slots get drawn, the wheel visibly
  // shrinks and each remaining multi-slot member's segments renumber.
  function poolSegments() {
    return members.flatMap((m) => {
      const total = m.slots || 1;
      const used = revealed.filter((r) => r.member_id === m.user_id).length;
      const remaining = Math.max(0, total - used);
      const firstName = m.name.split(" ")[0];
      return Array.from({ length: remaining }, (_, i) => ({
        id: `${m.user_id}-${i}`,
        label: total > 1 ? `${firstName} - ${i + 1}` : firstName,
        memberId: m.user_id,
      }));
    });
  }

  const allDrawn = !!order && revealed.length === order.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Fortune Wheel</h1>
          <p className="text-sm text-slate-500">{fund.fund.name} — establishes the fixed receiving order, once.</p>
        </div>
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

      {mode === "spin" && (
        <Card className="p-6">
          <FortuneWheel segments={poolSegments()} rotation={rotation} spinning={spinning} />
          <div className="mt-6 flex flex-col items-center gap-2">
            {!allDrawn && (
              <Button onClick={spinOnce} disabled={spinning} className="px-8">
                {spinning ? "Spinning…" : revealed.length === 0 ? "Spin Now" : "Spin for Next Position"}
              </Button>
            )}
            <p className="text-xs font-medium text-slate-400">
              {revealed.length} / {order?.length ?? totalSlots} drawn
            </p>
          </div>
          {!order && (
            <p className="mt-3 text-center text-xs text-slate-400">
              {totalSlots === members.length
                ? `Each of the ${members.length} members is selected exactly once.`
                : `${totalSlots} total slots across ${members.length} members — a multi-slot member gets one turn per slot they hold.`}{" "}
              Press Spin once per position — the full order is decided the moment you start, one name is
              just revealed per spin. This purely fixes the order — the monthly contribution amount is
              unaffected.
            </p>
          )}
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
                <div key={`${m.user_id}-${idx}`} className="flex items-center gap-3 p-3">
                  <span className="w-6 text-sm font-bold text-slate-400">{idx + 1}</span>
                  <Avatar name={m.name} photoUrl={m.photo_url} size={32} />
                  <p className="flex-1 text-sm font-semibold text-slate-900">{m.name}</p>
                  <button
                    type="button"
                    onClick={() => unpickAt(idx)}
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
                Remaining ({totalSlots - manualPicks.length} slot{totalSlots - manualPicks.length !== 1 ? "s" : ""})
              </p>
              <div className="flex flex-wrap gap-2">
                {remainingToPick.map((m) => {
                  const usedSoFar = manualPicks.filter((p) => p.user_id === m.user_id).length;
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => pickMember(m)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                    >
                      {m.name}
                      {(m.slots || 1) > 1 && ` (${usedSoFar}/${m.slots})`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {manualPicks.length === totalSlots && (
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
