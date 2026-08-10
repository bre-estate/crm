import Link from "next/link";

export const dynamic = "force-static";
export const metadata = { title: "Trợ giúp — BRE CRM" };

const GUIDES = [
  {
    section: "Nhập liệu nghiệp vụ",
    color: "bg-blue-50 border-blue-200",
    items: [
      { href: "/help/nhap-doanh-thu", title: "📥 Nhập doanh thu", desc: "Đối chiếu doanh thu với CĐT — mỗi đợt khách trả tiền" },
      { href: "/help/nhap-doi-chieu-gia-von", title: "💸 Nhập đối chiếu giá vốn", desc: "HH sale, KPI, thưởng nóng — theo tiến độ CĐT chi" },
      { href: "/help/nhap-can", title: "🏢 Nhập căn (products)", desc: "Danh sách căn mở bán — link với dự án + CĐT" },
      { href: "/help/nhap-doi-tac", title: "🤝 Nhập chủ đầu tư (CĐT)", desc: "Thông tin CĐT + case đặc biệt: 1 công ty nhiều pháp nhân" },
      { href: "/help/nhap-du-an", title: "🏗️ Nhập dự án", desc: "Dự án phân phối — link với CĐT + kho căn" },
    ],
  },
  {
    section: "Tài liệu tham khảo",
    color: "bg-slate-50 border-slate-200",
    items: [
      { href: "/help/accounting-basics", title: "📚 Kế toán căn bản (TT200)", desc: "Danh mục tài khoản chuẩn TT200 kèm giải thích context BRE" },
    ],
  },
];

export default function HelpIndexPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">Trợ giúp — Hướng dẫn nhập liệu</h1>
        <p className="text-sm text-slate-500 mt-1">
          Hướng dẫn chi tiết cho admin, kế toán và sale khi nhập dữ liệu vào CRM BRE.
          Bám sát format BCDT (Kế toán) + chuẩn TT200.
        </p>
      </div>

      {GUIDES.map((g) => (
        <section key={g.section}>
          <h2 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">{g.section}</h2>
          <div className={`rounded-xl border-2 p-3 ${g.color} space-y-2`}>
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block bg-white rounded-lg ring-1 ring-slate-200 p-3 hover:ring-slate-400 hover:shadow-sm transition"
              >
                <div className="font-semibold text-slate-800">{it.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{it.desc}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
