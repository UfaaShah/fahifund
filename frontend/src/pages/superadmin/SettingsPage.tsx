import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { Avatar, Card } from "../../components/ui";
import { ReportIcon, AuditIcon, UsersIcon, PlusIcon, ProfileIcon } from "../../components/icons";
import { Logo } from "../../components/Logo";

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
    </div>
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
