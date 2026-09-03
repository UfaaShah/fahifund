import { useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "../lib/queries";
import { api } from "../lib/api";
import { BackButton, Card, EmptyState, LoadingScreen, Button } from "../components/ui";
import { timeAgo } from "../lib/format";
import { BellIcon, CheckCircleIcon, ClockIcon } from "../components/icons";

const TYPE_ICON: Record<string, React.ReactNode> = {
  SUCCESS: <CheckCircleIcon className="text-brand-600" />,
  REMINDER: <ClockIcon className="text-fortune-600" />,
  WARNING: <ClockIcon className="text-amber-600" />,
  PAYMENT: <BellIcon className="text-sky-600" />,
  PAYOUT: <BellIcon className="text-fortune-600" />,
  INFO: <BellIcon className="text-slate-400" />,
};

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const qc = useQueryClient();

  async function markAllRead() {
    await api.patch("/notifications/read-all");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BackButton />
          <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
        </div>
        {notifications && notifications.some((n) => !n.isRead) && (
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      {!notifications || notifications.length === 0 ? (
        <EmptyState icon={<BellIcon width={36} height={36} />} title="No notifications yet" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.isRead && markRead(n.id)}
              className={`flex w-full items-start gap-3 p-4 text-left ${!n.isRead ? "bg-brand-50/40" : ""}`}
            >
              <div className="mt-0.5">{TYPE_ICON[n.type] || TYPE_ICON.INFO}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                <p className="text-sm text-slate-600">{n.message}</p>
                <p className="mt-1 text-xs text-slate-400">{timeAgo(n.createdAt)}</p>
              </div>
              {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
