import Link from "next/link";

export const dynamic = "force-static";
export const metadata = { title: "Hướng dẫn nhập dự án — BRE" };

export default function NhapDuAnPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <div className="text-xs"><Link href="/help" className="text-blue-600 hover:underline">← Trợ giúp</Link></div>
        <h1 className="text-2xl font-bold mt-1">Hướng dẫn nhập Dự án</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dành cho Admin / TPKD. Nhập dự án khi ký hợp đồng phân phối dự án mới.
        </p>
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-semibold text-blue-900 mb-2">🏗️ Dự án là gì?</h2>
        <p className="text-sm text-slate-700">
          Dự án = 1 khu BĐS cụ thể (VD "TT AVIO", "Fiato Uptown"). Thuộc <b>1 CĐT</b>, chứa <b>nhiều căn</b>.
          Nhập dự án TRƯỚC khi nhập căn hoặc mở bán.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">📝 Ô nhập chính</h2>
        <div className="bg-card rounded-lg ring-1 ring-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white text-xs">
              <tr>
                <th className="text-left p-2">Ô</th>
                <th className="text-left p-2">Ý nghĩa</th>
                <th className="text-left p-2">Ví dụ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Tên dự án</td><td className="p-2">Tên marketing của CĐT (đúng chính tả, có thể có dấu)</td><td className="p-2 text-slate-500">TT AVIO</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Mã dự án</td><td className="p-2">Viết tắt 3-5 ký tự (dùng để mã căn). VD AVIO, FIUP, BCGE</td><td className="p-2 text-slate-500">AVIO</td></tr>
              <tr className="border-t bg-blue-50"><td className="p-2 font-mono text-xs">Chủ đầu tư (partner)</td><td className="p-2">Chọn từ danh sách CĐT. QUAN TRỌNG — mọi doanh thu/HH sẽ link về CĐT này</td><td className="p-2 text-slate-500">BamLand</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Địa chỉ</td><td className="p-2">Địa chỉ đầy đủ (đường, phường, quận, tỉnh)</td><td className="p-2 text-slate-500">Nguyễn Xí, Bình Hòa, Dĩ An, Bình Dương</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Ghi chú</td><td className="p-2">Note đặc biệt về dự án (tiện ích, thời gian giao nhà, thu hồi vốn...)</td><td className="p-2 text-slate-500">3 tòa, 1200 căn, bàn giao 2027</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
        <h2 className="font-semibold text-amber-900 mb-2">⚠️ Case đặc biệt: Dự án có nhiều đợt / phân kỳ</h2>
        <p className="text-sm text-slate-700 mb-3">
          Nếu 1 dự án có 2 đợt bán với mức phí HH khác nhau (VD TT AVIO đợt 1 partner Dataloca 2025, đợt 2 partner Dataloca 2026):
        </p>
        <div className="bg-white rounded p-3 text-sm space-y-2">
          <div className="font-semibold text-slate-800">Cách 1 — Tạo 2 dự án riêng (KHUYẾN NGHỊ):</div>
          <ul className="space-y-1 pl-4 list-disc text-slate-700">
            <li>Dự án 1: "TT AVIO — Phase 2025" (partner Dataloca 2025)</li>
            <li>Dự án 2: "TT AVIO — Phase 2026" (partner Dataloca 2026)</li>
            <li>Căn thuộc đợt nào → chọn dự án tương ứng</li>
            <li>Ưu điểm: rõ ràng, báo cáo per project chính xác</li>
          </ul>
        </div>
        <div className="bg-white rounded p-3 text-sm space-y-2 mt-2">
          <div className="font-semibold text-slate-800">Cách 2 — 1 dự án, chọn partner chính:</div>
          <ul className="space-y-1 pl-4 list-disc text-slate-700">
            <li>Dự án "TT AVIO" gắn partner chính (VD Dataloca 2025)</li>
            <li>Nhược điểm: căn đợt 2 sẽ có partner sai trong báo cáo</li>
            <li>Chỉ dùng khi chưa rõ có phân kỳ hay không</li>
          </ul>
        </div>
      </section>

      <section className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 className="font-semibold text-red-900 mb-2">❌ Sai lầm hay gặp</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li><b>Chọn nhầm CĐT:</b> Dự án link nhầm CĐT → mọi báo cáo doanh thu/HH bị lệch. Kiểm tra kỹ trước khi save.</li>
          <li><b>Trùng tên dự án:</b> Hai dự án khác nhau trùng tên → khó phân biệt. Nếu cần tách phase → thêm hậu tố "— Phase X".</li>
          <li><b>Xóa dự án đang có căn:</b> ĐỪNG xóa — sẽ mất link. Nếu dự án ngưng phân phối, note trong ghi chú thay vì xóa.</li>
          <li><b>Đổi CĐT của dự án đã có căn:</b> RẤT NGUY HIỂM — mọi hóa đơn/thanh toán trước sẽ đổi CĐT theo. Chỉ đổi khi chắc chắn (VD CĐT đổi pháp nhân).</li>
        </ul>
      </section>

      <div className="text-xs text-slate-500 italic">
        Sau khi có dự án → <Link href="/help/nhap-can" className="underline">Nhập căn</Link> thuộc dự án.
      </div>
    </div>
  );
}
