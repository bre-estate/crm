/**
 * Shared UI helpers cho module expenses (category label, status color, etc.).
 * Chỉ pure — không đụng DB.
 */

export const EXPENSE_CATEGORIES = [
  { key: "office", label: "Văn phòng" },
  { key: "marketing", label: "Marketing" },
  { key: "entertainment", label: "Tiếp khách / ăn uống" },
  { key: "travel", label: "Đi lại" },
  { key: "salary", label: "Lương / BHXH" },
  { key: "commission", label: "HH sale / KPI" },
  { key: "tax", label: "Thuế" },
  { key: "other", label: "Khác" },
] as const;

export function categoryLabel(k: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === k)?.label ?? k;
}

export const EXPENSE_STATUSES = [
  { key: "draft", label: "Nháp", color: "bg-slate-100 text-slate-700 border-slate-300" },
  { key: "pending", label: "Chờ duyệt", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "approved", label: "Đã duyệt", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "rejected", label: "Từ chối", color: "bg-red-100 text-red-700 border-red-300" },
  { key: "paid", label: "Đã chi", color: "bg-green-100 text-green-700 border-green-300" },
] as const;

export function statusLabel(k: string): string {
  return EXPENSE_STATUSES.find((s) => s.key === k)?.label ?? k;
}

export function statusColor(k: string): string {
  return (
    EXPENSE_STATUSES.find((s) => s.key === k)?.color ??
    "bg-slate-100 text-slate-700 border-slate-300"
  );
}

export const PAYMENT_METHODS = [
  { key: "cash", label: "Tiền mặt" },
  { key: "bank", label: "Chuyển khoản" },
  { key: "card", label: "Thẻ" },
] as const;

export function paymentMethodLabel(k: string | null | undefined): string {
  if (!k) return "—";
  return PAYMENT_METHODS.find((p) => p.key === k)?.label ?? k;
}
