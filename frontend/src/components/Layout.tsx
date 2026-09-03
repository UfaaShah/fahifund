import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { Wordmark, Logo } from "./Logo";
import { Avatar } from "./ui";
import { api } from "../lib/api";
import {
  HomeIcon,
  FundIcon,
  PaymentsIcon,
  WheelIcon,
  ProfileIcon,
  DashboardIcon,
  UsersIcon,
  SettingsIcon,
  BellIcon,
  LogoutIcon,
} from "./icons";
import type { Role } from "../lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
}

const NAV: Record<Role, NavItem[]> = {
  USER: [
    { to: "/app", label: "Home", icon: HomeIcon },
    { to: "/app/funds", label: "Fund", icon: FundIcon },
    { to: "/app/payments", label: "Payments", icon: PaymentsIcon },
    { to: "/app/fortune", label: "Fortune", icon: WheelIcon },
    { to: "/app/profile", label: "Profile", icon: ProfileIcon },
  ],
  ADMIN: [
    { to: "/app", label: "Home", icon: HomeIcon },
    { to: "/app/collection", label: "Collection", icon: PaymentsIcon },
    { to: "/app/payout", label: "Payout", icon: FundIcon },
    { to: "/app/funds", label: "Fund", icon: WheelIcon },
    { to: "/app/profile", label: "Profile", icon: ProfileIcon },
  ],
  SUPER_ADMIN: [
    { to: "/app", label: "Dashboard", icon: DashboardIcon },
    { to: "/app/funds", label: "Funds", icon: FundIcon },
    { to: "/app/members", label: "Members", icon: UsersIcon },
    { to: "/app/fortune", label: "Fortune", icon: WheelIcon },
    { to: "/app/settings", label: "Settings", icon: SettingsIcon },
  ],
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { count } = await api.get<{ count: number }>("/notifications/unread-count");
        if (!cancelled) setUnread(count);
      } catch {
        /* ignore */
      }
    }
    poll();
    const id = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!user) return null;
  const items = NAV[user.role];

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl bg-[#f6f8f7]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex">
        <div className="mb-8 px-2">
          <Wordmark />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <item.icon className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-slate-100 pt-4">
          <NavLink to="/app/notifications" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <BellIcon />
            Notifications
            {unread > 0 && <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">{unread}</span>}
          </NavLink>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            <LogoutIcon />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="gpu-fixed safe-top sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Logo size={28} />
            <span className="font-bold text-slate-900">Fahi Fund</span>
          </div>
          <div className="hidden text-sm text-slate-500 md:block">
            {greeting()}, <span className="font-semibold text-slate-800">{user.name.split(" ")[0]}</span>
          </div>
          <div className="flex items-center gap-3">
            <NavLink to="/app/notifications" className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 md:hidden">
              <BellIcon />
              {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />}
            </NavLink>
            <NavLink to="/app/profile" className="flex items-center gap-2">
              <Avatar name={user.name} photoUrl={user.photoUrl} size={32} />
            </NavLink>
          </div>
        </header>

        {/* min-w-0 here (and on the flex column above) stops deep unbreakable content —
            e.g. a `truncate` (white-space: nowrap) name that's wider than the viewport —
            from forcing this whole flex column wider than the screen. Without it, a flex
            item's default min-width is its content's natural width, not 0, so a single
            long nowrap run anywhere inside can silently push the entire app shell into
            horizontal overflow. */}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-6">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="gpu-fixed safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/app"}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                    isActive ? "text-brand-600" : "text-slate-400"
                  }`
                }
              >
                <item.icon />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
