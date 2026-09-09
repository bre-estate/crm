"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createRetroRecons, exportPeriodHhSale, exportPeriodKpiTpkd } from "@/lib/actions/periods";

function download(filename: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PeriodToolbar({
  periodKey,
  pendingCount,
  canEdit,
}: {
  periodKey: string;
  pendingCount: number;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || !canEdit}
        onClick={() =>
          run(async () => {
            const r = await exportPeriodHhSale(periodKey);
            download(r.filename, r.base64);
          })
        }
      >
        Xuất Bảng HH Sale
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || !canEdit}
        onClick={() =>
          run(async () => {
            const r = await exportPeriodKpiTpkd(periodKey);
            download(r.filename, r.base64);
          })
        }
      >
        Xuất QĐ KPI TPKD
      </Button>
      {pendingCount > 0 && (
        <Button
          type="button"
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white"
          disabled={pending || !canEdit}
          onClick={() => {
            if (!confirm(`Tạo ${pendingCount} đối chiếu hồi tố / hoàn chi dư cho kỳ ${periodKey}?`)) return;
            run(async () => {
              const r = await createRetroRecons(periodKey, "all");
              toast.success(`Đã tạo ${r.created} đối chiếu${r.skipped ? `, bỏ qua ${r.skipped}` : ""}`);
              router.refresh();
            });
          }}
        >
          Tạo tất cả hồi tố ({pendingCount})
        </Button>
      )}
    </div>
  );
}

export function RetroRowButton({
  periodKey,
  reconId,
  canEdit,
}: {
  periodKey: string;
  reconId: number;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!canEdit) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await createRetroRecons(periodKey, [reconId]);
            if (r.created) toast.success("Đã tạo đối chiếu hồi tố");
            else toast.info("Đối chiếu này đã có hồi tố");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Lỗi");
          }
        })
      }
      className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 whitespace-nowrap disabled:opacity-50"
    >
      Tạo ĐC hồi tố
    </button>
  );
}
