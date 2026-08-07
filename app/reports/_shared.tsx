import Link from "next/link";
import type { ReportFilters } from "@/lib/reports";
import { RANGE_LABEL, RANGE_MONTHS } from "@/lib/reports";
import { Card as ShadCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_TITLE: Record<string, string> = {
  "/reports/profit-detail": "Lợi nhuận chi tiết",
  "/reports/projects": "Theo dự án",
  "/reports/partners": "Đối tác",
  "/reports/people": "Theo nhân sự",
  "/reports/cash-flow": "Dòng tiền",
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
      <ShadCard className="[--card-spacing:1rem] px-4 gap-3 flex-row flex-wrap items-end">
        <form className="flex gap-3 items-end flex-wrap flex-1">
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
          <Button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Lọc
          </Button>
          {(year || range !== "full") && (
            <Button variant="outline" render={<Link href={activePath} />}>
              Reset
            </Button>
          )}
        </form>
        <div className="ml-auto text-sm">
          <span className="text-slate-500">Đang xem: </span>
          <span className="font-semibold">{filterLabel}</span>
          <span className="text-slate-500"> · {totalProducts} căn</span>
        </div>
      </ShadCard>
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
  let cls = "";
  if (warn) cls = "bg-orange-50 ring-orange-300";
  else if (highlight === true) cls = "bg-green-50 ring-green-300";
  else if (highlight === false) cls = "bg-red-50 ring-red-300";
  return (
    <ShadCard className={cn("px-4", cls)}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </ShadCard>
  );
}
