import { redirect } from "next/navigation";
import Link from "next/link";
import { hasReportsAccess, hasSegmentsAccess } from "@/lib/auth";
import { getOwnerEmail } from "@/lib/auth";

type SearchParams = Promise<{ year?: string; range?: string }>;

type ReportLink = {
  href: string;
  title: string;
  desc: string;
  gate?: "owner" | "reports" | "segments";
};

type Section = {
  key: string;
  title: string;
  icon: string;
  color: string;
  reports: ReportLink[];
};

const SECTIONS: Section[] = [
  {
    key: "pnl",
    title: "Lãi lỗ và dòng tiền",
    icon: "💰",
    color: "bg-orange-50 border-orange-300",
    reports: [
      { href: "/reports/profit-detail", title: "Lãi/lỗ quản trị", desc: "Theo dòng tiền: thu, chi giá vốn, chi cố định, thuế, ngoài hoạt động, khớp số dư. Có cách nhìn dồn tích để đối chiếu kế toán.", gate: "reports" },
      { href: "/reports/cash-flow", title: "Dòng tiền ngân hàng", desc: "Số dư, runway, tiền vào ra theo tháng từ sao kê Techcombank.", gate: "owner" },
      { href: "/reports/kpi-dashboard", title: "KPI dashboard", desc: "Chỉ số chính theo kỳ: doanh thu, biên gộp, số căn, hoa hồng.", gate: "reports" },
      { href: "/reports/break-even", title: "Điểm hòa vốn", desc: "Chi phí cố định so với biên gộp, cần bao nhiêu doanh thu mỗi tháng.", gate: "reports" },
      { href: "/reports/balance-sheet", title: "Bảng cân đối quản trị", desc: "Tài sản, nợ, vốn tại một thời điểm. Nguồn sổ NKC.", gate: "reports" },
    ],
  },
  {
    key: "sales",
    title: "Bán hàng và hoa hồng",
    icon: "🏢",
    color: "bg-emerald-50 border-emerald-200",
    reports: [
      { href: "/reports/sales", title: "Bán hàng", desc: "Doanh thu ghi nhận theo dự án, CĐT, nhân viên, phòng. Xem theo tháng, quý, năm.", gate: "reports" },
      { href: "/reports/commissions", title: "Hoa hồng", desc: "Hoa hồng từng nhân viên: đã ghi nhận, đã trả, còn nợ.", gate: "reports" },
      { href: "/reports/people", title: "Theo nhân sự", desc: "Theo phòng và KPI cá nhân: căn, doanh thu, hoa hồng, thưởng.", gate: "reports" },
      { href: "/reports/project-profitability", title: "Lãi/lỗ theo dự án", desc: "Doanh thu trừ giá vốn từng dự án, biên gộp để so sánh.", gate: "reports" },
      { href: "/reports/unit-profitability", title: "Lãi từng căn", desc: "Doanh thu, giá vốn, lãi của từng căn.", gate: "reports" },
      { href: "/reports/segments", title: "Phân khúc căn", desc: "Số phòng ngủ, tầm giá, diện tích.", gate: "segments" },
    ],
  },
  {
    key: "debt",
    title: "Công nợ và chi phí",
    icon: "📋",
    color: "bg-sky-50 border-sky-200",
    reports: [
      { href: "/reports/ar-aging", title: "Tuổi nợ phải thu", desc: "CĐT nào còn nợ, bao lâu. Nhóm 0-30, 31-60, 61-90, trên 90 ngày.", gate: "reports" },
      { href: "/reports/ap-aging", title: "Tuổi nợ phải trả", desc: "Còn nợ sale, thuế, BHXH bao lâu.", gate: "owner" },
      { href: "/reports/obligations", title: "Nghĩa vụ tài chính", desc: "Còn thu từ CĐT, còn nợ sale, nợ thuế tại thời điểm.", gate: "reports" },
      { href: "/reports/expenses", title: "Phân tích chi phí", desc: "Chi phí theo nhóm và tháng, phát hiện chi đột biến.", gate: "reports" },
    ],
  },
  {
    key: "by",
    title: "Theo đối tượng",
    icon: "🔎",
    color: "bg-slate-50 border-slate-200",
    reports: [
      { href: "/reports/projects", title: "Theo dự án", desc: "Tổng hợp từng dự án.", gate: "reports" },
      { href: "/reports/partners", title: "Theo đối tác", desc: "Tổng hợp từng CĐT, đối tác.", gate: "reports" },
    ],
  },
];

export default async function ReportsIndexPage({ searchParams }: { searchParams: SearchParams }) {
  const canSeeReports = await hasReportsAccess();
  const canSeeSegments = await hasSegmentsAccess();
  const isOwner = (await getOwnerEmail()) !== null;

  const canSee = (gate?: string): boolean => {
    if (!gate) return true;
    if (gate === "owner") return isOwner;
    if (gate === "reports") return canSeeReports;
    if (gate === "segments") return canSeeSegments;
    return false;
  };

  // Filter reports theo quyền, drop section rỗng
  const sectionsForUser = SECTIONS.map((s) => ({
    ...s,
    reports: s.reports.filter((r) => canSee(r.gate)),
  })).filter((s) => s.reports.length > 0);

  if (sectionsForUser.length === 0) redirect("/");

  // Nếu user chỉ có 1 sub-page (segments-only) → redirect thẳng
  const totalReports = sectionsForUser.reduce((s, x) => s + x.reports.length, 0);
  if (totalReports === 1) {
    const sp = await searchParams;
    const qs = new URLSearchParams();
    if (sp.year) qs.set("year", sp.year);
    if (sp.range) qs.set("range", sp.range);
    const first = sectionsForUser[0].reports[0].href;
    redirect(qs.toString() ? `${first}?${qs.toString()}` : first);
  }

  // Chuyển filter param sang link
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.year) qs.set("year", sp.year);
  if (sp.range) qs.set("range", sp.range);
  const qsStr = qs.toString();
  const withQs = (href: string) => (qsStr ? `${href}?${qsStr}` : href);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chọn báo cáo theo chủ đề bên dưới. Filter năm + khoảng thời gian dùng chung khi chuyển giữa các trang.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sectionsForUser.map((s) => (
          <div key={s.key} className={`rounded-xl border ${s.color} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{s.icon}</span>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <span className="text-xs text-slate-500 ml-1">
                {s.reports.length} báo cáo
              </span>
            </div>
            <div className="space-y-2">
              {s.reports.map((r) => (
                <Link
                  key={r.href}
                  href={withQs(r.href)}
                  className="block bg-card rounded-lg ring-1 ring-foreground/10 p-3 hover:border-slate-400 transition-colors"
                >
                  <div className="flex items-baseline gap-2">
                    <div className="font-medium text-sm">{r.title}</div>
                    {r.gate === "owner" && (
                      <span className="text-[10px] text-amber-600">chỉ chủ</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{r.desc}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
