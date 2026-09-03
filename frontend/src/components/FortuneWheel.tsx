import { useMemo, useState } from "react";

interface Segment {
  id: string;
  label: string;
}

const SEGMENT_COLORS = ["#0f8a58", "#1bab6e", "#3fcb8a", "#0d6d48", "#c98a2e", "#0c563b"];

export function FortuneWheel({
  segments,
  spinning,
  spinToken,
}: {
  segments: Segment[];
  spinning: boolean;
  /** Bump this number to trigger a fresh spin animation (extra rotation each time). */
  spinToken: number;
}) {
  const n = segments.length;
  const [rotation, setRotation] = useState(0);

  useMemo(() => {
    if (spinToken > 0) {
      // Several full rotations plus a random offset so it never lands the same way twice.
      const extra = 1440 + Math.floor(Math.random() * 360);
      setRotation((r) => r + extra);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

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
        {segments.map((s, i) => {
          const slice = 360 / n;
          const mid = i * slice + slice / 2;
          return (
            <div
              key={s.id}
              className="absolute left-1/2 top-1/2 flex h-1/2 origin-top -translate-x-1/2 items-start justify-center pt-3"
              style={{ transform: `rotate(${mid}deg) translateX(-50%)`, width: 2 }}
            >
              <span
                className="whitespace-nowrap text-[10px] font-semibold text-white drop-shadow"
                style={{ transform: `rotate(${mid > 90 && mid < 270 ? 180 : 0}deg)`, display: "inline-block" }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
        <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow ring-1 ring-slate-900/5">
          <span className="text-[10px] font-bold text-brand-700">FAHI</span>
        </div>
      </div>
    </div>
  );
}
