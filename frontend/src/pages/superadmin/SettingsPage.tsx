import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { Avatar, Card, Button, ErrorBanner, inputClass } from "../../components/ui";
import { ReportIcon, AuditIcon, UsersIcon, PlusIcon, ProfileIcon } from "../../components/icons";
import { Logo } from "../../components/Logo";
import { api, ApiError } from "../../lib/api";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>

      <Link to="/app/profile">
        <Card className="flex items-center gap-3 p-4 hover:bg-slate-50">
          <Avatar name={user!.name} photoUrl={user!.photoUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{user!.name}</p>
            <p className="text-xs text-slate-500">{user!.email}</p>
          </div>
          <ProfileIcon className="text-slate-300" />
        </Card>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Tile to="/app/funds/new" icon={<PlusIcon />} label="Create Fund" />
        <Tile to="/app/members" icon={<UsersIcon />} label="Members" />
        <Tile to="/app/reports" icon={<ReportIcon />} label="Reports" />
        <Tile to="/app/audit-logs" icon={<AuditIcon />} label="Audit Log" />
      </div>

      <Card className="flex items-center gap-3 p-4">
        <Logo size={28} />
        <div>
          <p className="text-sm font-semibold text-slate-800">Fahi Fund</p>
          <p className="text-xs text-slate-500">Save Together. Receive in Order.</p>
        </div>
      </Card>

      <FactoryReset />
    </div>
  );
}

const RESET_PHRASE = "DELETE ALL DATA";

function FactoryReset() {
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doReset() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/system/reset-demo-data", { confirm: confirmText });
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset");
      setBusy(false);
    }
  }

  return (
    <Card className="border border-rose-100 p-4">
      <p className="text-sm font-semibold text-rose-700">Danger Zone</p>
      <p className="mt-1 text-xs text-slate-500">
        Permanently remove every fund, member, payment, payout, notification and audit log entry
        currently in the system — including all seeded demo data — so you can start fresh with
        real funds and real members. This cannot be undone. Your own Super Admin login is never
        removed.
      </p>

      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}

      {!expanded ? (
        <Button variant="danger" className="mt-3" onClick={() => setExpanded(true)}>
          Remove all demo data
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-600">
            Type <span className="font-mono font-semibold">{RESET_PHRASE}</span> to confirm.
          </p>
          <input
            className={inputClass}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={RESET_PHRASE}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setExpanded(false);
                setConfirmText("");
                setError(null);
              }}
            >
              Never mind
            </Button>
            <Button variant="danger" disabled={busy || confirmText !== RESET_PHRASE} onClick={doReset}>
              {busy ? "Removing everything…" : "Permanently remove everything"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Tile({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-start gap-2 rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-900/5 hover:bg-slate-50">
      {icon}
      {label}
    </Link>
  );
}
