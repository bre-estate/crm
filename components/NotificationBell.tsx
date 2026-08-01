"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import Link from "next/link";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationData,
  type NotificationItem,
} from "@/app/actions/notifications";

type Props = {
  initial: NotificationData;
};

const SEV_STYLE = {
  critical: { icon: "🚨", cls: "border-l-red-500" },
  warning: { icon: "⚠️", cls: "border-l-amber-500" },
  info: { icon: "ℹ️", cls: "border-l-blue-500" },
} as const;

export default function NotificationBell({ initial }: Props) {
  const [data, setData] = useState<NotificationData>(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const int = setInterval(() => {
      fetchNotifications().then(setData).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(int);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleClick = (item: NotificationItem) => {
    if (!item.read) {
      startTransition(async () => {
        await markNotificationRead(item.key);
        setData((d) => ({
          ...d,
          items: d.items.map((i) => (i.key === item.key ? { ...i, read: true } : i)),
          unreadCount: Math.max(0, d.unreadCount - 1),
        }));
      });
    }
  };

  const handleMarkAll = () => {
    startTransition(async () => {
      await markAllNotificationsRead();
      setData((d) => ({
        ...d,
        items: d.items.map((i) => ({ ...i, read: true })),
        unreadCount: 0,
      }));
    });
  };

  const topItems = data.items.slice(0, 6);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
        title="Cảnh báo"
      >
        <span className="text-lg">🔔</span>
        {data.unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {data.unreadCount > 9 ? "9+" : data.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center">
            <div className="font-semibold text-sm">Cảnh báo</div>
            {data.unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={pending}
                className="text-[11px] text-blue-600 hover:underline"
              >
                Đánh dấu đã đọc tất cả
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {topItems.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                ✅ Không có cảnh báo nào
              </div>
            ) : (
              topItems.map((item) => {
                const style = SEV_STYLE[item.severity];
                const content = (
                  <div
                    className={`px-4 py-2.5 border-l-4 ${style.cls} ${
                      item.read ? "bg-white" : "bg-slate-50"
                    } hover:bg-slate-100 cursor-pointer transition-colors`}
                    onClick={() => handleClick(item)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm mt-0.5">{style.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm ${
                            item.read ? "text-slate-600" : "text-slate-900 font-medium"
                          }`}
                        >
                          {item.title}
                        </div>
                      </div>
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                      )}
                    </div>
                  </div>
                );
                return item.url ? (
                  <Link
                    key={item.key}
                    href={item.url}
                    onClick={() => setOpen(false)}
                    className="block"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={item.key}>{content}</div>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 bg-slate-50">
            <Link
              href="/alerts"
              onClick={() => setOpen(false)}
              className="text-xs text-blue-600 hover:underline"
            >
              Xem tất cả →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
