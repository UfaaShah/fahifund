export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/logo-icon.png"
      alt="Fahi Fund"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-contain"
    />
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
