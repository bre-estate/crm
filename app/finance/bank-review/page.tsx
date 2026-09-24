/**
 * Sao kê ngân hàng: bản sao trung thực của file Techcombank xuất ra.
 *
 * Mục đích là TRA CỨU và ĐỐI CHIẾU, nên hiện đúng những gì ngân hàng ghi: ngày,
 * nội dung chuyển khoản, số tiền, số dư. Không phân loại gì ở đây.
 *
 * Việc bóc tách một lệnh gộp thành hoa hồng, lương, thưởng là việc của báo cáo.
 * Báo cáo tự làm điều đó mỗi lần chạy, bằng bộ luật trong lib/bank-cash-core.ts
 * vốn biết bảng lương và kho thưởng nên tách được, chứ không chỉ dò từ khóa.
 */
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/schema";
import { requirePermission, getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { thuMucCho, type CauHinhDrive } from "@/lib/documents-core";
import { integrations } from "@/lib/schema";
import { and, sql, ilike, gte, lte, desc, or, eq, type SQL } from "drizzle-orm";
import Link from "next/link";
import NapSaoKe from "./NapSaoKe";
import { tenNganHangGon } from "@/lib/ten-ngan-hang";

export const dynamic = "force-dynamic";

const GIOI_HAN = 500;
const fmt = (n: number | null) => (n == null || n === 0 ? "" : Math.round(Math.abs(n)).toLocaleString("vi-VN"));
const fmtNgay = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

type SP = Promise<{ q?: string; year?: string; chieu?: string; tu?: string; den?: string }>;

export default async function BankStatementPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("finance");
  const user = await getCurrentUser();
  const napDuoc = !!user && hasPermission(user.role, user.customPermissions, "finance", "edit");
  const sp = await searchParams;

  const q = sp.q?.trim() || null;
  const nam = sp.year?.trim() || String(new Date().getFullYear());
  const chieu = sp.chieu === "vao" || sp.chieu === "ra" ? sp.chieu : null;
  const tu = sp.tu?.trim() || null;
  const den = sp.den?.trim() || null;

  const dieuKien: SQL[] = [];
  if (q) {
    // Tìm trong nội dung chuyển khoản, tên đối tác và số bút toán.
    const nhu = `%${q}%`;
    dieuKien.push(
      or(
        ilike(bankTransactions.description, nhu),
        ilike(bankTransactions.partnerName, nhu),
        ilike(bankTransactions.referenceNumber, nhu),
        ilike(bankTransactions.partnerAccount, nhu),
      )!,
    );
  }
  if (tu) dieuKien.push(gte(bankTransactions.transactionDate, tu));
  if (den) dieuKien.push(lte(bankTransactions.transactionDate, den));
  if (!tu && !den && nam !== "all") {
    dieuKien.push(gte(bankTransactions.transactionDate, `${nam}-01-01`));
    dieuKien.push(lte(bankTransactions.transactionDate, `${nam}-12-31`));
  }
  if (chieu === "vao") dieuKien.push(sql`coalesce(credit_amount,0) > 0`);
  if (chieu === "ra") dieuKien.push(sql`coalesce(debit_amount,0) < 0 OR coalesce(fee_interest,0) < 0`);
  const loc = dieuKien.length ? and(...dieuKien) : undefined;

  const [tong] = await db
    .select({
      soDong: sql<number>`count(*)::int`,
      vao: sql<number>`coalesce(sum(coalesce(credit_amount,0)),0)::float8`,
      ra: sql<number>`coalesce(sum(coalesce(debit_amount,0) + coalesce(fee_interest,0) + coalesce(vat,0)),0)::float8`,
    })
    .from(bankTransactions)
    .where(loc);

  const rows = await db
    .select({
      id: bankTransactions.id,
      ngay: bankTransactions.transactionDate,
      soButToan: bankTransactions.referenceNumber,
      doiTac: bankTransactions.partnerName,
      stkDoiTac: bankTransactions.partnerAccount,
      nhDoiTac: bankTransactions.partnerBank,
      noiDung: bankTransactions.description,
      no: bankTransactions.debitAmount,
      co: bankTransactions.creditAmount,
      phi: bankTransactions.feeInterest,
      vat: bankTransactions.vat,
      soDu: bankTransactions.runningBalance,
    })
    .from(bankTransactions)
    .where(loc)
    .orderBy(desc(bankTransactions.statementSeq))
    .limit(GIOI_HAN);

  const [driveTh] = await db
    .select()
    .from(integrations)
    .where(eq(integrations.provider, "google_drive"));
  const thuMucSaoKe = driveTh?.enabled ? thuMucCho(driveTh.config as CauHinhDrive, "sao_ke") : null;

  const pill = (on: boolean) =>
    `inline-block px-2.5 py-1 rounded-md text-xs ${on ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`;
  const link = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (nam) u.set("year", nam);
    if (chieu) u.set("chieu", chieu);
    if (tu) u.set("tu", tu);
    if (den) u.set("den", den);
    for (const [k, v] of Object.entries(patch)) v == null ? u.delete(k) : u.set(k, v);
    return `/finance/bank-review?${u}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sao kê ngân hàng</h1>
        <p className="text-sm text-slate-500 mt-1">
          Đúng những gì Techcombank xuất ra, không sửa gì. Dùng để tra nội dung chuyển khoản và số
          tiền. Tài khoản công ty: 39676789. Việc xếp nhóm thu chi nằm ở{" "}
          <Link href="/reports/profit-detail" className="underline">
            báo cáo Lãi lỗ và dòng tiền
          </Link>
          .
        </p>
      </div>

      {napDuoc && <NapSaoKe thuMucGoc={thuMucSaoKe} driveDangBat={!!driveTh?.enabled} />}

      <form className="bg-card rounded-xl ring-1 ring-foreground/10 p-4 flex flex-wrap gap-3 items-end text-sm">
        <div className="flex-1 min-w-64">
          <label className="block text-xs text-slate-500 mb-1">
            Tìm trong nội dung, tên đối tác, số tài khoản, số bút toán
          </label>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="vd: hoa hong, Dataloca, 6236238"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Từ ngày</label>
          <input type="date" name="tu" defaultValue={tu ?? ""} className="input" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Đến ngày</label>
          <input type="date" name="den" defaultValue={den ?? ""} className="input" />
        </div>
        <input type="hidden" name="year" value={nam} />
        <button type="submit" className="bg-orange-500 text-white px-4 py-2 rounded-md hover:bg-orange-600">
          Tìm
        </button>
        <Link href="/finance/bank-review" className="border px-4 py-2 rounded-md hover:bg-slate-50">
          Xóa lọc
        </Link>
      </form>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {["2024", "2025", "2026", "all"].map((y) => (
            <Link key={y} href={link({ year: y, tu: null, den: null })} className={pill(nam === y)}>
              {y === "all" ? "Tất cả" : y}
            </Link>
          ))}
        </div>
        <div className="flex gap-1">
          <Link href={link({ chieu: null })} className={pill(!chieu)}>
            Cả hai chiều
          </Link>
          <Link href={link({ chieu: "vao" })} className={pill(chieu === "vao")}>
            Tiền vào
          </Link>
          <Link href={link({ chieu: "ra" })} className={pill(chieu === "ra")}>
            Tiền ra
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <O nhan="Số giao dịch" giaTri={String(tong?.soDong ?? 0)} />
        <O nhan="Tổng tiền vào" giaTri={fmt(tong?.vao ?? 0) || "0"} mau="text-green-700" />
        <O nhan="Tổng tiền ra" giaTri={fmt(tong?.ra ?? 0) || "0"} mau="text-red-700" />
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2 w-24">Ngày</th>
              <th className="text-left p-2">Nội dung chuyển khoản</th>
              <th className="text-left p-2 w-52">Đối tác</th>
              <th className="text-right p-2 w-32">Tiền vào</th>
              <th className="text-right p-2 w-32">Tiền ra</th>
              <th className="text-right p-2 w-36">Số dư</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-500">
                  Không có giao dịch nào khớp. Thử bỏ bớt điều kiện lọc.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const raTong = Number(r.no ?? 0) + Number(r.phi ?? 0) + Number(r.vat ?? 0);
              return (
                <tr key={r.id} className="border-t hover:bg-slate-50 align-top">
                  <td className="p-2 whitespace-nowrap tabular-nums">{fmtNgay(r.ngay)}</td>
                  <td className="p-2">
                    {r.noiDung}
                    <div className="text-[11px] text-slate-400">số bút toán {r.soButToan}</div>
                  </td>
                  <td className="p-2 text-slate-600">
                    {r.doiTac}
                    {r.stkDoiTac && (
                      <div className="text-[11px] text-slate-400">
                        {r.stkDoiTac}
                        {tenNganHangGon(r.nhDoiTac) ? ` · ${tenNganHangGon(r.nhDoiTac)}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums text-green-700">{fmt(r.co)}</td>
                  <td className="p-2 text-right tabular-nums text-red-700">
                    {fmt(raTong)}
                    {Number(r.phi ?? 0) !== 0 && (
                      <div className="text-[11px] text-slate-400">gồm phí {fmt(r.phi)}</div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums text-slate-600">{fmt(r.soDu)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {napDuoc && (
        <p className="text-xs text-slate-500">
          Báo cáo không xếp được nhóm cho vài giao dịch?{" "}
          <Link href="/finance/bank-review/can-phan-loai" className="underline">
            Xem và xếp giúp tại đây
          </Link>
          .
        </p>
      )}

      {(tong?.soDong ?? 0) > GIOI_HAN && (
        <p className="text-xs text-slate-500">
          Đang hiện {GIOI_HAN} giao dịch mới nhất trong tổng số {tong?.soDong}. Thu hẹp khoảng ngày hoặc
          gõ thêm từ khóa để thấy phần còn lại.
        </p>
      )}
    </div>
  );
}

function O({ nhan, giaTri, mau }: { nhan: string; giaTri: string; mau?: string }) {
  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{nhan}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${mau ?? ""}`}>{giaTri}</div>
    </div>
  );
}
