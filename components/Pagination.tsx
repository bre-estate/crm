import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  currentPage: number; // 1-indexed
  totalRows: number;
  pageSize: number;
  /** Base URL không có `page` param. VD "/costs?view=byUnit". */
  buildUrl: (page: number) => string;
  /** Hiển thị info "X - Y / N" bên trái. */
  itemLabel?: string; // VD "dòng", "căn", "yêu cầu"
};

/**
 * Pagination component dùng chung — server-side với URL param `?page=N`.
 * Không hiển thị paging nếu total ≤ pageSize.
 */
export default function Pagination({
  currentPage,
  totalRows,
  pageSize,
  buildUrl,
  itemLabel = "dòng",
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.max(1, Math.min(totalPages, currentPage));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(totalRows, page * pageSize);

  // Nếu total ≤ pageSize → chỉ hiện info, không hiện paging buttons
  const hidePager = totalRows <= pageSize;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-slate-600">
      <div>
        {totalRows === 0 ? (
          <span>0 {itemLabel}</span>
        ) : (
          <span>
            <b className="tabular-nums">{from.toLocaleString("vi-VN")}</b>
            {" – "}
            <b className="tabular-nums">{to.toLocaleString("vi-VN")}</b>
            {" / "}
            <b className="tabular-nums">{totalRows.toLocaleString("vi-VN")}</b>{" "}
            {itemLabel}
          </span>
        )}
      </div>

      {!hidePager && (
        <div className="flex items-center gap-1">
          <PageLink
            page={page - 1}
            disabled={page <= 1}
            buildUrl={buildUrl}
            label="←"
            title="Trang trước"
          />
          {pageRange(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-slate-400">
                …
              </span>
            ) : (
              <PageLink
                key={p}
                page={p as number}
                active={p === page}
                buildUrl={buildUrl}
                label={String(p)}
              />
            ),
          )}
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            buildUrl={buildUrl}
            label="→"
            title="Trang sau"
          />
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  active,
  disabled,
  buildUrl,
  label,
  title,
}: {
  page: number;
  active?: boolean;
  disabled?: boolean;
  buildUrl: (page: number) => string;
  label: string;
  title?: string;
}) {
  const cls = cn(
    "inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-md border text-xs tabular-nums transition-colors",
    active
      ? "bg-orange-500 text-white border-orange-500 font-semibold"
      : disabled
        ? "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100",
  );
  if (disabled || active) {
    return (
      <span className={cls} title={title}>
        {label}
      </span>
    );
  }
  return (
    <Link href={buildUrl(page)} className={cls} title={title}>
      {label}
    </Link>
  );
}

/**
 * Compact page range: current ± 1, first, last, ellipsis khi cần.
 * VD (page=5, total=10) → [1, …, 4, 5, 6, …, 10]
 */
function pageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [];
  const push = (v: number | "…") => {
    if (out[out.length - 1] !== v) out.push(v);
  };
  push(1);
  if (current > 3) push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    push(p);
  }
  if (current < total - 2) push("…");
  push(total);
  return out;
}
