"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";

type Props = {
  activeTab: string;
  allProjects: { id: number; name: string; fullCode: string }[];
  allDepts: { id: number; name: string }[];
  salesPersonOptions: { name: string; position: string | null; isCtv: boolean }[];
  filterUnitCode?: string;
  projectId?: string;
  departmentId?: string;
  filterSalesPerson?: string;
  dateFrom?: string;
  dateTo?: string;
  hasFilter: boolean;
};

/**
 * Filter form /products — client component.
 * Preserve tab param, onSubmit build URL sạch (skip empty).
 */
export default function ProductsFilterForm(props: Props) {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(props.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(props.dateTo ?? "");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const qs = new URLSearchParams();
    qs.set("tab", props.activeTab);
    if (dateFrom) qs.set("from", dateFrom);
    if (dateTo) qs.set("to", dateTo);
    for (const [key, value] of fd.entries()) {
      if (key === "from" || key === "to") continue;
      const v = typeof value === "string" ? value.trim() : "";
      if (v) qs.set(key, v);
    }
    router.push(`/products?${qs.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end flex-wrap">
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Mã căn</label>
        <input
          type="text"
          name="unitCode"
          defaultValue={props.filterUnitCode ?? ""}
          className="input w-28 text-sm"
          placeholder="A.25.26"
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Dự án</label>
        <SearchableSelect
          name="projectId"
          defaultValue={props.projectId ?? ""}
          emptyOption="— Tất cả —"
          placeholder="Dự án..."
          className="w-40"
          options={props.allProjects.map((p) => ({
            value: p.id,
            label: p.name,
            sublabel: p.fullCode,
          }))}
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Phòng</label>
        <SearchableSelect
          name="departmentId"
          defaultValue={props.departmentId ?? ""}
          emptyOption="— Tất cả —"
          placeholder="Phòng..."
          className="w-32"
          options={props.allDepts.map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">NVKD</label>
        <SearchableSelect
          name="salesPerson"
          defaultValue={props.filterSalesPerson ?? ""}
          emptyOption="— Tất cả —"
          placeholder="NVKD..."
          className="w-40"
          options={props.salesPersonOptions.map((s) => ({
            value: s.name,
            label: s.name,
            sublabel: s.isCtv ? "CTV" : s.position ? s.position.toUpperCase() : undefined,
          }))}
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Từ ngày cọc</label>
        <DatePicker value={dateFrom} onChange={setDateFrom} className="w-40" />
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Đến ngày cọc</label>
        <DatePicker value={dateTo} onChange={setDateTo} className="w-40" />
      </div>
      <Button
        type="submit"
        className="h-[36px] px-4 bg-slate-100 text-slate-900 border border-slate-300 hover:bg-slate-200 self-end"
      >
        Lọc
      </Button>
      {props.hasFilter && (
        <Button
          variant="outline"
          className="h-[36px] px-4 self-end"
          render={<Link href={`/products?tab=${props.activeTab}`} />}
        >
          Reset
        </Button>
      )}
    </form>
  );
}
