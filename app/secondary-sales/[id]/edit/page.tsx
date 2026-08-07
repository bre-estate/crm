import { db } from "@/lib/db";
import { secondarySales } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { updateSecondarySale } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditSecondarySalePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  const rowId = Number(id);
  const [r] = await db.select().from(secondarySales).where(eq(secondarySales.id, rowId));
  if (!r) notFound();

  const updateWithId = updateSecondarySale.bind(null, rowId);

  return (
    <div className="max-w-3xl">
      <div className="text-xs mb-2">
        <Link href="/secondary-sales" className="text-blue-600 hover:underline">← Bán thứ cấp</Link>
      </div>
      <h1 className="text-2xl font-bold mb-1">Sửa giao dịch #{rowId}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {r.unitCode} · {r.projectName ?? "—"} · {r.salesPerson}
      </p>

      <form action={updateWithId} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mã căn *"><input name="unit_code" required defaultValue={r.unitCode} className="input" /></Field>
          <Field label="Dự án"><input name="project_name" defaultValue={r.projectName ?? ""} className="input" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Giá bán *"><input name="sell_price" type="number" required defaultValue={Number(r.sellPrice)} className="input" /></Field>
          <Field label="NVKD *"><input name="sales_person" required defaultValue={r.salesPerson} className="input" /></Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Ngày cọc"><input name="deposit_date" type="date" defaultValue={r.depositDate ?? ""} className="input" /></Field>
          <Field label="Ngày công chứng"><input name="completion_date" type="date" defaultValue={r.completionDate ?? ""} className="input" /></Field>
          <Field label="Tháng ghi nhận DT"><input name="recognition_month" defaultValue={r.recognitionMonth ?? ""} className="input" placeholder="2026-08" /></Field>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="font-semibold mb-3">💰 Phí HH</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tổng phí HH (VND) *">
              <input name="total_fee" type="number" required defaultValue={Number(r.totalFee)} className="input" />
              <div className="text-[10px] text-slate-500 mt-1">Khách CK cho NV</div>
            </Field>
            <Field label="% HH Sale">
              <input name="commission_rate" type="number" step="0.01" defaultValue={Number(r.commissionRate)} className="input" />
              <div className="text-[10px] text-slate-500 mt-1">0.5 = 50%. Bỏ cọc dùng 0.3-0.5</div>
            </Field>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="font-semibold mb-3">📥 Settle với cty</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Trạng thái">
              <select name="settlement_status" defaultValue={r.settlementStatus ?? "pending"} className="input">
                <option value="pending">Chờ NV chuyển</option>
                <option value="settled">Đã settle</option>
              </select>
            </Field>
            <Field label="Ngày NV chuyển về cty">
              <input name="settled_date" type="date" defaultValue={r.settledDate ?? ""} className="input" />
            </Field>
          </div>
        </div>

        <Field label="Ghi chú">
          <textarea name="note" defaultValue={r.note ?? ""} className="input" rows={2} />
        </Field>

        <div className="flex gap-2 pt-4">
          <button type="submit" className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium">
            Lưu thay đổi
          </button>
          <Link href="/secondary-sales" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Hủy</Link>
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
