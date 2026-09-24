/**
 * Giao dịch báo cáo chưa xếp được nhóm.
 *
 * Đây là việc back office, tách khỏi trang Sao kê để trang đó thuần tra cứu.
 * Chạy đúng bộ luật mà báo cáo dùng (lib/bank-cash-core.ts) rồi chỉ hiện những
 * dòng nó không xếp nổi. Chọn nhóm ở đây là ghi đè tay, báo cáo tôn trọng ngay.
 */
import Link from "next/link";
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { loadCashLegsFromBank } from "@/lib/cash-pnl";
import { CategorySelect } from "../CategorySelect";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) => (n == null || n === 0 ? "" : Math.round(Math.abs(n)).toLocaleString("vi-VN"));
const fmtNgay = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

type SP = Promise<{ year?: string }>;

export default async function CanPhanLoaiPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("finance", "edit");
  const sp = await searchParams;
  const nam = sp.year?.trim() || String(new Date().getFullYear());

  const legs = await loadCashLegsFromBank({ start: `${nam}-01-01`, end: `${nam}-12-31` });
  const ids = [
    ...new Set(
      legs
        .filter((l) => l.category === "chua_phan_loai")
        .map((l) => (l as { bankRowId?: number }).bankRowId)
        .filter((x): x is number => typeof x === "number"),
    ),
  ];

  const rows = ids.length
    ? await db
        .select({
          id: bankTransactions.id,
          ngay: bankTransactions.transactionDate,
          doiTac: bankTransactions.partnerName,
          noiDung: bankTransactions.description,
          no: bankTransactions.debitAmount,
          co: bankTransactions.creditAmount,
          category: bankTransactions.category,
          categorySource: bankTransactions.categorySource,
        })
        .from(bankTransactions)
        .where(inArray(bankTransactions.id, ids))
    : [];

  const pill = (on: boolean) =>
    `inline-block px-2.5 py-1 rounded-md text-xs ${on ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/finance/bank-review" className="text-xs text-blue-600 hover:underline">
          ← Sao kê ngân hàng
        </Link>
        <h1 className="text-2xl font-bold mt-1">Giao dịch chưa xếp được nhóm</h1>
        <p className="text-sm text-slate-500 mt-1">
          Báo cáo tự xếp nhóm cho từng giao dịch dựa vào nội dung chuyển khoản, bảng lương và kho
          thưởng. Đây là những dòng nó không đoán ra, đang nằm ngoài mọi khoản mục. Chọn nhóm giúp thì
          báo cáo tính lại ngay.
        </p>
      </div>

      <div className="flex gap-1">
        {["2024", "2025", "2026"].map((y) => (
          <Link key={y} href={`/finance/bank-review/can-phan-loai?year=${y}`} className={pill(nam === y)}>
            {y}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-10 text-center text-slate-500">
          Năm {nam} không còn giao dịch nào chưa xếp nhóm.
        </div>
      ) : (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2 w-24">Ngày</th>
                <th className="text-left p-2">Nội dung chuyển khoản</th>
                <th className="text-left p-2 w-40">Đối tác</th>
                <th className="text-right p-2 w-28">Vào</th>
                <th className="text-right p-2 w-28">Ra</th>
                <th className="text-left p-2 w-56">Xếp vào nhóm</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50 align-top">
                  <td className="p-2 whitespace-nowrap tabular-nums">{fmtNgay(r.ngay)}</td>
                  <td className="p-2">{r.noiDung}</td>
                  <td className="p-2 text-slate-600">{r.doiTac}</td>
                  <td className="p-2 text-right tabular-nums text-green-700">{fmt(r.co)}</td>
                  <td className="p-2 text-right tabular-nums text-red-700">{fmt(r.no)}</td>
                  <td className="p-2">
                    <CategorySelect id={r.id} value={r.category} source={r.categorySource} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
