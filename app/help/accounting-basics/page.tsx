import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Kế toán căn bản (TT200) — BRE" };

type TK = { code: string; name: string; bre: string };

const groups: { title: string; subtitle: string; balance: "Nợ" | "Có"; tks: TK[] }[] = [
  {
    title: "💰 TÀI SẢN",
    subtitle: "Loại 1-2 · Số dư bên Nợ",
    balance: "Nợ",
    tks: [
      { code: "1111", name: "Tiền mặt VND", bre: "Tiền két công ty" },
      { code: "11211", name: "TGNH — MB Bank", bre: "Tiền tài khoản ngân hàng" },
      { code: "131", name: "Phải thu khách hàng", bre: "CĐT còn nợ mình HH sale" },
      { code: "141", name: "Tạm ứng", bre: "Sale ứng trước lương/HH" },
      { code: "242", name: "Chi phí trả trước", bre: "TSCĐ chờ phân bổ (bàn ghế, máy)" },
      { code: "244", name: "Cầm cố, ký quỹ", bre: "Cọc thuê VP" },
    ],
  },
  {
    title: "💳 NỢ PHẢI TRẢ",
    subtitle: "Loại 3 · Số dư bên Có",
    balance: "Có",
    tks: [
      { code: "331", name: "Phải trả người bán", bre: "NCC (thuê VP...) chưa trả" },
      { code: "3341", name: "Phải trả người lao động", bre: "Lương NLĐ chưa trả" },
      { code: "3383", name: "BHXH phải nộp", bre: "Bảo hiểm xã hội tồn" },
      { code: "3384", name: "BHYT phải nộp", bre: "Bảo hiểm y tế tồn" },
      { code: "3386", name: "BHTN phải nộp", bre: "Bảo hiểm thất nghiệp tồn" },
      { code: "33311", name: "Thuế GTGT phải nộp", bre: "VAT đầu ra" },
      { code: "3334", name: "Thuế TNDN phải nộp", bre: "Thuế thu nhập doanh nghiệp" },
      { code: "3335", name: "Thuế TNCN phải nộp", bre: "TNCN thu hộ NLĐ/sale" },
      { code: "3388", name: "Phải trả khác", bre: "YCTV thu hộ / chi hộ (cọc khách)" },
      { code: "3411", name: "Vay chủ / Hoàn booking", bre: "Hoàn cọc cho khách" },
    ],
  },
  {
    title: "🏦 VỐN CHỦ SỞ HỮU",
    subtitle: "Loại 4 · Số dư bên Có",
    balance: "Có",
    tks: [
      { code: "411", name: "Vốn góp CSH", bre: "Vốn góp Triết + Bách" },
      { code: "4211", name: "Lãi/lỗ năm trước", bre: "Kết chuyển đầu kỳ" },
      { code: "4212", name: "Lãi/lỗ năm nay", bre: "KQKD kỳ này" },
    ],
  },
  {
    title: "💵 DOANH THU",
    subtitle: "Loại 5 · Số dư bên Có",
    balance: "Có",
    tks: [
      { code: "5113", name: "Doanh thu môi giới", bre: "Chính — HH nhận từ CĐT (excl VAT)" },
      { code: "515", name: "Doanh thu tài chính", bre: "Lãi bank (nhỏ)" },
    ],
  },
  {
    title: "💸 CHI PHÍ",
    subtitle: "Loại 6, 8 · Số dư bên Nợ",
    balance: "Nợ",
    tks: [
      { code: "6411", name: "Lương NVKD", bre: "Lương cố định hàng tháng của sale" },
      { code: "6417", name: "HH sale + Marketing + Thưởng", bre: "Biến động theo deal (chính!)" },
      { code: "6421", name: "Lương admin + kế toán", bre: "Lương back-office" },
      { code: "6423", name: "Đồ dùng VP", bre: "Máy in, bàn ghế, văn phòng phẩm..." },
      { code: "6425", name: "Thuế môn bài", bre: "2M/năm" },
      { code: "6427", name: "Thuê VP + tiện ích + dịch vụ", bre: "Thuê nhà + điện nước + internet" },
      { code: "811", name: "Chi phí khác không hóa đơn", bre: "Chi Triết trả tay (không có hóa đơn hợp lệ)" },
      { code: "821", name: "Chi phí thuế TNDN", bre: "Thuế cty trong kỳ" },
    ],
  },
  {
    title: "🎯 KẾT CHUYỂN CUỐI KỲ",
    subtitle: "Loại 9",
    balance: "Nợ",
    tks: [
      { code: "911", name: "Xác định KQKD", bre: "Kim ghi cuối kỳ để tính lãi/lỗ" },
    ],
  },
];

const examples = [
  {
    title: "Cty trả HH sale 100M cho Bách qua bank",
    entry: "Nợ 6417 (chi phí tăng) / Có 11211 (bank giảm) · 100M",
    color: "orange",
  },
  {
    title: "Khách gửi cọc 200M cho cty giữ giùm CĐT",
    entry: "Nợ 11211 (bank tăng) / Có 3388 (nghĩa vụ phải trả tăng) · 200M",
    color: "blue",
  },
  {
    title: "Cuối tháng Kim ghi lương phát sinh cho Tường Vi (chưa trả)",
    entry: "Nợ 6421 (chi phí) / Có 3341 (nợ NLĐ) · 6M",
    color: "amber",
  },
  {
    title: "Khi cty thực trả lương cho Tường Vi qua bank",
    entry: "Nợ 3341 (giảm nợ NLĐ) / Có 11211 (bank giảm) · 6M",
    color: "green",
  },
  {
    title: "CĐT trả HH 500M vào bank cty (đã có hóa đơn xuất trước đó)",
    entry: "Nợ 11211 (bank tăng) / Có 131 (giảm phải thu) · 500M",
    color: "green",
  },
];

export default function AccountingBasicsPage() {
  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <div className="text-xs">
          <Link href="/" className="text-blue-600 hover:underline">← Trang chủ</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">📚 Kế toán căn bản (TT200)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chart of Accounts BRE dùng thực — 25 TK Kim ghi hằng tháng. In ra để trước mặt khi nói chuyện với kế toán.
        </p>
      </div>

      <Card className="bg-blue-50 ring-blue-200 px-4">
        <div className="text-sm font-semibold text-blue-900 mb-2">Nguyên tắc double-entry cần nhớ:</div>
        <ul className="text-sm text-blue-900 space-y-1 list-disc list-inside">
          <li>Mọi giao dịch có <b>Nợ = Có</b> (2 vế phải cân)</li>
          <li><b>Nợ</b> (Debit): tăng Tài sản/Chi phí · giảm Nợ phải trả/Vốn CSH/Doanh thu</li>
          <li><b>Có</b> (Credit): tăng Nợ phải trả/Vốn CSH/Doanh thu · giảm Tài sản/Chi phí</li>
        </ul>
      </Card>

      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-2">
            <div className="text-sm font-bold">{g.title}</div>
            <div className="text-xs text-slate-500">{g.subtitle}</div>
          </div>
          <Card className="p-0 gap-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left p-2 w-24">TK</th>
                  <th className="text-left p-2 w-64">Tên chuẩn</th>
                  <th className="text-left p-2">Ý nghĩa BRE</th>
                </tr>
              </thead>
              <tbody>
                {g.tks.map((tk) => (
                  <tr key={tk.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2 font-mono font-semibold">{tk.code}</td>
                    <td className="p-2">{tk.name}</td>
                    <td className="p-2 text-slate-600 text-xs">{tk.bre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}

      <div>
        <div className="text-sm font-bold mb-2">📖 Ví dụ giao dịch thực tế BRE</div>
        <div className="space-y-2">
          {examples.map((ex, i) => {
            const cls = {
              orange: "ring-orange-300 bg-orange-50",
              blue: "ring-blue-300 bg-blue-50",
              amber: "ring-amber-300 bg-amber-50",
              green: "ring-green-300 bg-green-50",
            }[ex.color];
            return (
              <Card key={i} className={cn("px-4", cls)}>
                <div className="text-sm font-medium">{ex.title}</div>
                <div className="text-xs font-mono text-slate-700 mt-1">{ex.entry}</div>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="bg-slate-50 px-4">
        <div className="text-xs text-slate-600">
          <b>Tips học nhanh:</b> Không cần thuộc hết ngay. Khi Kim nói "TK X",
          tra bảng trên. Sau 5-10 lần dùng sẽ tự thuộc những TK BRE dùng nhiều
          nhất (5113, 6417, 6411, 6421, 6427, 3341, 11211).
        </div>
      </Card>
    </div>
  );
}
