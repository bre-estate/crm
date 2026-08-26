"use client";

import { useState } from "react";
import type { activityLogs } from "@/lib/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Activity = typeof activityLogs.$inferSelect;

// Vietnamese label cho các field key trong changes JSON.
// Camelcase field name → tên nghiệp vụ VN.
const FIELD_LABEL: Record<string, string> = {
  // Rate + amount của căn
  pmgRate: "%PMG_LK",
  pmgSaleRate: "%PMG sale",
  pmgBasePrice: "Giá PMG",
  adminFee: "Phí admin",
  adminFeeSale: "Phí admin sale",
  saleCommissionRate: "%HH sale",
  kpiCeoRate: "%KPI CEO",
  kpiTpkdRate: "%KPI TPKD",
  kpiAdminRate: "%KPI Admin",
  cdtBonusSale: "CĐT thưởng NVKD",
  cdtBonusManager: "CĐT thưởng TPKD",
  bonusSale: "CTY thưởng NVKD",
  bonusManager: "CTY thưởng TPKD",
  customerSupport: "Hỗ trợ khách",
  otherCost: "Chi phí khác",
  otherCosts: "Chi phí khác",
  otherFeePct: "%Phí khác",
  otherRevenue: "Doanh thu khác",
  revenueReduction: "Khoản giảm doanh thu",
  totalRevenue: "Tổng doanh thu",
  totalCost: "Tổng giá vốn",
  sellPrice: "Giá bán",
  discountCk: "Chiết khấu",
  recognitionMonth: "Tháng ghi nhận",
  saleType: "Loại giao dịch",
  hasBonusRoom: "Có phòng thưởng",
  unitType: "Loại căn",
  bedrooms: "Số phòng ngủ",
  areaM2Net: "Diện tích thông thủy (m²)",
  areaM2Gross: "Diện tích tim tường (m²)",
  // Recon fields
  amountPayableThisTime: "Số tiền đợt này",
  revenueThisTime: "Doanh thu đợt này",
  totalReceivableThisTime: "Tổng phải thu đợt này",
  pmgCumulativePct: "%PMG lũy kế",
  pmgLkSaleRate: "%PMG_LK sale",
  pmgProgressAmount: "PMG theo tiến độ",
  pmgReconciledCumulative: "PMG đã ĐC lũy kế",
  pmgThisTime: "PMG đợt này",
  pmgPayable: "PMG phải trả",
  pmgRemaining: "PMG còn lại",
  paymentProgressPct: "Tiến độ TT (N)",
  phasePctThisTime: "%Tiến độ đợt",
  phaseNumber: "Số đợt",
  commissionRate: "%HH áp dụng",
  kpiRate: "%KPI áp dụng",
  kpiAmount: "Số KPI",
  minutesNumber: "Số BB",
  invoiceId: "HĐ",
  invoiceNumber: "Số HĐ",
  invoiceDate: "Ngày HĐ",
  // Common
  note: "Ghi chú",
  notes: "Ghi chú",
  effectiveDate: "Ngày hiệu lực",
  reconciliationDate: "Ngày đối chiếu",
  employeeName: "Người nhận",
  costType: "Loại chi phí",
  fiscalYear: "Năm tài chính",
  productId: "Căn",
  departmentId: "Phòng",
  salesPerson: "NVKD",
  deptLeaderName: "Trưởng phòng",
  depositDate: "Ngày cọc",
  expectedCompleteDate: "Ngày dự kiến bàn giao",
  paymentMethod: "Phương thức TT",
  customerName: "Tên khách",
  unitCode: "Mã căn",
  productCode: "Mã SP",
  unitDescription: "Mô tả căn",
  parseNote: "Ghi chú parser",
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

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              🕓 Lịch sử thay đổi
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {activities.length} bản ghi gần nhất trên căn này
            </DialogDescription>
          </DialogHeader>
          <div>
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
        </DialogContent>
      </Dialog>
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
