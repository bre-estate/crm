import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/format";
import { partners, projects, products, revenueReconciliations, costReconciliations, paymentsIn } from "@/lib/schema";
import { count, sum } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  const [partnerCount] = await db.select({ c: count() }).from(partners);
  const [projectCount] = await db.select({ c: count() }).from(projects);
  const [productCount] = await db.select({ c: count() }).from(products);
  const [revCount] = await db.select({ c: count() }).from(revenueReconciliations);
  const [costCount] = await db.select({ c: count() }).from(costReconciliations);

  const [totalRev] = await db
    .select({ s: sum(revenueReconciliations.totalReceivableThisTime) })
    .from(revenueReconciliations)
  const [totalCost] = await db
    .select({ s: sum(costReconciliations.amountPayableThisTime) })
    .from(costReconciliations)
  const [totalPaidIn] = await db.select({ s: sum(paymentsIn.amount) }).from(paymentsIn);

  return {
    partners: partnerCount?.c ?? 0,
    projects: projectCount?.c ?? 0,
    products: productCount?.c ?? 0,
    revRec: revCount?.c ?? 0,
    costRec: costCount?.c ?? 0,
    totalRev: Number(totalRev?.s ?? 0),
    totalCost: Number(totalCost?.s ?? 0),
    totalPaidIn: Number(totalPaidIn?.s ?? 0),
  };
}

export default async function Home() {
  const s = await getStats();
  const profit = s.totalRev - s.totalCost;
  const margin = s.totalRev > 0 ? (profit / s.totalRev) * 100 : 0;

  const cards = [
    { label: "Đối tác", value: s.partners, href: "/partners" },
    { label: "Dự án / Hợp đồng", value: s.projects, href: "/projects" },
    { label: "Giao dịch (căn chốt)", value: s.products, href: "/products" },
    { label: "Đợt đối chiếu DT", value: s.revRec, href: "/revenues" },
    { label: "Dòng đối chiếu GV", value: s.costRec, href: "/costs" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dashboard theo dõi doanh thu, giá vốn, lợi nhuận toàn công ty.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-400 transition-colors"
          >
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className="text-2xl font-bold mt-2">{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Tổng doanh thu đã đối chiếu</div>
          <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(s.totalRev)}</div>
        </div>
        <div className="bg-white border border-orange-300 rounded-xl p-4 bg-orange-50">
          <div className="text-xs text-slate-500">Tổng giá vốn đã đối chiếu</div>
          <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(s.totalCost)}</div>
        </div>
        <div
          className={`bg-white border rounded-xl p-4 ${
            profit >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"
          }`}
        >
          <div className="text-xs text-slate-500">Lợi nhuận gộp</div>
          <div
            className={`text-xl font-bold mt-2 tabular-nums ${
              profit >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {fmtMoney(profit)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Biên LN: {margin.toFixed(1)}%</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Tiền đã nhận từ CĐT/F1</div>
          <div className="text-xl font-bold mt-2 tabular-nums">{fmtMoney(s.totalPaidIn)}</div>
          <div className="text-xs text-slate-500 mt-1">
            Còn phải thu: {fmtMoney(s.totalRev - s.totalPaidIn)}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="text-sm font-semibold mb-3">Flow nghiệp vụ</div>
        <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside">
          <li>
            <Link href="/partners" className="text-blue-700 hover:underline">
              Quản lý đối tác
            </Link>{" "}
            (CĐT / F1 / F2)
          </li>
          <li>
            <Link href="/projects" className="text-blue-700 hover:underline">
              Hợp đồng / dự án
            </Link>{" "}
            — cấu hình %PMG, biểu PMG theo mốc, số đợt TT
          </li>
          <li>
            <Link href="/products" className="text-blue-700 hover:underline">
              Giao dịch
            </Link>{" "}
            — mỗi căn chốt cọc là 1 record
          </li>
          <li>
            <Link href="/revenues" className="text-blue-700 hover:underline">
              Đối chiếu doanh thu
            </Link>{" "}
            với CĐT/F1 theo từng đợt, lập hóa đơn, nhận thanh toán
          </li>
          <li>
            <Link href="/costs" className="text-blue-700 hover:underline">
              Đối chiếu giá vốn
            </Link>{" "}
            nội bộ — HH sale, hỗ trợ khách, KPI CEO/TPKD/Admin, thưởng
          </li>
          <li>
            <Link href="/reports" className="text-blue-700 hover:underline">
              Báo cáo
            </Link>{" "}
            tổng hợp theo dự án / theo căn
          </li>
        </ol>
      </div>
    </div>
  );
}
