import type { ReactNode } from "react";
import { initials } from "../lib/format";
import { assetUrl } from "../lib/api";
import type { MonthStatus } from "../lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 ${className}`}>{children}</div>;
}

export function Avatar({ name, photoUrl, size = 40 }: { name: string; photoUrl?: string | null; size?: number }) {
  if (photoUrl) {
    return (
      <img
        src={assetUrl(photoUrl)}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name) || "?"}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: "bg-slate-100 text-slate-600",
  CONTRIBUTION_OPEN: "bg-sky-100 text-sky-700",
  PARTIALLY_COLLECTED: "bg-amber-100 text-amber-700",
  FULLY_COLLECTED: "bg-brand-100 text-brand-700",
  READY_FOR_PAYOUT: "bg-fortune-500/15 text-fortune-600",
  PAYOUT_PROCESSING: "bg-fortune-500/15 text-fortune-600",
  COMPLETED: "bg-brand-100 text-brand-700",
  CANCELLED: "bg-rose-100 text-rose-700",
  ACTIVE: "bg-brand-100 text-brand-700",
  DRAFT: "bg-slate-100 text-slate-600",
  FORTUNE_PENDING: "bg-fortune-500/15 text-fortune-600",
  PENDING: "bg-slate-100 text-slate-600",
  SENT: "bg-sky-100 text-sky-700",
  CONFIRMED: "bg-brand-100 text-brand-700",
  REJECTED: "bg-rose-100 text-rose-700",
  WAITING_COLLECTION: "bg-slate-100 text-slate-600",
  READY: "bg-fortune-500/15 text-fortune-600",
  PROCESSING: "bg-fortune-500/15 text-fortune-600",
};

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: "Upcoming",
  CONTRIBUTION_OPEN: "Contribution Open",
  PARTIALLY_COLLECTED: "Partially Collected",
  FULLY_COLLECTED: "Fully Collected",
  READY_FOR_PAYOUT: "Ready for Payout",
  PAYOUT_PROCESSING: "Payout Processing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  ACTIVE: "Active",
  DRAFT: "Draft",
  FORTUNE_PENDING: "Fortune Pending",
  PENDING: "Pending",
  SENT: "Payment Sent",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  WAITING_COLLECTION: "Waiting for Collection",
  READY: "Ready",
  PROCESSING: "Processing",
};

export function StatusBadge({ status }: { status: string | MonthStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function ProgressBar({ value, max, colorClass = "bg-brand-500" }: { value: number; max: number; colorClass?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${colorClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const variants: Record<string, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-slate-300",
    secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:text-slate-400",
    danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-slate-300",
    ghost: "text-brand-700 hover:bg-brand-50 disabled:text-slate-400",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
    </div>
  );
}

export function EmptyState({ title, message, icon }: { title: string; message?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {message && <p className="mt-1 text-sm text-slate-500">{message}</p>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-100">{message}</div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 ring-1 ring-brand-100">{message}</div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
