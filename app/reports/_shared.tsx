import Link from "next/link";
import type { ReportFilters } from "@/lib/reports";
import { RANGE_LABEL, RANGE_MONTHS } from "@/lib/reports";

const PAGE_TITLE: Record<string, string> = {
  "/reports/overview": "Tổng hợp",
  "/reports/projects": "Theo dự án",
  "/reports/partners": "Đối tác",
  "/reports/people": "Theo nhân sự",
  "/reports/time": "Theo thời gian",
  "/reports/cashflow": "Dòng tiền",
};

export function ReportsHeader({
  activePath,
  filters,
  yearOptions,
  filterLabel,
  totalProducts,
}: {
  activePath: string;
  filters: ReportFilters;
  yearOptions: number[];
  filterLabel: string;
  totalProducts: number;
}) {
  const { year, range } = filters;
  const subtitle = PAGE_TITLE[activePath] ?? "";
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">
          Báo cáo{subtitle && <span className="text-slate-400 font-normal"> · {subtitle}</span>}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Lọc chung theo năm + khoảng thời gian dựa trên tháng ghi nhận DT.
        </p>
      </div>

      {/* Filter */}
      <form className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Năm</label>
          <select name="year" defaultValue={year ? String(year) : "all"} className="input min-w-32">
            <option value="all">Tất cả</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Khoảng</label>
          <select name="range" defaultValue={range} className="input min-w-48">
            {(Object.keys(RANGE_LABEL) as Array<keyof typeof RANGE_MONTHS>).map((k) => (
              <option key={k} value={k}>
                {RANGE_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-orange-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-orange-600"
        >
          Lọc
        </button>
        {(year || range !== "full") && (
          <Link
            href={activePath}
            className="bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-200"
          >
            Reset
          </Link>
        )}
        <div className="ml-auto text-sm">
          <span className="text-slate-500">Đang xem: </span>
          <span className="font-semibold">{filterLabel}</span>
          <span className="text-slate-500"> · {totalProducts} căn</span>
        </div>
      </form>
    </div>
  );
}

export function Card({
  label,
  value,
  sub,
  warn,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  highlight?: boolean;
}) {
  let cls = "bg-white border-slate-200";
  if (warn) cls = "bg-orange-50 border-orange-300";
  else if (highlight === true) cls = "bg-green-50 border-green-300";
  else if (highlight === false) cls = "bg-red-50 border-red-300";
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
