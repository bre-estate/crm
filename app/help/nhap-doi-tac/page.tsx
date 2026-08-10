import Link from "next/link";

export const dynamic = "force-static";
export const metadata = { title: "Hướng dẫn nhập chủ đầu tư — BRE" };

export default function NhapDoiTacPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <div className="text-xs"><Link href="/help" className="text-blue-600 hover:underline">← Trợ giúp</Link></div>
        <h1 className="text-2xl font-bold mt-1">Hướng dẫn nhập Chủ đầu tư (CĐT)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dành cho Admin. Nhập CĐT khi ký hợp đồng đại lý mới hoặc mở bán dự án của CĐT mới.
        </p>
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-semibold text-blue-900 mb-2">🤝 CĐT là gì?</h2>
        <p className="text-sm text-slate-700">
          CĐT (Chủ đầu tư) = công ty sở hữu dự án BĐS. BRE là sàn phân phối cho CĐT theo hợp đồng đại lý.
          <br />
          1 CĐT có thể có nhiều dự án. 1 dự án chỉ có 1 CĐT.
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
              <tr className="border-t"><td className="p-2 font-mono text-xs">Tên</td><td className="p-2">Tên pháp lý (giấy phép KD). Có thể kèm hậu tố phân biệt pháp nhân</td><td className="p-2 text-slate-500">CTY CP BAM LAND</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Địa chỉ / MST / SĐT</td><td className="p-2">Copy từ giấy phép KD hoặc HĐ đại lý</td><td className="p-2 text-slate-500">—</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Người liên hệ</td><td className="p-2">Cán bộ phụ trách BRE bên CĐT (thường là AM)</td><td className="p-2 text-slate-500">Trần Thị B</td></tr>
              <tr className="border-t"><td className="p-2 font-mono text-xs">Ghi chú</td><td className="p-2">Note đặc biệt (chính sách HH, chậm trả, dễ chốt HĐ...)</td><td className="p-2 text-slate-500">Trả HH đúng hạn, có event thưởng nóng</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
        <h2 className="font-semibold text-amber-900 mb-2">⚠️ Case đặc biệt: 1 công ty có nhiều pháp nhân</h2>
        <p className="text-sm text-slate-700 mb-3">
          VD: <b>Dataloca 2025</b> và <b>Dataloca 2026</b> — cùng 1 công ty Dataloca, nhưng khác mức phí (chính sách 2025 vs 2026).
          BamLand cũng có thể có nhiều pháp nhân tương tự.
        </p>
        <div className="bg-white rounded p-3 text-sm space-y-2">
          <div className="font-semibold text-slate-800">Quy tắc:</div>
          <ul className="space-y-1 pl-4 list-disc text-slate-700">
            <li><b>Tạo 2 record CĐT riêng</b> với tên rõ ràng: "Dataloca 2025", "Dataloca 2026"</li>
            <li>Trong ghi chú, note: "Cùng công ty với Dataloca 2026 (partner_id=64)" — để admin sau này biết</li>
            <li><b>Hóa đơn có thể chung cho cả 2 pháp nhân</b> → hệ thống tự set partner_id = NULL khi merge, page detail sẽ group recon theo pháp nhân</li>
            <li>Mỗi dự án chọn <b>đúng pháp nhân đang phân phối</b> (VD TT AVIO đợt 1 → Dataloca 2025, TT AVIO đợt 2 → Dataloca 2026)</li>
          </ul>
        </div>
        <div className="mt-3 text-xs text-slate-500 italic">
          Nếu Kim clarify sau này 2 pháp nhân đó là 1 → có thể merge sau bằng script chuyên dụng (không tự làm).
        </div>
      </section>

      <section className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 className="font-semibold text-red-900 mb-2">❌ Sai lầm hay gặp</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li><b>Tạo trùng CĐT khác tên viết tắt:</b> VD tạo "BAMLAND" và "Bam Land" thành 2 records. Trước khi tạo mới, search kỹ danh sách hiện có.</li>
          <li><b>Không phân biệt pháp nhân:</b> Dataloca 2025 ≠ Dataloca 2026 (mức phí khác). Phải tạo 2 records riêng.</li>
          <li><b>Không note quan hệ:</b> Khi có nhiều pháp nhân cùng công ty → PHẢI note trong ghi chú để admin sau hiểu.</li>
          <li><b>Xóa CĐT khi hết hợp đồng:</b> ĐỪNG xóa — CĐT còn liên kết với dự án/hóa đơn cũ. Đánh dấu "ngừng hợp tác" trong ghi chú thay vì xóa.</li>
        </ul>
      </section>

      <div className="text-xs text-slate-500 italic">
        Sau khi có CĐT → <Link href="/help/nhap-du-an" className="underline">Nhập dự án</Link> thuộc CĐT đó.
      </div>
    </div>
  );
}
