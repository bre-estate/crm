"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu cấu hình"}
        </button>
      </div>
    </form>
  );
}
