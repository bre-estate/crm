"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";

type Props = {
  viewMode: "recon" | "byUnit" | "byTime";
  allProjects: { id: number; name: string; fullCode: string }[];
  nvkdOptions: { value: string; label: string; sublabel?: string }[];
  projectIdParam?: string;
  costTypeParam?: string;
  unitCodeParam?: string;
  salesPersonParam?: string;
  statusParam?: string;
  hasFilter: boolean;
  resetUrl: string;
};

/**
 * Filter form cho /costs — chỉ 3 field (mã căn / dự án / NVKD).
 * Cost type đã có sub-tabs pill riêng bên trên, KHÔNG lặp trong form.
 *
 * onSubmit tự build URL sạch:
 *   - preserve view + costType + status hiện tại (không phải input trong form)
 *   - chỉ add param có giá trị thực (bỏ empty như projectId=&salesPerson=)
 */
export default function CostsFilterForm({
  viewMode,
  allProjects,
  nvkdOptions,
  projectIdParam,
  costTypeParam,
  unitCodeParam,
  salesPersonParam,
  statusParam,
  hasFilter,
  resetUrl,
}: Props) {
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const qs = new URLSearchParams();

    // View + costType + status: preserve từ URL cũ, không phải input form.
    // "byUnit" là default → không cần add view= vào URL.
    if (viewMode !== "byUnit") qs.set("view", viewMode);
    if (costTypeParam) qs.set("costType", costTypeParam);
    if (statusParam) qs.set("status", statusParam);

    // Chỉ ghi param có giá trị (skip empty string / undefined).
    for (const [key, value] of fd.entries()) {
      const v = typeof value === "string" ? value.trim() : "";
      if (v) qs.set(key, v);
    }

    router.push(`/costs${qs.toString() ? "?" + qs.toString() : ""}`);
  };

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
          className="min-w-72"
          options={allProjects.map((p) => ({
            value: p.id,
            label: p.name,
            sublabel: p.fullCode,
          }))}
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">NVKD</label>
        <SearchableSelect
          name="salesPerson"
          defaultValue={salesPersonParam ?? ""}
          emptyOption="— Tất cả —"
          placeholder="Gõ tên NVKD..."
          className="min-w-56"
          options={nvkdOptions}
        />
      </div>
      <Button
        type="submit"
        className="h-[38px] px-5 bg-slate-100 text-slate-900 border border-slate-300 hover:bg-slate-200"
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
