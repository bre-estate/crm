"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";

// Duplicate với server component (page.tsx) — vì server có STATUS_OPTIONS/TYPE_OPTIONS
// nội bộ, client cần bản riêng để render dropdown.
const STATUS_OPTIONS = [
  { key: "all", label: "Tất cả" },
  { key: "done", label: "Hoàn thành" },
  { key: "waiting_pay", label: "Đã ĐC" },
  { key: "partial", label: "Đã ĐC · TT 1 phần" },
  { key: "no_date", label: "Chưa ĐC" },
];

const TYPE_OPTIONS = [
  { key: "all", label: "Tất cả" },
  { key: "commission", label: "HH Sale" },
  { key: "bonus", label: "Thưởng nóng CĐT" },
];

type Props = {
  activeTab: string;
  activeStatus: string;
  activeAge: string;
  activeType: string;
  allProjects: { id: number; name: string; fullCode: string }[];
  nvkdOptions: { value: string; label: string; sublabel?: string }[];
  projectIdParam?: string;
  unitCodeParam?: string;
  salesPersonParam?: string;
  hasFilter: boolean;
};

/**
 * Filter form /revenues — 5 field trong 1 row:
 *   Mã căn / Dự án / Loại / Trạng thái / NVKD
 * onSubmit build URL sạch, preserve tab + age. Chỉ add param có value.
 */
export default function RevenuesFilterForm({
  activeTab,
  activeStatus,
  activeAge,
  activeType,
  allProjects,
  nvkdOptions,
  projectIdParam,
  unitCodeParam,
  salesPersonParam,
  hasFilter,
}: Props) {
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const qs = new URLSearchParams();
    qs.set("tab", activeTab);
    if (activeAge !== "all") qs.set("age", activeAge);
    for (const [key, value] of fd.entries()) {
      const v = typeof value === "string" ? value.trim() : "";
      if (v && v !== "all") qs.set(key, v);
    }
    router.push(`/revenues?${qs.toString()}`);
  };

  const resetUrl = `/revenues?tab=${activeTab}${activeAge !== "all" ? `&age=${activeAge}` : ""}`;

  return (
    <form className="flex gap-2 items-end flex-wrap" onSubmit={handleSubmit}>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Mã căn</label>
        <input
          type="text"
          name="unitCode"
          defaultValue={unitCodeParam ?? ""}
          className="input min-w-32"
          placeholder="vd: A.25.26"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Dự án</label>
        <SearchableSelect
          name="projectId"
          defaultValue={projectIdParam ?? ""}
          emptyOption="— Tất cả —"
          placeholder="Gõ tên dự án..."
          className="min-w-64"
          options={allProjects.map((p) => ({
            value: p.id,
            label: p.name,
            sublabel: p.fullCode,
          }))}
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Loại</label>
        <select name="type" defaultValue={activeType} className="input min-w-40">
          {TYPE_OPTIONS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Trạng thái</label>
        <select name="status" defaultValue={activeStatus} className="input min-w-44">
          {STATUS_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">NVKD</label>
        <SearchableSelect
          name="salesPerson"
          defaultValue={salesPersonParam ?? ""}
          emptyOption="— Tất cả —"
          placeholder="Gõ tên NVKD..."
          className="min-w-52"
          options={nvkdOptions}
        />
      </div>
      <Button
        type="submit"
        className="h-[38px] px-4 bg-slate-900 text-white hover:bg-slate-700"
      >
        Lọc
      </Button>
      {hasFilter && (
        <Button variant="outline" className="h-[38px] px-4" render={<Link href={resetUrl} />}>
          Reset
        </Button>
      )}
    </form>
  );
}
