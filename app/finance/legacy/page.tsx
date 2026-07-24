import { db } from "@/lib/db";
import { companyInvestments, companyExpenses, companySettings } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { fmtMoney, fmtDate, fmtPct } from "@/lib/format";
import { getOwnerEmail } from "@/lib/auth";
import InvestmentForm from "../InvestmentForm";
import ExpenseForm from "../ExpenseForm";
import SettingsForm from "../SettingsForm";
import DeleteButton from "../DeleteButton";
import {
  deleteInvestment,
  deleteExpense,
  createInvestment,
  createExpense,
  updateSettings,
} from "@/lib/actions/finance";

export const dynamic = "force-dynamic";

const INV_CAT_LABEL: Record<string, string> = {
  office: "Văn phòng",
  equipment: "Thiết bị",
  software: "Phần mềm / License",
  vehicle: "Phương tiện",
  other: "Khác",
};

const EXP_CAT_LABEL: Record<string, string> = {
  salary: "Lương",
  rent: "Thuê VP",
  marketing: "Marketing",
  utilities: "Điện/Nước/Net",
  outsource: "Thuê ngoài",
  other: "Khác",
};

export default async function FinancePage() {
  // Bảo vệ page — chỉ owner (trietnguyen308@gmail.com) mới thấy.
  // Others → notFound (không leak sự tồn tại của trang).
  const ownerEmail = await getOwnerEmail();
  if (!ownerEmail) notFound();

  const [investments, expenses, settingsRows] = await Promise.all([
    db.select().from(companyInvestments).orderBy(desc(companyInvestments.investedAt)),
    db.select().from(companyExpenses).orderBy(desc(companyExpenses.expenseMonth)),
    db.select().from(companySettings),
  ]);
  const settings = settingsRows[0] ?? { id: 1, taxRate: 0.2, businessStartDate: null };

  const totalInvestment = investments.reduce((s, i) => s + Number(i.amount), 0);
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Tài chính công ty</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vốn đầu tư ban đầu, chi phí quản lý hàng tháng, thuế TNDN. Dùng để
          tính Lãi thuần / ROI trên trang Báo cáo.
        </p>
      </div>

      {/* Cấu hình */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-1">⚙️ Cấu hình</h2>
        <p className="text-xs text-slate-500 mb-4">
          Thuế TNDN + ngày bắt đầu kinh doanh (dùng tính Payback period).
        </p>
        <SettingsForm
          settings={settings}
          onSave={async (fd) => {
            "use server";
            await updateSettings(fd);
          }}
        />
      </section>

      {/* Vốn đầu tư */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold">💼 Vốn đầu tư (Capex)</h2>
            <p className="text-xs text-slate-500 mt-1">
              Các khoản đầu tư 1 lần (VP, thiết bị, license). Có khấu hao =
              phân bổ đều theo tháng. Không khấu hao = tính vào tổng ROI luôn.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Tổng đầu tư</div>
            <div className="text-lg font-bold tabular-nums text-blue-700">
              {fmtMoney(totalInvestment)}
            </div>
          </div>
        </div>

        <InvestmentForm
          onSave={async (fd) => {
            "use server";
            await createInvestment(fd);
          }}
        />

        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">Ngày</th>
                <th className="text-left p-2">Loại</th>
                <th className="text-left p-2">Mô tả</th>
                <th className="text-right p-2 whitespace-nowrap">Số tiền</th>
                <th className="text-center p-2 whitespace-nowrap">Khấu hao (tháng)</th>
                <th className="text-left p-2">Ghi chú</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {investments.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="p-2 whitespace-nowrap">{fmtDate(i.investedAt)}</td>
                  <td className="p-2 text-slate-700">{INV_CAT_LABEL[i.category] ?? i.category}</td>
                  <td className="p-2 font-medium">{i.description}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {fmtMoney(i.amount)}
                  </td>
                  <td className="p-2 text-center text-slate-500">
                    {i.amortizationMonths ?? <span className="text-slate-300">1 lần</span>}
                  </td>
                  <td className="p-2 text-slate-500 text-xs">{i.note ?? "—"}</td>
                  <td className="p-2 text-right">
                    <DeleteButton
                      onDelete={async () => {
                        "use server";
                        await deleteInvestment(i.id);
                      }}
                      label={i.description}
                    />
                  </td>
                </tr>
              ))}
              {investments.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 italic text-sm">
                    Chưa có khoản đầu tư nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Chi phí quản lý */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold">🧾 Chi phí quản lý (Opex)</h2>
            <p className="text-xs text-slate-500 mt-1">
              Chi phí hàng tháng: lương, thuê VP, marketing, điện nước... Ghi
              nhận theo từng tháng cụ thể.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Tổng CP đã ghi</div>
            <div className="text-lg font-bold tabular-nums text-orange-700">
              {fmtMoney(totalExpense)}
            </div>
          </div>
        </div>

        <ExpenseForm
          onSave={async (fd) => {
            "use server";
            await createExpense(fd);
          }}
        />

        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">Tháng</th>
                <th className="text-left p-2">Loại</th>
                <th className="text-left p-2">Mô tả</th>
                <th className="text-right p-2 whitespace-nowrap">Số tiền</th>
                <th className="text-left p-2">Ghi chú</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="p-2 whitespace-nowrap font-mono text-xs">
                    {e.expenseMonth}
                  </td>
                  <td className="p-2 text-slate-700">
                    {EXP_CAT_LABEL[e.category] ?? e.category}
                  </td>
                  <td className="p-2">{e.description ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {fmtMoney(e.amount)}
                  </td>
                  <td className="p-2 text-slate-500 text-xs">{e.note ?? "—"}</td>
                  <td className="p-2 text-right">
                    <DeleteButton
                      onDelete={async () => {
                        "use server";
                        await deleteExpense(e.id);
                      }}
                      label={`${e.expenseMonth} · ${EXP_CAT_LABEL[e.category] ?? e.category}`}
                    />
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 italic text-sm">
                    Chưa có chi phí nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
