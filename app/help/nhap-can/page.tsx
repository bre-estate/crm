import Link from "next/link";

export const dynamic = "force-static";
export const metadata = { title: "Hướng dẫn nhập căn — BRE" };

export default function NhapCanPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <div className="text-xs"><Link href="/" className="text-blue-600 hover:underline">← Trang chủ</Link></div>
        <h1 className="text-2xl font-bold mt-1">Hướng dẫn nhập Căn (Products)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dành cho Admin. Nhập căn khi CĐT mở bán dự án mới hoặc khi sale bán căn mới.
        </p>
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-semibold text-blue-900 mb-2">🏢 Căn là gì?</h2>
        <p className="text-sm text-slate-700">
          1 căn = 1 dòng trong bảng <b>products</b>. Căn thuộc <b>1 dự án</b>, dự án thuộc <b>1 CĐT</b>.
          Nhập căn TRƯỚC khi tạo đối chiếu doanh thu / giá vốn.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">📝 Ô nhập chính</h2>
        <div className="bg-card rounded-lg ring-1 ring-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white text-xs">
              <tr>
                <th className="text-left p-2 w-40">Ô</th>
                <th className="text-left p-2">Ý nghĩa</th>
                <th className="text-left p-2 w-56">Ví dụ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t bg-blue-50">
                <td className="p-2 font-mono text-xs">Mã căn (product_code)</td>
                <td className="p-2">Định danh duy nhất. Format: <code>DUAN_CDT_MACAN</code></td>
                <td className="p-2 text-slate-500">AVIO_BAML_B.28.18</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Số căn (unit_code)</td>
                <td className="p-2">Số căn theo CĐT ghi (thường có tòa.tầng.stt)</td>
                <td className="p-2 text-slate-500">B.28.18</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Dự án</td>
                <td className="p-2">Chọn từ danh sách dự án đã có. Nếu chưa có → tạo dự án trước</td>
                <td className="p-2 text-slate-500">TT AVIO</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Loại căn</td>
                <td className="p-2">Căn hộ / Duplex / Penthouse / Shophouse / TMDV / Officetel</td>
                <td className="p-2 text-slate-500">Căn hộ</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Số phòng ngủ</td>
                <td className="p-2">0 = Studio, 1/2/3... = 1PN/2PN/3PN</td>
                <td className="p-2 text-slate-500">2</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">DT thông thủy / tim tường</td>
                <td className="p-2">Thông thủy = tính hợp pháp (nhỏ). Tim tường = marketing (lớn)</td>
                <td className="p-2 text-slate-500">68,5 / 75,2 m²</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Giá bán (sell_price)</td>
                <td className="p-2">Giá bán thực cho khách (đã trừ chiết khấu). Đơn vị VND</td>
                <td className="p-2 text-slate-500">3.480.000.000</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Giá gốc CĐT (pmg_base_price)</td>
                <td className="p-2">Giá CĐT niêm yết dùng để tính HH. Có thể khác giá bán</td>
                <td className="p-2 text-slate-500">3.600.000.000</td>
              </tr>
              <tr className="border-t bg-amber-50">
                <td className="p-2 font-mono text-xs">%PMG_LK_sale</td>
                <td className="p-2"><b>Mức tối đa HH sale</b> theo hợp đồng đại lý với CĐT. Ràng buộc mọi đợt đối chiếu</td>
                <td className="p-2 text-slate-500">5,25% (7% tối đa)</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">NVKD (sales_person)</td>
                <td className="p-2">Tên NV chốt căn. Chọn từ list employees</td>
                <td className="p-2 text-slate-500">Tên NV</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">TPKD (dept_leader_name)</td>
                <td className="p-2">Trưởng phòng KD dẫn dắt</td>
                <td className="p-2 text-slate-500">Tên TPKD</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Phòng (dept_name)</td>
                <td className="p-2">BLĐ / Hồ Gia (tên phòng)</td>
                <td className="p-2 text-slate-500">Hồ Gia</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Loại sale</td>
                <td className="p-2">Sơ cấp (từ CĐT) / Thứ cấp (mua lại F2)</td>
                <td className="p-2 text-slate-500">Sơ cấp</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Ngày đặt cọc</td>
                <td className="p-2">Ngày khách đặt cọc chốt căn</td>
                <td className="p-2 text-slate-500">05/08/2026</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Tháng ghi nhận DT</td>
                <td className="p-2">Format YYYY-MM. Dùng để filter báo cáo per tháng</td>
                <td className="p-2 text-slate-500">2026-08</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h2 className="font-semibold text-amber-900 mb-2">🎯 Quy ước mã căn</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li><b>Format:</b> <code>DUAN_CDT_MACAN</code> — VD <code>AVIO_BAML_B.28.18</code></li>
          <li><b>Viết tắt dự án 3-4 ký tự:</b> AVIO (TT AVIO), FIUP (Fiato Uptown), BCGE (Bcons Green Emerald)...</li>
          <li><b>Viết tắt CĐT 3-4 ký tự:</b> BAML (BamLand), DXMD (DXMD Vietnam), DKRS (DK Realty Services)...</li>
          <li><b>Mã căn giữ nguyên format CĐT:</b> B.28.18, A-05-07, 4.19 — dùng dấu chấm hoặc gạch tùy CĐT</li>
          <li className="text-red-700"><b>KHÔNG:</b> viết mã căn dạng tự do (VD "Căn B28.18 tầng 28"). Format phải đúng để hệ thống tự match khi import Excel.</li>
        </ul>
      </section>

      <section className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 className="font-semibold text-red-900 mb-2">❌ Sai lầm hay gặp</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li><b>Chọn nhầm dự án khác CĐT:</b> Dự án phải khớp CĐT. VD căn TT AVIO phải link dự án "TT AVIO" (partner BamLand), không link nhầm "TT AVIO Phase 2".</li>
          <li><b>Nhập giá bán = giá gốc:</b> Nếu có chiết khấu, giá bán = giá gốc − chiết khấu. Giá gốc dùng để tính HH, giá bán ghi doanh thu.</li>
          <li><b>Quên %PMG_LK_sale:</b> Đây là mức tối đa HH — không nhập → form đối chiếu giá vốn sẽ báo lỗi khi CĐT chi.</li>
          <li><b>Trùng mã căn:</b> Mỗi căn 1 mã duy nhất. Nếu CĐT có nhiều đợt bán căn khác giá → tạo mã căn khác (VD B.28.18_v2).</li>
          <li><b>Sales_person sai tên:</b> Phải chọn từ list employees. Nếu NV mới → tạo trong /employees trước.</li>
        </ul>
      </section>

      <div className="text-xs text-slate-500 italic">
        Sau khi nhập căn: → <Link href="/help/nhap-doanh-thu" className="underline">Nhập doanh thu</Link> theo từng đợt khách trả.
      </div>
    </div>
  );
}
