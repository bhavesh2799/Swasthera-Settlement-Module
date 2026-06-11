import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, CheckCheck, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

interface NotificationItem {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: number | null;
  recordName: string | null;
  link: string | null;
  level: string;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function levelIcon(level: string) {
  if (level === "warning") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  if (level === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <Info className="h-4 w-4 text-blue-500" />;
}

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications");
      if (!r.ok) return;
      const d = await r.json();
      setUnread(d.unreadCount ?? 0);
      setItems(d.notifications ?? []);
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markRead = useCallback(async () => {
    if (unread === 0) return;
    try {
      await fetch("/api/notifications/mark-read", { method: "POST" });
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      /* non-blocking */
    }
  }, [unread]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      load();
      markRead();
    }
  };

  const goTo = (n: NotificationItem) => {
    setOpen(false);
    if (n.link) setLocation(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[28rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg z-50">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <CheckCheck className="h-3.5 w-3.5" /> All read
            </span>
          </div>
          <div className="max-h-[24rem] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">No notifications yet</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => goTo(n)}
                  className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                    n.isRead ? "" : "bg-blue-50/40"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{levelIcon(n.level)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 leading-snug">
                      <span className="font-medium text-slate-900">{n.actorName}</span> {n.action}
                      {n.recordName && <span className="font-medium text-slate-900"> {n.recordName}</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
