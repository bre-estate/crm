import { db } from "@/lib/db";
import { financialTransactions, revenueReconciliations, costReconciliations, paymentsIn, paymentsOut } from "@/lib/schema";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, inArray, eq, ne, and } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const OPEX_CATEGORIES = ["6421", "6427-rent", "6427-svc", "6417", "6428", "6425", "635"];

const fmt = (n: number) => n.toLocaleString("vi-VN");

/**
 * BCĐKT snapshot at current date.
 *
 * PHƯƠNG PHÁP (simplified, chưa full accrual accounting):
 *
 * TÀI SẢN:
 * - 111/112 Tiền mặt + TGNH = tính plug từ VCSH - các TS khác - nợ phải trả
 *   (chưa track sao kê thực tế). Nếu âm → có khoản gì miss.
 * - 131 Phải thu khách = sum totalReceivable revenue_reconciliations
 *                      − sum paidIn
 * - 138 Phải thu khác = sum nhóm 14 (đặt cọc hộ khách)
 * - 141 Tạm ứng nội bộ = sum nhóm 15 chi ra (chưa hoàn về)
 * - 153/211 TSCĐ/CCDC = sum nhóm 5 (Thiết bị) — chưa trừ khấu hao
 * - 244 Ký quỹ dài hạn = sum categoryCode='244'
 *
 * NỢ PHẢI TRẢ + VCSH:
 * - 331/334 Phải trả NCC/NLĐ = sum payable cost_reconciliations − paidOut
 * - 3411 Vay chủ = sum nhóm 13 chưa trả (booking chưa hoàn hết)
 * - 411 Vốn góp CSH = sum vốn founder (Triết + Bách chi hộ + 411 + 244 direct)
 * - 421 Lãi/lỗ lũy kế = tổng Lãi thuần lũy kế
 */
export default async function BalanceSheetPage() {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  // ===== TÀI SẢN =====

  // 131 Phải thu khách = totalReceivable − paidIn
  const [rev] = await db
    .select({
      receivable: sql<number>`coalesce(sum(total_receivable_this_time), 0)::float8`,
    })
    .from(revenueReconciliations);
  const [pin] = await db
    .select({ paid: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(paymentsIn);
  const phaiThuKhach = Number(rev.receivable) - Number(pin.paid);

  // 138 Phải thu khác = nhóm 14 (đặt cọc hộ khách, khách chưa hoàn)
  const [ck] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "131")); // nhóm 14 dùng code '131' theo classifier
  const phaiThuKhac = Number(ck.s);

  // 141 Tạm ứng nội bộ
  const [tu] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "141"));
  const tamUng = Number(tu.s);

  // 153/211 TSCĐ/CCDC (nhóm 5)
  const [tscd] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "153-211"));
  const tscdCcdc = Number(tscd.s);

  // 244 Ký quỹ dài hạn
  const [kq] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "244"));
  const kyQuy = Number(kq.s);

  // ===== NỢ PHẢI TRẢ =====

  // 331/334 Phải trả NCC/NLĐ = payable − paidOut
  const [cost] = await db
    .select({
      payable: sql<number>`coalesce(sum(amount_payable_this_time), 0)::float8`,
    })
    .from(costReconciliations);
  const [pout] = await db
    .select({ paid: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(paymentsOut);
  const phaiTraNCC = Number(cost.payable) - Number(pout.paid);

  // 3411 Vay chủ (Hoàn booking chưa trả hết) — em không có counter nên tạm 0
  const vayChu = 0;

  // ===== VCSH =====

  // 411 Vốn góp CSH = tổng Triết + Bách bỏ cá nhân − thứ cấp
  const capitalRows = await db
    .select({ s: sql<number>`sum(amount)::float8` })
    .from(financialTransactions)
    .where(
      and(
        inArray(financialTransactions.payer, ["Triết", "Bách"]),
        ne(financialTransactions.categoryCode, "secondary"),
      ),
    );
  const vonGop = Number(capitalRows[0]?.s ?? 0);

  // Lãi thuần lũy kế = DT/1.1 − Giá vốn − CP QL (accrual, cumulative)
  const [opexTotal] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, OPEX_CATEGORIES));
  const totalOpex = Number(opexTotal.s);
  const laiLoLuyKe = Number(rev.receivable) / 1.1 - Number(cost.payable) - totalOpex;

  // ===== TIỀN (111/112) plug =====
  // Tổng TS = Tổng NPT + VCSH
  // Tiền = (NPT + VCSH) − (các TS khác đã biết)
  const totalNonCashAsset = phaiThuKhach + phaiThuKhac + tamUng + tscdCcdc + kyQuy;
  const totalLiabEquity = phaiTraNCC + vayChu + vonGop + laiLoLuyKe;
  const tienMat = totalLiabEquity - totalNonCashAsset;

  const totalAsset = tienMat + totalNonCashAsset;

  const assets: Array<[string, string, number]> = [
    ["111/112", "Tiền mặt + TGNH", tienMat],
    ["131", "Phải thu khách hàng", phaiThuKhach],
    ["138", "Phải thu khác (cọc hộ khách)", phaiThuKhac],
    ["141", "Tạm ứng nội bộ", tamUng],
    ["153/211", "TSCĐ + CCDC (chưa trừ khấu hao)", tscdCcdc],
    ["244", "Ký quỹ dài hạn", kyQuy],
  ];
  const liabEquity: Array<[string, string, number, "npt" | "vcsh"]> = [
    ["331/334", "Phải trả NCC + NLĐ", phaiTraNCC, "npt"],
    ["3411", "Vay chủ / Hoàn booking chưa trả", vayChu, "npt"],
    ["411", "Vốn góp CSH (Triết + Bách)", vonGop, "vcsh"],
    ["421", "Lãi/lỗ chưa phân phối (lũy kế)", laiLoLuyKe, "vcsh"],
  ];

  const totalNPT = liabEquity.filter((l) => l[3] === "npt").reduce((s, l) => s + l[2], 0);
  const totalVCSH = liabEquity.filter((l) => l[3] === "vcsh").reduce((s, l) => s + l[2], 0);

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <div className="text-xs">
          <Link href="/reports" className="text-blue-600 hover:underline">
            ← Báo cáo
          </Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Bảng cân đối kế toán</h1>
        <p className="text-sm text-slate-500 mt-1">
          Snapshot tại {new Date().toISOString().slice(0, 10)}. Đơn giản hóa —
          chưa full accrual + chưa track sao kê thực. Tiền mặt/TGNH là plug (= NPT + VCSH −
          TS khác). Sẽ chính xác hơn khi có sổ nhật ký + sao kê.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TÀI SẢN */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="p-4 border-b border-slate-100 bg-blue-50">
            <h2 className="text-lg font-bold text-blue-900">TÀI SẢN</h2>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {assets.map(([code, name, val]) => (
                <tr key={code} className="border-t border-slate-100">
                  <td className="p-2 font-mono text-xs text-slate-500 w-16">{code}</td>
                  <td className="p-2">{name}</td>
                  <td className={`p-2 text-right tabular-nums ${val < 0 ? "text-red-700" : ""}`}>
                    {fmt(Math.round(val))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-blue-50 font-bold">
              <tr>
                <td colSpan={2} className="p-2">TỔNG TÀI SẢN</td>
                <td className="p-2 text-right tabular-nums text-blue-900">
                  {fmt(Math.round(totalAsset))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* NGUỒN VỐN */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="p-4 border-b border-slate-100 bg-green-50">
            <h2 className="text-lg font-bold text-green-900">NGUỒN VỐN</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <td colSpan={3} className="p-2 font-semibold">A. Nợ phải trả</td>
              </tr>
            </thead>
            <tbody>
              {liabEquity
                .filter((l) => l[3] === "npt")
                .map(([code, name, val]) => (
                  <tr key={code} className="border-t border-slate-100">
                    <td className="p-2 font-mono text-xs text-slate-500 w-16">{code}</td>
                    <td className="p-2">{name}</td>
                    <td className={`p-2 text-right tabular-nums ${val < 0 ? "text-red-700" : ""}`}>
                      {fmt(Math.round(val))}
                    </td>
                  </tr>
                ))}
              <tr className="bg-slate-50 font-semibold text-sm">
                <td colSpan={2} className="p-2">Tổng NPT</td>
                <td className="p-2 text-right tabular-nums">{fmt(Math.round(totalNPT))}</td>
              </tr>
            </tbody>
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <td colSpan={3} className="p-2 font-semibold">B. Vốn chủ sở hữu</td>
              </tr>
            </thead>
            <tbody>
              {liabEquity
                .filter((l) => l[3] === "vcsh")
                .map(([code, name, val]) => (
                  <tr key={code} className="border-t border-slate-100">
                    <td className="p-2 font-mono text-xs text-slate-500 w-16">{code}</td>
                    <td className="p-2">{name}</td>
                    <td className={`p-2 text-right tabular-nums ${val < 0 ? "text-red-700" : ""}`}>
                      {fmt(Math.round(val))}
                    </td>
                  </tr>
                ))}
              <tr className="bg-slate-50 font-semibold text-sm">
                <td colSpan={2} className="p-2">Tổng VCSH</td>
                <td className="p-2 text-right tabular-nums">{fmt(Math.round(totalVCSH))}</td>
              </tr>
            </tbody>
            <tfoot className="bg-green-50 font-bold">
              <tr>
                <td colSpan={2} className="p-2">TỔNG NGUỒN VỐN</td>
                <td className="p-2 text-right tabular-nums text-green-900">
                  {fmt(Math.round(totalLiabEquity))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-2">
        <p className="font-semibold">Ghi chú simplified accounting (chờ Phase 4 sổ nhật ký):</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <b>Tiền mặt/TGNH</b> là số plug (cân đối), không phải số dư sao kê thực. Nếu âm → có
            khoản chưa track (VD lãi ngân hàng thu vào, tiền vay ngoài).
          </li>
          <li>
            <b>TSCĐ/CCDC</b> chưa trừ khấu hao — số thực tế thấp hơn (khấu hao 3-5 năm).
          </li>
          <li>
            <b>Lãi/lỗ lũy kế</b> = DT ĐC/1.1 − Giá vốn ĐC − CP QL (dùng số ĐC, chưa phân biệt đã
            thu/chưa thu).
          </li>
          <li>
            <b>Thuế phải nộp (333)</b> chưa track — giả định đã nộp (nộp thuế = giảm tiền, không tăng nợ).
          </li>
        </ul>
      </div>
    </div>
  );
}
