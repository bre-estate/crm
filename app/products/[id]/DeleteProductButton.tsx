"use client";

import { useTransition } from "react";
import { toast } from "sonner";

type Props = {
  unitCode: string;
  onDelete: () => Promise<void>;
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
            await onDelete();
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
            toast.error(e instanceof Error ? e.message : "Không xóa được");
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
