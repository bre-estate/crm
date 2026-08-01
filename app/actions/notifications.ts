"use server";

import { db } from "@/lib/db";
import { notificationReads } from "@/lib/schema";
import { getCurrentUser } from "@/lib/auth";
import { computeAlertSummaries, type AlertSummary, type Severity } from "@/lib/alerts";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type NotificationItem = AlertSummary & { read: boolean };

export type NotificationData = {
  items: NotificationItem[];
  unreadCount: number;
};

export async function fetchNotifications(): Promise<NotificationData> {
  const user = await getCurrentUser();
  if (!user) return { items: [], unreadCount: 0 };

  const alerts = await computeAlertSummaries();
  if (alerts.length === 0) return { items: [], unreadCount: 0 };

  // Query read state — graceful fallback nếu table notification_reads chưa
  // được migrate (VD lần đầu deploy trước khi SQL chạy).
  let readSet = new Set<string>();
  try {
    const reads = await db
      .select({ key: notificationReads.notificationKey })
      .from(notificationReads)
      .where(eq(notificationReads.email, user.email));
    readSet = new Set(reads.map((r) => r.key));
  } catch (e) {
    console.warn("[fetchNotifications] notification_reads chưa tồn tại — skip read state", e);
  }

  const items: NotificationItem[] = alerts.map((a) => ({
    ...a,
    read: readSet.has(a.key),
  }));

  // Sort: critical + unread first, then warning + unread, then read
  const sevWeight: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return sevWeight[a.severity] - sevWeight[b.severity];
  });

  return {
    items,
    unreadCount: items.filter((i) => !i.read).length,
  };
}

export async function markNotificationRead(key: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await db
      .insert(notificationReads)
      .values({ email: user.email, notificationKey: key })
      .onConflictDoNothing({
        target: [notificationReads.email, notificationReads.notificationKey],
      });
    revalidatePath("/alerts");
  } catch (e) {
    console.warn("[markNotificationRead] table chưa tồn tại", e);
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const alerts = await computeAlertSummaries();
  if (alerts.length === 0) return;
  try {
    await db.execute(sql`
      INSERT INTO notification_reads (email, notification_key)
      SELECT ${user.email}, unnest(ARRAY[${sql.join(
        alerts.map((a) => sql`${a.key}`),
        sql`, `,
      )}]::text[])
      ON CONFLICT (email, notification_key) DO NOTHING
    `);
    revalidatePath("/alerts");
  } catch (e) {
    console.warn("[markAllNotificationsRead] table chưa tồn tại", e);
  }
}
