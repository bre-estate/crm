import { createSecondarySale } from "../actions";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewSecondarySalePage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  return (
    <div className="max-w-3xl">
      <div className="text-xs mb-2">
        <Link href="/secondary-sales" className="text-blue-600 hover:underline">← Bán thứ cấp</Link>
      </div>
      <h1 className="text-2xl font-bold mb-1">Thêm giao dịch thứ cấp</h1>
      <p className="text-sm text-slate-500 mb-6">
        Flow: khách CK phí HH → NV nhận → NV trích % về cty. Ngoại lệ (bỏ cọc): sale ăn 30-50% cọc.
      </p>

      <form action={createSecondarySale} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mã căn *"><input name="unit_code" required className="input" placeholder="VD: A.05.11" /></Field>
          <Field label="Dự án"><input name="project_name" className="input" placeholder="VD: Bcons Green View" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Giá bán *"><input name="sell_price" type="number" required className="input" placeholder="VD: 1815000000" /></Field>
          <Field label="NVKD *"><input name="sales_person" required className="input" placeholder="VD: Hồ Nguyễn Công Thành" /></Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Ngày cọc"><input name="deposit_date" type="date" className="input" /></Field>
          <Field label="Ngày công chứng"><input name="completion_date" type="date" className="input" /></Field>
          <Field label="Tháng ghi nhận DT"><input name="recognition_month" className="input" placeholder="2026-08" /></Field>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="font-semibold mb-3">💰 Phí HH</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tổng phí HH (VND) *">
              <input name="total_fee" type="number" required className="input" placeholder="VD: 39200000" />
              <div className="text-[10px] text-slate-500 mt-1">Khách CK cho NV</div>
            </Field>
            <Field label="% HH Sale (default 50%)">
              <input name="commission_rate" type="number" step="0.01" defaultValue="0.5" className="input" />
              <div className="text-[10px] text-slate-500 mt-1">0.5 = 50%. Bỏ cọc thì 0.3-0.5 (30-50%)</div>
            </Field>
          </div>
          <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">
            💡 Ví dụ: Tổng phí 40M, %HH Sale 50% → HH Sale (NV) 20M, Lợi nhuận (cty) 20M
          </div>
        </div>

        <Field label="Ghi chú">
          <textarea name="note" className="input" rows={2} placeholder="VD: Bỏ cọc, deal xong, ..." />
        </Field>

        <div className="flex gap-2 pt-4">
          <button type="submit" className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium">
            Lưu giao dịch
          </button>
          <Link href="/secondary-sales" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">
            Hủy
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-slate-700 mb-1">{label}</div>
      {children}
    </label>
  );
}
