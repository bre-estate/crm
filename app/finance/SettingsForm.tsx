"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Settings = {
  taxRate: number;
  businessStartDate: string | null;
};

type Props = {
  settings: Settings;
  onSave: (fd: FormData) => Promise<void>;
};

export default function SettingsForm({ settings, onSave }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      autoComplete="off"
      action={(fd) =>
        start(async () => {
          try {
            await onSave(fd);
            toast.success("Đã lưu cấu hình");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Lỗi");
          }
        })
      }
      className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
    >
      <div>
        <label className="block text-xs text-slate-600 mb-1">Thuế TNDN (%)</label>
        <input
          type="text"
          inputMode="decimal"
          name="taxRate"
          defaultValue={Number((settings.taxRate * 100).toFixed(2))}
          className="input"
          placeholder="20"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">
          Ngày bắt đầu kinh doanh
        </label>
        <input
          type="date"
          name="businessStartDate"
          defaultValue={settings.businessStartDate ?? ""}
          className="input"
        />
      </div>
      <div>
        <Button
          type="submit"
          disabled={pending}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {pending ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
      </div>
    </form>
  );
}
