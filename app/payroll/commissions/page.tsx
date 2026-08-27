import { requirePermission } from "@/lib/auth";
import { loadPayrollEmployees } from "@/lib/actions/payroll";
import PayrollCommissionsClient from "./PayrollCommissionsClient";

export const dynamic = "force-dynamic";

export default async function PayrollCommissionsPage() {
  await requirePermission("payroll.commissions", "view");
  const employees = await loadPayrollEmployees();
  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Xuất bảng hoa hồng</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tự động sinh bảng đối chiếu HH (NVKD / TPKD / Admin) từ dữ liệu giá vốn đã đối chiếu.
          Layout khớp file Excel kế toán, có thể tải xuống + gửi cho NV ký.
        </p>
      </div>
      <PayrollCommissionsClient employees={employees} />
    </div>
  );
}
