import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hướng dẫn — BRE" };

const GUIDES = [
  { href: "/help/nhap-doi-tac", icon: "🤝", title: "Nhập đối tác", desc: "Tạo CĐT, F1, đối tác liên kết và hợp đồng phí môi giới." },
  { href: "/help/nhap-du-an", icon: "🏗️", title: "Nhập dự án", desc: "Tạo dự án, biểu phí môi giới theo mốc, phí hành chính." },
  { href: "/help/nhap-can", icon: "🏢", title: "Nhập căn", desc: "Nhập căn khi CĐT mở bán hoặc sale chốt căn mới." },
  { href: "/help/nhap-doanh-thu", icon: "📥", title: "Nhập doanh thu", desc: "Đối chiếu doanh thu từng đợt với CĐT và ghi thu tiền." },
  { href: "/help/nhap-doi-chieu-gia-von", icon: "💸", title: "Nhập giá vốn", desc: "Đối chiếu hoa hồng, KPI, hỗ trợ khách và ghi chi tiền." },
  { href: "/help/accounting-basics", icon: "📚", title: "Kế toán căn bản", desc: "Dồn tích và dòng tiền, giá vốn, trích trước, các tài khoản hay gặp." },
];

export default function HelpIndexPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">Hướng dẫn</h1>
        <p className="text-sm text-slate-500 mt-1">Quy trình nhập liệu theo thứ tự: đối tác, dự án, căn, doanh thu, giá vốn.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {GUIDES.map((g) => (
          <Link key={g.href} href={g.href} className="block rounded-xl ring-1 ring-foreground/10 bg-card p-4 hover:ring-orange-400 transition-colors">
            <div className="text-2xl">{g.icon}</div>
            <div className="font-semibold mt-2">{g.title}</div>
            <div className="text-sm text-slate-500 mt-1">{g.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
