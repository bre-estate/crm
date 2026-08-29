"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Tổng quan" },
  { key: "revenue", label: "Doanh thu" },
  { key: "cost", label: "Giá vốn" },
] as const;

export type ProductSection = (typeof TABS)[number]["key"];

type Props = {
  active: ProductSection;
  /** Base URL (VD "/products/938") — không kèm query. */
  basePath: string;
  /** Query params khác (returnTo, ...) cần preserve. */
  preserveParams?: Record<string, string | undefined>;
};

export default function ProductDetailTabs({ active, basePath, preserveParams }: Props) {
  const buildHref = (section: ProductSection) => {
    const qs = new URLSearchParams();
    if (preserveParams) {
      for (const [k, v] of Object.entries(preserveParams)) {
        if (v) qs.set(k, v);
      }
    }
    if (section !== "overview") qs.set("section", section);
    return `${basePath}${qs.toString() ? "?" + qs.toString() : ""}`;
  };

  return (
    <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur -mx-4 md:-mx-6 px-4 md:px-6 py-2 border-b border-slate-200">
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildHref(t.key)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
              t.key === active
                ? "bg-orange-500 text-white font-semibold"
                : "text-slate-700 hover:bg-slate-200",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
