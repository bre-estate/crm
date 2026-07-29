import { requirePermission } from "@/lib/auth";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function FinanceImportPage() {
  await requirePermission("finance", "edit");

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Import chi phí từ Excel</h1>
        <p className="text-sm text-slate-500 mt-1">
          Nạp 3 loại file vào hệ thống tài chính. Row trùng (dedup_key) sẽ bị bỏ qua.
        </p>
      </div>
      <ImportClient />
    </div>
  );
}
