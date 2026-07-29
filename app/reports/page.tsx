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
    key: "overview",
    title: "Tổng quan",
    icon: "📊",
    color: "bg-blue-50 border-blue-200",
    reports: [
      {
        href: "/reports/overview",
        title: "Tổng hợp",
        desc: "8 KPI cards + Lãi thuần / ROI / Payback (owner)",
        gate: "reports",
      },
    ],
  },
  {
    key: "market",
    title: "Thị trường",
    icon: "🎯",
    color: "bg-emerald-50 border-emerald-200",
    reports: [
      {
        href: "/reports/segments",
        title: "Phân khúc",
        desc: "Số phòng ngủ + tầm giá + diện tích, bảng chéo số phòng × dự án",
        gate: "segments",
      },
      {
        href: "/reports/projects",
        title: "Theo dự án",
        desc: "Bảng chi tiết + tốc độ hấp thụ + biên LN so sánh",
        gate: "reports",
      },
      {
        href: "/reports/partners",
        title: "Đối tác",
        desc: "Xếp hạng CĐT/F1: %PMG_LK, %PMG_sale, chênh, biên LN, TB ngày trả",
        gate: "reports",
      },
    ],
  },
  {
    key: "internal",
    title: "Nội bộ",
    icon: "👥",
    color: "bg-indigo-50 border-indigo-200",
    reports: [
      {
        href: "/reports/people",
        title: "Theo nhân sự",
        desc: "Theo phòng + KPI cá nhân NVKD (căn, DT, HH, thưởng, alias)",
        gate: "reports",
      },
      {
        href: "/reports/time",
        title: "Theo thời gian",
        desc: "Ghi nhận doanh thu theo tháng + mùa vụ nhiều năm",
        gate: "reports",
      },
    ],
  },
  {
    key: "finance",
    title: "Tài chính",
    icon: "💰",
    color: "bg-amber-50 border-amber-200",
    reports: [
      {
        href: "/reports/cashflow",
        title: "Dòng tiền",
        desc: "Tuổi nợ theo đối tác + tốc độ CĐT trả + dự báo + rủi ro tập trung",
        gate: "owner",
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
                  className="block bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-400 transition-colors"
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
