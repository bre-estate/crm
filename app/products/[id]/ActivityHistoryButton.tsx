"use client";

import { useState } from "react";
import type { activityLogs } from "@/lib/schema";

type Activity = typeof activityLogs.$inferSelect;

// Vietnamese label cho 1 số field key phổ biến
const FIELD_LABEL: Record<string, string> = {
  pmgRate: "%PMG_LK",
  pmgSaleRate: "%PMG_LK_sale",
  pmgBasePrice: "Giá PMG",
  adminFee: "Phí admin",
  adminFeeSale: "Phí admin (sale)",
  saleCommissionRate: "%HH sale",
  kpiCeoRate: "%KPI CEO",
  kpiTpkdRate: "%KPI TPKD",
  kpiAdminRate: "%KPI Admin",
  cdtBonusSale: "CĐT thưởng sale",
  cdtBonusManager: "CĐT thưởng QL",
  bonusSale: "CTY thưởng NVKD",
  bonusManager: "CTY thưởng QL",
  customerSupport: "Hỗ trợ khách",
  otherCost: "CP khác",
  totalRevenue: "Tổng DT",
  totalCost: "Tổng GV",
  amountPayableThisTime: "Số phải trả",
  revenueThisTime: "Doanh thu đợt",
  pmgCumulativePct: "%PMG lũy kế",
  note: "Ghi chú",
  effectiveDate: "Ngày hiệu lực",
  employeeName: "Người nhận",
  costType: "Loại chi phí",
};

const ENTITY_LABEL: Record<string, string> = {
  product: "Cấu hình căn",
  product_adjustment: "Điều chỉnh",
  revenue_reconciliation: "ĐC doanh thu",
  cost_reconciliation: "ĐC giá vốn",
};

function fmtDiffValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Math.abs(v) > 0 && Math.abs(v) < 1) return `${(v * 100).toFixed(2)}%`;
    if (Math.abs(v) >= 1000) return v.toLocaleString("vi-VN");
    return String(v);
  }
  if (typeof v === "string") return v || "—";
  return JSON.stringify(v);
}

export default function ActivityHistoryButton({
  activities,
}: {
  activities: Activity[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Lịch sử thay đổi"
        className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md px-2 py-1 text-xs"
      >
        <span aria-hidden>🕓</span>
        <span>Lịch sử</span>
        {activities.length > 0 && (
          <span className="bg-slate-200 text-slate-700 rounded-full px-1.5 min-w-[18px] text-center text-[10px]">
            {activities.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <div className="text-lg font-bold flex items-center gap-2">
                  🕓 Lịch sử thay đổi
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {activities.length} bản ghi gần nhất trên căn này
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {activities.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500 italic">
                  Chưa có thay đổi nào được ghi nhận.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activities.map((a) => (
                    <ActivityRow key={a.id} activity={a} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  const changes = (activity.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
  const changeEntries = Object.entries(changes);
  const actionLabel =
    activity.action === "create" ? "Tạo" : activity.action === "update" ? "Sửa" : "Xóa";
  const actionColor =
    activity.action === "create"
      ? "text-green-700 bg-green-50 border-green-200"
      : activity.action === "update"
        ? "text-blue-700 bg-blue-50 border-blue-200"
        : "text-red-700 bg-red-50 border-red-200";
  const timestamp = activity.createdAt
    ? new Date(activity.createdAt).toLocaleString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "?";
  return (
    <li className="py-3 px-4 hover:bg-slate-50">
      <div className="flex items-start gap-3 text-sm">
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded border ${actionColor} font-medium`}
        >
          {actionLabel}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 text-slate-600 text-xs mb-1 flex-wrap">
            <span className="font-medium text-slate-700">
              {ENTITY_LABEL[activity.entityType] ?? activity.entityType} #{activity.entityId}
            </span>
            <span className="text-slate-400">·</span>
            <span>{timestamp}</span>
            {activity.actorEmail && (
              <>
                <span className="text-slate-400">·</span>
                <span>{activity.actorEmail}</span>
              </>
            )}
            {!activity.actorEmail && activity.actorIp && (
              <>
                <span className="text-slate-400">·</span>
                <span className="font-mono text-slate-400">{activity.actorIp}</span>
              </>
            )}
          </div>
          {activity.summary && (
            <div className="text-slate-700 mb-1">{activity.summary}</div>
          )}
          {changeEntries.length > 0 && activity.action === "update" && (
            <ul className="text-xs text-slate-600 space-y-0.5 mt-1">
              {changeEntries.slice(0, 8).map(([field, { from, to }]) => (
                <li key={field} className="flex items-baseline gap-2">
                  <span className="text-slate-500 min-w-32 truncate">
                    {FIELD_LABEL[field] ?? field}
                  </span>
                  <span className="text-slate-400 line-through tabular-nums">
                    {fmtDiffValue(from)}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="text-slate-800 font-medium tabular-nums">
                    {fmtDiffValue(to)}
                  </span>
                </li>
              ))}
              {changeEntries.length > 8 && (
                <li className="text-slate-400 italic">
                  ...và {changeEntries.length - 8} field khác
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
