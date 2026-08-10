import Link from "next/link";

export const dynamic = "force-static";
export const metadata = { title: "Hướng dẫn nhập đối tác — BRE" };

export default function NhapDoiTacPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <div className="text-xs"><Link href="/" className="text-blue-600 hover:underline">← Trang chủ</Link></div>
        <h1 className="text-2xl font-bold mt-1">Hướng dẫn nhập Đối tác</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dành cho Admin. Nhập đối tác khi ký hợp đồng phân phối mới.
        </p>
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-semibold text-blue-900 mb-2">🤝 Đối tác gồm loại nào?</h2>
        <ul className="text-sm text-slate-700 space-y-1 pl-4 list-disc">
          <li><b>Chủ đầu tư (CĐT)</b>: công ty sở hữu dự án BĐS, BRE phân phối trực tiếp</li>
          <li><b>Sàn F1</b>: sàn trung gian đứng trên BRE, BRE làm F2 bán qua F1</li>
          <li><b>Sàn đối tác khác</b>: liên kết chia sẻ deal</li>
        </ul>
        <p className="text-xs text-slate-600 mt-2">1 đối tác có thể có nhiều dự án. 1 dự án chỉ có 1 đối tác chính.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">📝 Ô nhập chính</h2>
        <div className="bg-card rounded-lg ring-1 ring-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2">Ô</th>
                <th className="text-left p-2">Ý nghĩa</th>
                <th className="text-left p-2">Ví dụ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Tên</td><td className="p-2">Tên pháp lý theo giấy phép KD, có thể kèm hậu tố phân biệt hợp đồng</td><td className="p-2 text-slate-500">CTY CP BAM LAND</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Loại</td><td className="p-2">CĐT / Sàn F1 / Sàn khác</td><td className="p-2 text-slate-500">CĐT</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Địa chỉ / MST / SĐT</td><td className="p-2">Copy từ giấy phép KD hoặc HĐ đại lý</td><td className="p-2 text-slate-500">—</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Người liên hệ</td><td className="p-2">Cán bộ đại diện phía đối tác phụ trách BRE</td><td className="p-2 text-slate-500">Trần Thị B</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Ghi chú</td><td className="p-2">Note đặc biệt (chính sách hoa hồng, chậm trả, sự kiện thưởng nóng...)</td><td className="p-2 text-slate-500">Trả hoa hồng đúng hạn</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
        <h2 className="font-semibold text-amber-900 mb-2">⚠️ Case đặc biệt: 1 đối tác nhiều hợp đồng theo thời điểm</h2>
        <p className="text-sm text-slate-700 mb-3">
          1 công ty có thể ký nhiều hợp đồng khác nhau qua các thời điểm để điều chỉnh chính sách hoa hồng.
          VD "Dataloca 2025" và "Dataloca 2026" là cùng công ty Dataloca, khác giai đoạn hợp đồng và mức phí.
        </p>
        <div className="bg-white rounded p-3 text-sm space-y-2">
          <div className="font-semibold text-slate-800">Quy tắc:</div>
          <ul className="space-y-1 pl-4 list-disc text-slate-700">
            <li>Tạo record đối tác riêng cho mỗi giai đoạn hợp đồng — tên rõ ràng kèm năm/kỳ (VD "Dataloca 2025", "Dataloca 2026")</li>
            <li>Ghi chú: link record cùng công ty để admin sau biết</li>
            <li>Hóa đơn có thể xuất chung cho nhiều giai đoạn — hệ thống set CĐT = trống cho hóa đơn đa giai đoạn, page detail tự group đợt đối chiếu theo giai đoạn</li>
            <li>Mỗi dự án chọn đúng giai đoạn hợp đồng đang phân phối</li>
          </ul>
        </div>
      </section>

      <section className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 className="font-semibold text-red-900 mb-2">❌ Sai lầm hay gặp</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li><b>Tạo trùng đối tác khác tên viết tắt:</b> VD "BAMLAND" và "Bam Land" thành 2 records. Trước khi tạo mới, search kỹ danh sách hiện có.</li>
          <li><b>Không phân biệt giai đoạn hợp đồng:</b> Nếu cùng công ty ký 2 hợp đồng khác mức phí → tạo 2 records riêng, đừng gộp.</li>
          <li><b>Không note quan hệ:</b> Khi có nhiều record cùng công ty → note trong ghi chú để admin sau hiểu.</li>
        </ul>
      </section>

      <div className="text-xs text-slate-500 italic">
        Sau khi có đối tác → <Link href="/help/nhap-du-an" className="underline">Nhập dự án</Link> thuộc đối tác đó.
      </div>
    </div>
  );
}
