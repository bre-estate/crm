"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Props = {
  onDelete: () => Promise<void>;
  label: string;
};

export default function DeleteButton({ onDelete, label }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (!confirm(`Xóa "${label}"?`)) return;
        start(async () => {
          try {
            await onDelete();
            toast.success("Đã xóa");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Lỗi xóa");
          }
        });
      }}
      disabled={pending}
      className="text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "..." : "Xóa"}
    </button>
  );
}
