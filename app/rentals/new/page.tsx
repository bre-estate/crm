import { createRental } from "../actions";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewRentalPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  return (
    <div className="max-w-3xl">
      <div className="text-xs mb-2">
        <Link href="/rentals" className="text-blue-600 hover:underline">← Cho thuê</Link>
      </div>
      <h1 className="text-2xl font-bold mb-1">Thêm HĐ thuê</h1>
      <p className="text-sm text-slate-500 mb-6">
        Flow: khách CK phí HH → NV nhận → NV trích % về cty. Mỗi HĐ = 1 record.
      </p>

      <form action={createRental} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mã căn *"><input name="unit_code" required className="input" placeholder="VD: Bcons Polygon SH03" /></Field>
          <Field label="Dự án"><input name="project_name" className="input" placeholder="VD: Bcons Polygon" /></Field>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="font-semibold mb-3">👤 Bên A (chủ nhà)</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tên chủ nhà"><input name="landlord_name" className="input" placeholder="VD: Chị Lan" /></Field>
            <Field label="SĐT"><input name="landlord_phone" className="input" placeholder="0908..." /></Field>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="font-semibold mb-3">👤 Bên B (khách thuê)</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tên khách thuê *"><input name="tenant_name" required className="input" placeholder="VD: Anh Tùng" /></Field>
            <Field label="SĐT"><input name="tenant_phone" className="input" placeholder="0908..." /></Field>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="font-semibold mb-3">📄 Hợp đồng</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Giá thuê / tháng (VND) *"><input name="monthly_rent" type="number" required className="input" placeholder="VD: 15000000" /></Field>
            <Field label="Kỳ hạn (tháng) *"><input name="lease_term_months" type="number" defaultValue="12" required className="input" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field label="Ngày bắt đầu thuê *"><input name="lease_start" type="date" required className="input" /></Field>
            <Field label="Ngày ký HĐ *"><input name="contract_date" type="date" required className="input" /></Field>
            <Field label="Đặt cọc (VND)">
              <input name="deposit" type="number" defaultValue="0" className="input" />
              <div className="text-[10px] text-slate-500 mt-1">Thường 1-2 tháng rent</div>
            </Field>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="font-semibold mb-3">💰 Phí HH</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tổng phí HH (để trống = auto)">
              <input name="total_fee" type="number" defaultValue="0" className="input" />
              <div className="text-[10px] text-slate-500 mt-1">
                Auto = 1 tháng rent × kỳ hạn / 12 (practice VN)
              </div>
            </Field>
            <Field label="% NV giữ (default 50%)">
              <input name="commission_rate" type="number" step="0.01" defaultValue="0.5" className="input" />
              <div className="text-[10px] text-slate-500 mt-1">0.5 = 50%. Có thể sửa</div>
            </Field>
          </div>
        </div>

        <Field label="NVKD môi giới *"><input name="sales_person" required className="input" placeholder="VD: Đoàn Lê Bách" /></Field>

        <Field label="Ghi chú">
          <textarea name="note" className="input" rows={2} placeholder="Extra info..." />
        </Field>

        <div className="flex gap-2 pt-4">
          <button type="submit" className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium">
            Lưu HĐ
          </button>
          <Link href="/rentals" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Hủy</Link>
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
