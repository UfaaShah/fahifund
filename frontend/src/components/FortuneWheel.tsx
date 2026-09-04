import { useMemo } from "react";

interface Segment {
  id: string;
  label: string;
}

const SEGMENT_COLORS = ["#0f8a58", "#1bab6e", "#3fcb8a", "#0d6d48", "#c98a2e", "#0c563b"];

/** A controlled spinning wheel — the parent owns `rotation` entirely (it
 * knows which segment the wheel must land on, since the winner is decided
 * server-side ahead of time) and just bumps it by a few full turns plus the
 * exact delta needed to land the pointer on that segment. `spinning` toggles
 * the CSS transition on/off so a reset (rotation snapping back for a fresh
 * draw sequence) doesn't animate. */
export function FortuneWheel({
  segments,
  rotation,
  spinning,
}: {
  segments: Segment[];
  rotation: number;
  spinning: boolean;
}) {
  const n = segments.length;

  const gradient = useMemo(() => {
    if (n === 0) return "#e2e8f0";
    const slice = 360 / n;
    const stops: string[] = [];
    for (let i = 0; i < n; i++) {
      const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      stops.push(`${color} ${i * slice}deg ${(i + 1) * slice}deg`);
    }
    return `conic-gradient(${stops.join(",")})`;
  }, [n]);

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center">
      {/* Pointer */}
      <div className="absolute -top-1 z-10 h-0 w-0 border-x-[10px] border-t-[16px] border-x-transparent border-t-slate-800" />

      <div
        className="relative h-full w-full rounded-full shadow-inner ring-4 ring-white"
        style={{
          background: gradient,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 3.2s cubic-bezier(0.15, 0.65, 0.25, 1)" : undefined,
        }}
      >
        {n === 0 ? null : (
          segments.map((s, i) => {
            const slice = 360 / n;
            const mid = i * slice + slice / 2;
            // Anchored at the wheel's center (origin-top) and spanning out to
            // the rim (h-1/2), with the label pinned near the *outer* edge
            // (items-end) rather than the center — otherwise it renders
            // right behind the hub and is invisible. A small pb keeps it
            // just inside the rim instead of spilling past the circle.
            return (
              <div
                key={s.id}
                className="absolute left-1/2 top-1/2 flex h-1/2 origin-top -translate-x-1/2 items-end justify-center pb-3"
                style={{ transform: `rotate(${mid}deg) translateX(-50%)`, width: 2 }}
              >
                <span
                  className="whitespace-nowrap text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                  style={{ transform: `rotate(${mid > 90 && mid < 270 ? 180 : 0}deg)`, display: "inline-block" }}
                >
                  {s.label}
                </span>
              </div>
            );
          })
        )}
        <div
          className="absolute left-1/2 top-1/2 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow ring-1 ring-slate-900/5"
          style={{ transform: `translate(-50%, -50%) rotate(${-rotation}deg)` }}
        >
          <span className="text-[10px] font-bold text-brand-700">FAHI</span>
        </div>
      </div>

      {/* Sits outside the rotating wheel entirely, so it's never sideways or
       * upside-down no matter where the wheel's cumulative spin landed. */}
      {n === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-10 flex items-center justify-center text-sm font-medium text-slate-400">
          All drawn
        </div>
      )}
    </div>
  );
}
