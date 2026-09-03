export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="18" className="fill-brand-600" />
      <path
        d="M20 4a16 16 0 0 1 16 16"
        stroke="currentColor"
        className="text-fortune-500"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="20" cy="20" r="7.5" fill="white" fillOpacity="0.14" />
      <path d="M20 14.5v11M16.5 17.2c0-1.5 1.5-2.7 3.5-2.7s3.5 1 3.5 2.4-1.3 2-3.5 2.4-3.5 1-3.5 2.4 1.5 2.5 3.5 2.5 3.5-1.1 3.5-2.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Logo size={size} />
      <span className="text-lg font-bold tracking-tight text-slate-900">
        Fahi <span className="text-brand-600">Fund</span>
      </span>
    </div>
  );
}
