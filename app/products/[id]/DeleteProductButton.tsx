"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";

type Props = {
  unitCode: string;
  onDelete: () => Promise<{ error: string } | void>;
};

export default function DeleteProductButton({ unitCode, onDelete }: Props) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      onClick={() => {
        const confirmed = confirm(
          `Xóa căn "${unitCode}"?\n\nHành động này không hoàn tác được. Nếu căn có đối chiếu doanh thu / giá vốn thì em sẽ chặn.`,
        );
        if (!confirmed) return;
        start(async () => {
          try {
            if (baoLoi(await onDelete())) return;
            // Nếu action redirect, dòng dưới không chạy tới
            toast.success(`Đã xóa căn ${unitCode}`);
          } catch (e) {
            // NEXT_REDIRECT throw sau khi action call redirect() → normal
            if (
              e &&
              typeof e === "object" &&
              "digest" in e &&
              String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")
            ) {
              throw e;
            }
            toast.error(cauLoi(e));
          }
        });
      }}
      disabled={pending}
      className="text-red-600 border border-red-300 px-3 py-2 rounded-lg text-sm hover:bg-red-50 whitespace-nowrap disabled:opacity-50"
    >
      {pending ? "Đang xóa..." : "🗑 Xóa"}
    </button>
  );
}
