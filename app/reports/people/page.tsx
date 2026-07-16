import { redirect } from "next/navigation";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { hasReportsAccess } from "@/lib/auth";
import { loadReportData, parseFilters } from "@/lib/reports";
import { ReportsHeader } from "../_shared";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

export default async function ReportsPeoplePage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await hasReportsAccess())) redirect("/");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, prodRows, filterLabel, yearOptions, costReconsAll } = data;

  // Alias resolution: name → ownerName (nếu là alias)
  const allEmps = await db.select({ id: employees.id, name: employees.name, aliasOfId: employees.aliasOfId }).from(employees);
  const empById = new Map(allEmps.map((e) => [e.id, e]));
  const aliasMap = new Map<string, { ownerName: string; aliases: string[] }>();
  for (const e of allEmps) {
    if (e.aliasOfId) {
      const owner = empById.get(e.aliasOfId);
      if (owner) aliasMap.set(e.name.toLowerCase(), { ownerName: owner.name, aliases: [] });
    }
  }
  // Build reverse: owner → list aliases để show tooltip
  const ownerToAliases = new Map<string, string[]>();
  for (const e of allEmps) {
    if (e.aliasOfId) {
      const owner = empById.get(e.aliasOfId);
      if (owner) {
        if (!ownerToAliases.has(owner.name)) ownerToAliases.set(owner.name, []);
        ownerToAliases.get(owner.name)!.push(e.name);
      }
    }
  }
  const resolveName = (raw: string | null | undefined): string => {
    if (!raw) return "";
    const key = raw.trim().toLowerCase();
    const mapped = aliasMap.get(key);
    return mapped ? mapped.ownerName : raw.trim();
  };

  // Theo phòng
  const byDept = new Map<string, { name: string; numProducts: number; totalRevenue: number; totalCost: number }>();
  for (const p of prodRows) {
    const key = p.departmentName ?? "(Chưa phân phòng)";
    if (!byDept.has(key))
      byDept.set(key, { name: key, numProducts: 0, totalRevenue: 0, totalCost: 0 });
    const agg = byDept.get(key)!;
    agg.numProducts++;
    agg.totalRevenue += Number(p.totalRevenue ?? 0);
    agg.totalCost += Number(p.totalCost ?? 0);
  }
  const deptSorted = Array.from(byDept.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // KPI cá nhân NVKD (gộp DT căn + HH đã ĐC + dept)
  const byNvkd = new Map<
    string,
    {
      name: string;
      numProducts: number;
      totalRevenue: number;
      departments: Set<string>;
      hhReceived: number;
      hhBonusReceived: number;
    }
  >();
  const getOrInit = (key: string) => {
    if (!byNvkd.has(key)) {
      byNvkd.set(key, {
        name: key,
        numProducts: 0,
        totalRevenue: 0,
        departments: new Set(),
        hhReceived: 0,
        hhBonusReceived: 0,
      });
    }
    return byNvkd.get(key)!;
  };
  const productIdSet = new Set(prodRows.map((p) => p.id));
  for (const p of prodRows) {
    const rawName = p.salesPerson?.trim() || "";
    const key = rawName ? resolveName(rawName) : "(Chưa có NVKD)";
    const agg = getOrInit(key);
    agg.numProducts++;
    agg.totalRevenue += Number(p.totalRevenue ?? 0);
    if (p.departmentName) agg.departments.add(p.departmentName);
  }
  // Cost recons gắn với NVKD (theo employeeName text) — HH sale + thưởng
  for (const c of costReconsAll) {
    if (!productIdSet.has(c.productId)) continue;
    const raw = c.employeeName?.trim();
    if (!raw) continue;
    const key = resolveName(raw);
    if (!byNvkd.has(key)) continue; // chỉ tính người đã có căn trong period
    const agg = byNvkd.get(key)!;
    if (c.costType === "sale_commission") agg.hhReceived += c.paid;
    else if (c.costType === "cdt_bonus_sale" || c.costType === "bonus_sale")
      agg.hhBonusReceived += c.paid;
  }

  const nvkdSorted = Array.from(byNvkd.values())
    .filter((n) => n.name !== "(Chưa có NVKD)")
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
  const maxRev = nvkdSorted[0]?.totalRevenue ?? 1;
  const unassigned = byNvkd.get("(Chưa có NVKD)");

  return (
    <div className="space-y-6">
      <ReportsHeader
        activePath="/reports/people"
        filters={filters}
        yearOptions={yearOptions}
        filterLabel={filterLabel}
        totalProducts={grandTotals.products}
      />

      <div>
        <h2 className="text-lg font-semibold mb-3">Theo phòng — {filterLabel}</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Phòng</th>
                <th className="text-center p-2">Số căn</th>
                <th className="text-right p-2">Tổng DT</th>
                <th className="text-right p-2">Giá vốn</th>
                <th className="text-right p-2">Lãi gộp (không VAT)</th>
                <th className="text-right p-2">% trên tổng</th>
              </tr>
            </thead>
            <tbody>
              {deptSorted.map((d) => {
                const profit = d.totalRevenue / 1.1 - d.totalCost;
                const pct = grandTotals.revenueExp ? (d.totalRevenue / grandTotals.revenueExp) * 100 : 0;
                return (
                  <tr key={d.name} className="border-t border-slate-100">
                    <td className="p-2 font-medium">{d.name}</td>
                    <td className="p-2 text-center">{d.numProducts}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(d.totalRevenue)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(d.totalCost)}</td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${
                        profit >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(profit)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmtPctRaw(pct, 1)}</td>
                  </tr>
                );
              })}
              {deptSorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    Không có dữ liệu trong khoảng đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-1">KPI cá nhân NVKD — {filterLabel}</h2>
        <p className="text-xs text-slate-500 mb-3">
          Xếp hạng theo doanh thu mang lại; hoa hồng thực nhận đã tính từ payment thực (không tính dự kiến).
          {ownerToAliases.size > 0 && (
            <>
              {" "}Doanh số của{" "}
              {[...ownerToAliases.entries()].map(([owner, aliases], i, arr) => (
                <span key={owner}>
                  <b>{aliases.join(" + ")}</b> đã gộp về <b>{owner}</b>
                  {i < arr.length - 1 ? "; " : ""}
                </span>
              ))}
              .
            </>
          )}
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">NVKD</th>
                <th className="text-left p-2">Phòng</th>
                <th className="text-center p-2">Căn</th>
                <th className="text-right p-2 w-48">Tổng DT (gồm VAT)</th>
                <th className="text-right p-2">HH đã nhận</th>
                <th className="text-right p-2">Thưởng đã nhận</th>
              </tr>
            </thead>
            <tbody>
              {nvkdSorted.map((n, i) => {
                const pct = maxRev > 0 ? (n.totalRevenue / maxRev) * 100 : 0;
                const aliases = ownerToAliases.get(n.name) ?? [];
                return (
                  <tr key={n.name} className="border-t border-slate-100">
                    <td className="p-2 text-xs text-slate-500">#{i + 1}</td>
                    <td className="p-2 font-medium">
                      {n.name}
                      {aliases.length > 0 && (
                        <span
                          className="ml-2 text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                          title={`Đã gộp doanh số của: ${aliases.join(", ")} (đứng tên cho ${n.name})`}
                        >
                          +{aliases.length} người đứng tên
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-xs text-slate-500">
                      {[...n.departments].join(", ") || "—"}
                    </td>
                    <td className="p-2 text-center tabular-nums">{n.numProducts}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-right tabular-nums text-xs w-28">
                          {fmtMoney(n.totalRevenue)}
                        </div>
                      </div>
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs text-green-700">
                      {n.hhReceived > 0 ? fmtMoney(n.hhReceived) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs text-amber-700">
                      {n.hhBonusReceived > 0 ? fmtMoney(n.hhBonusReceived) : "—"}
                    </td>
                  </tr>
                );
              })}
              {nvkdSorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500">
                    Không có dữ liệu trong khoảng đã chọn.
                  </td>
                </tr>
              )}
              {unassigned && unassigned.numProducts > 0 && (
                <tr className="border-t border-slate-200 bg-amber-50">
                  <td className="p-2 text-xs" colSpan={3}>
                    ⚠️ Chưa gán NVKD — cần bổ sung
                  </td>
                  <td className="p-2 text-center tabular-nums">{unassigned.numProducts}</td>
                  <td className="p-2 text-right tabular-nums text-xs" colSpan={3}>
                    {fmtMoney(unassigned.totalRevenue)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
