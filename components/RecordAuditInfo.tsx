/**
 * Hiện thông tin "Người tạo / Người sửa cuối" cho 1 record.
 * Server component: query activity_logs theo entity_type + entity_id.
 * Nếu record không có audit log → "bulk import" (import script bỏ qua log).
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

type Props = {
  entityType: "product" | "revenue_reconciliation" | "cost_reconciliation" | "product_adjustment";
  entityId: number;
};

function fmtVN(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RecordAuditInfo({ entityType, entityId }: Props) {
  const rows = (await db.execute(sql`
    SELECT action, actor_email, created_at
    FROM activity_logs
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}
    ORDER BY created_at
  `)) as unknown as Array<{
    action: string;
    actor_email: string | null;
    created_at: Date;
  }>;

  if (rows.length === 0) {
    return (
      <div className="text-[11px] text-slate-400 italic">
        Bulk import (không có log audit)
      </div>
    );
  }

  const creator = rows.find((r) => r.action === "create") ?? rows[0];
  const updates = rows.filter((r) => r.action === "update");
  const lastEdit = updates[updates.length - 1];

  return (
    <div className="text-[11px] text-slate-500 space-y-0.5">
      <div>
        <span className="text-slate-400">Tạo:</span>{" "}
        <span className="font-medium">{creator.actor_email ?? "?"}</span>{" "}
        <span className="text-slate-400">· {fmtVN(creator.created_at)}</span>
      </div>
      {lastEdit && lastEdit !== creator && (
        <div>
          <span className="text-slate-400">Sửa cuối:</span>{" "}
          <span className="font-medium">{lastEdit.actor_email ?? "?"}</span>{" "}
          <span className="text-slate-400">
            · {fmtVN(lastEdit.created_at)} · {updates.length} lần sửa
          </span>
        </div>
      )}
    </div>
  );
}
