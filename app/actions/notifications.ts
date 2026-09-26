"use server";

import { db } from "@/lib/db";
import { notificationReads } from "@/lib/schema";
import { getCurrentUser } from "@/lib/auth";
import { computeAlertSummaries, locTheoVaiTro, type AlertSummary, type Severity } from "@/lib/alerts";
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

  // Timebox — computeAlertSummaries chạy 20+ queries. Đo trên dữ liệu thật ngày
  // 26/09/2026 là 2,1 giây, nên mốc 3 giây cũ quá sát: chỉ cần mạng chậm một chút
  // là quá giờ. Giới hạn hàm trên Vercel là 10 giây nên để 8 giây vẫn an toàn.
  //
  // Quá giờ thì NÉM LỖI chứ không trả danh sách rỗng. Trả rỗng khiến chuông tụt
  // về 0 như thể mọi việc đã xong, còn ném lỗi thì phía trình duyệt giữ nguyên
  // số cũ, thà cũ một nhịp còn hơn sai.
  let alerts: Awaited<ReturnType<typeof computeAlertSummaries>>;
  try {
    alerts = await Promise.race([
      computeAlertSummaries(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("quá 8 giây khi tính cảnh báo")), 8000),
      ),
    ]);
  } catch (e) {
    console.warn("[fetchNotifications]", e);
    throw e;
  }

  // Mỗi vị trí chỉ nhận cảnh báo thuộc phần việc của mình.
  alerts = locTheoVaiTro(alerts, user.role, user.customPermissions);
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
    revalidatePath("/notifications");
  } catch (e) {
    console.warn("[markNotificationRead] table chưa tồn tại", e);
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const alerts = locTheoVaiTro(
    await computeAlertSummaries(),
    user.role,
    user.customPermissions,
  );
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
    revalidatePath("/notifications");
  } catch (e) {
    console.warn("[markAllNotificationsRead] table chưa tồn tại", e);
  }
}
