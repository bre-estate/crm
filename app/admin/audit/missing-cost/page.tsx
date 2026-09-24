import { requireOwner } from "@/lib/auth";
import { getMissingCostReport } from "@/lib/reports/missing-cost";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default async function MissingCostAuditPage() {
  await requireOwner();
  const { rows, duTinh, excelTotal, dbTotal, totalDiff, snapshotAt } = await getMissingCostReport();
  const tienDuTinh = duTinh.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs">
          <Link href="/admin" className="text-blue-600 hover:underline">← Quản trị</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Kiểm tra giá vốn: Excel vs App</h1>
        <p className="text-sm text-slate-500 mt-1">
          So giá vốn trong file Báo cáo Doanh Thu của kế toán với giá vốn đã nhập trong app, khớp theo
          mã căn, loại phí và số tiền. Chỉ so những đợt <b>đã có ngày đối chiếu</b>.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Bản chụp Excel ngày {new Date(snapshotAt).toLocaleDateString("vi-VN")}. Số của app lấy trực tiếp.
          File Excel đổi thì chạy lại <code>node scripts/snapshot_cost_excel.mjs</code> rồi đẩy lên.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Tổng Excel" value={fmt(excelTotal)} color="slate" />
        <Card label="Tổng App" value={fmt(dbTotal)} color="slate" />
        <Card
          label="Chênh lệch"
          value={fmt(totalDiff)}
          color={Math.abs(totalDiff) > 1_000_000 ? "red" : "green"}
        />
        <Card label="Số căn lệch" value={String(rows.length)} color={rows.length > 0 ? "amber" : "green"} />
      </div>

      {duTinh.length > 0 && (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 space-y-2">
          <div className="text-sm font-semibold">
            {duTinh.length} đợt kế toán tính trước, chưa lập biên bản đối chiếu · {fmt(tienDuTinh)}
          </div>
          <p className="text-xs text-slate-500">
            Những dòng này trong Excel để trống cột Ngày đối chiếu, nghĩa là chưa phát sinh. App chưa có
            là đúng, không phải thiếu, nên không tính vào phần chênh lệch ở trên.
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2">Căn</th>
                <th className="text-left p-2">Gồm</th>
                <th className="text-left p-2 w-40">Người được đối chiếu</th>
                <th className="text-right p-2 w-36">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {duTinh.map((d) => (
                <tr key={`${d.productCode}-${d.excelRow}`} className="border-t">
                  <td className="p-2 font-medium">{d.productCode}</td>
                  <td className="p-2 text-slate-600 text-xs">
                    {d.items.map((i) => `${i.loai} ${fmt(i.amt)}`).join(" · ")}
                  </td>
                  <td className="p-2 text-slate-600">{d.employee ?? ""}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          ✓ Không có sai lệch. Data App khớp Excel BC DT.
        </div>
      ) : (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 bg-slate-50">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Mã căn</th>
                  <th className="text-center p-2" title="Số dòng Excel">Excel</th>
                  <th className="text-center p-2" title="Số recon app">App</th>
                  <th className="text-right p-2">Tổng Excel</th>
                  <th className="text-right p-2">Tổng App</th>
                  <th className="text-right p-2">Chênh</th>
                  <th className="text-left p-2">Chi tiết thiếu</th>
                  <th className="text-left p-2">Người nhập app</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.productCode} className="border-t border-slate-100 hover:bg-slate-50 align-top">
                    <td className="p-2 text-xs text-slate-500">{i + 1}</td>
                    <td className="p-2 font-mono text-xs">
                      {r.productId ? (
                        <Link
                          href={`/products/${r.productId}`}
                          target="_blank"
                          className="text-blue-600 hover:underline"
                        >
                          {r.productCode}
                        </Link>
                      ) : (
                        <span className="text-slate-400" title="Pseudo-product, không phải căn thật">
                          {r.productCode}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center tabular-nums">{r.excelCount}</td>
                    <td className="p-2 text-center tabular-nums">{r.dbCount}</td>
                    <td className="p-2 text-right tabular-nums text-xs">{fmt(r.excelTotal)}</td>
                    <td className="p-2 text-right tabular-nums text-xs text-slate-500">{fmt(r.dbTotal)}</td>
                    <td className={`p-2 text-right tabular-nums font-semibold ${r.diff > 0 ? "text-red-700" : "text-amber-700"}`}>
                      {fmt(r.diff)}
                    </td>
                    <td className="p-2 text-xs">
                      <ul className="space-y-0.5">
                        {r.missingItems.map((m, mi) => (
                          <li key={mi}>
                            <span className="font-semibold">{m.loai}</span>:{" "}
                            <span className="tabular-nums">{fmt(m.amt)}</span>
                            {m.employee && (
                              <span className="text-slate-500"> ({m.employee.trim()})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-2 text-xs">
                      {r.actors.length > 0 ? (
                        <div className="space-y-0.5">
                          {r.actors.map((a) => <div key={a}>{a}</div>)}
                        </div>
                      ) : r.dbCount === 0 ? (
                        <span className="text-slate-400 italic">chưa nhập</span>
                      ) : (
                        <span className="text-slate-400 italic">bulk import</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
        <em>&quot;bulk import&quot;</em> = recon nạp qua script (chưa có audit log).
        {" · "}
        <em>&quot;chưa nhập&quot;</em> = app chưa có recon nào cho căn này.
      </div>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  const cls: Record<string, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-800",
    green: "bg-green-50 border-green-200 text-green-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color]}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold opacity-80">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
