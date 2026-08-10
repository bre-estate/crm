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
    key: "core",
    title: "5 báo cáo quản trị chính",
    icon: "⭐",
    color: "bg-orange-50 border-orange-300",
    reports: [
      {
        href: "/reports/profit-detail",
        title: "1. Lãi/lỗ quản trị (Management P&L)",
        desc: "DT − Giá vốn − OPEX. Chuẩn dòng tiền (cash basis) từ sao kê bank. Khớp format báo cáo kế toán.",
        gate: "reports",
      },
      {
        href: "/reports/cash-flow",
        title: "2. Dòng tiền (Cash flow)",
        desc: "Số dư + runway + vào/ra bank per tháng + phân loại. Từ sao kê Techcombank.",
        gate: "owner",
      },
      {
        href: "/reports/ar-aging",
        title: "3. Tuổi nợ phải thu (A/R aging)",
        desc: "CĐT nào còn nợ mình bao lâu. Bucket 0-30 / 31-60 / 61-90 / >90 ngày.",
        gate: "reports",
      },
      {
        href: "/reports/ap-aging",
        title: "4. Tuổi nợ phải trả (A/P aging)",
        desc: "Mình còn nợ sale team + thuế + BHXH bao lâu. Ưu tiên trả >90 trước.",
        gate: "owner",
      },
      {
        href: "/reports/balance-sheet",
        title: "5. Bảng cân đối quản trị",
        desc: "Tài sản = Nợ + Vốn tại thời điểm. Nguồn sổ NKC.",
        gate: "reports",
      },
    ],
  },
  {
    key: "operational",
    title: "Vận hành (Phase 2)",
    icon: "🎯",
    color: "bg-emerald-50 border-emerald-200",
    reports: [
      {
        href: "/reports/sales",
        title: "Báo cáo bán hàng",
        desc: "DT ghi nhận per dự án / CĐT / NV / phòng. Toggle tháng/quý/năm.",
        gate: "reports",
      },
      {
        href: "/reports/commissions",
        title: "Báo cáo hoa hồng",
        desc: "HH per NV theo BCDT — đã ghi nhận / đã trả / còn nợ.",
        gate: "reports",
      },
      {
        href: "/reports/project-profitability",
        title: "Lãi/lỗ theo dự án",
        desc: "DT − Giá vốn per dự án. Biên gộp % giúp so sánh dự án nào lời/lỗ.",
        gate: "reports",
      },
      {
        href: "/reports/expenses",
        title: "Phân tích chi phí",
        desc: "Chi phí bucket × tháng (heatmap). Phát hiện chi đột biến.",
        gate: "reports",
      },
    ],
  },
  {
    key: "market",
    title: "Chi tiết cũ",
    icon: "📊",
    color: "bg-slate-50 border-slate-200",
    reports: [
      {
        href: "/reports/segments",
        title: "Phân khúc căn",
        desc: "Số phòng ngủ + tầm giá + diện tích",
        gate: "segments",
      },
      {
        href: "/reports/unit-profitability",
        title: "Lãi từng căn",
        desc: "P&L per unit",
        gate: "reports",
      },
    ],
  },
  {
    key: "internal",
    title: "Chi tiết nội bộ",
    icon: "👥",
    color: "bg-indigo-50 border-indigo-200",
    reports: [
      {
        href: "/reports/people",
        title: "Theo nhân sự",
        desc: "Theo phòng + KPI cá nhân NVKD (căn, DT, HH, thưởng, alias)",
        gate: "reports",
      },
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
