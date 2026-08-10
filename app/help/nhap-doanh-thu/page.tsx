import Link from "next/link";

export const dynamic = "force-static";
export const metadata = { title: "Hướng dẫn nhập doanh thu — BRE" };

export default function NhapDoanhThuPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <div className="text-xs"><Link href="/" className="text-blue-600 hover:underline">← Trang chủ</Link></div>
        <h1 className="text-2xl font-bold mt-1">Hướng dẫn nhập Doanh thu</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dành cho Admin khi nhập đối chiếu doanh thu.
          Đồng bộ Excel BCDT sheet <b>2.2_Doanh thu</b> do Kế toán làm.
        </p>
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-semibold text-blue-900 mb-2">🎯 Doanh thu là gì?</h2>
        <p className="text-sm text-slate-700">
          Là HH sale + CĐT thưởng mà BRE nhận từ CĐT theo từng đợt khách trả tiền.
          <br />
          <b>1 căn có nhiều đợt đối chiếu</b> (đợt 1: cọc, đợt 2: đủ 30%, đợt 3: đủ 50%...).
          Mỗi đợt = 1 record trong CRM.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">📝 Các ô nhập chính</h2>
        <div className="bg-card rounded-lg ring-1 ring-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left p-2">Ô</th>
                <th className="text-left p-2">Ý nghĩa</th>
                <th className="text-left p-2">Ví dụ</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Mã căn</td>
                <td className="p-2">Chọn từ danh sách kho căn</td>
                <td className="p-2 text-slate-500">AVIO_BAML_B.28.18</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Ngày đối chiếu</td>
                <td className="p-2">Ngày CĐT đối chiếu công nợ (KHÔNG phải ngày chuyển tiền)</td>
                <td className="p-2 text-slate-500">15/08/2026</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Số biên bản</td>
                <td className="p-2">Số biên bản đối chiếu do CĐT phát hành</td>
                <td className="p-2 text-slate-500">BB-AVIO-2026-08</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Tiến độ khách trả (N)</td>
                <td className="p-2">% khách đã trả CĐT tính đến ngày đối chiếu này</td>
                <td className="p-2 text-slate-500">80%</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">%PMG_LK</td>
                <td className="p-2">Tỷ lệ HH lũy kế CĐT chi cho BRE (nhìn thông báo CĐT)</td>
                <td className="p-2 text-slate-500">5,25%</td>
              </tr>
              <tr className="border-t">
                <td className="p-2 font-mono text-xs">Số HĐ / Ngày HĐ</td>
                <td className="p-2">Link tới hóa đơn CĐT phát cho BRE (nếu có)</td>
                <td className="p-2 text-slate-500">HĐ số 24 · 22/06/2026</td>
              </tr>
              <tr className="border-t bg-blue-50">
                <td className="p-2 font-mono text-xs">CĐT thưởng sale</td>
                <td className="p-2">Nếu CĐT có thưởng nóng cho NV → nhập ở đây (gồm VAT)</td>
                <td className="p-2 text-slate-500">10.000.000</td>
              </tr>
              <tr className="border-t bg-blue-50">
                <td className="p-2 font-mono text-xs">CĐT thưởng QL</td>
                <td className="p-2">CĐT thưởng cho quản lý sàn (nếu có, gồm VAT)</td>
                <td className="p-2 text-slate-500">3.000.000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h2 className="font-semibold text-amber-900 mb-2">🔗 Về Hóa đơn (quan trọng!)</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li>
            <b>Quy tắc unique:</b> (Số HĐ + Ngày HĐ + CĐT) là 1 tổ hợp duy nhất.
            HĐ số 4 có thể có ngày 2025 và ngày 2026 khác nhau → là 2 HĐ khác.
          </li>
          <li>
            <b>1 HĐ nhiều căn:</b> Nhiều căn cùng đợt có thể chung 1 HĐ. VD HĐ 24 ngày 22/06/2026 có 31 căn.
            Khi nhập, chọn số + ngày HĐ đã có → hệ thống tự link vào HĐ có sẵn.
          </li>
          <li>
            <b>1 HĐ nhiều CĐT (đặc biệt):</b> Dataloca 2025 + Dataloca 2026 là 2 pháp nhân riêng nhưng CHUNG công ty
            → xuất chung 1 HĐ. Hệ thống auto set partner_id = NULL cho HĐ đa CĐT.
          </li>
          <li>
            <b>Đổi ngày/số HĐ trên form doanh thu:</b> Hệ thống hiểu là 2 HĐ khác nhau và tự tạo HĐ mới với ngày/số mới.
            <b className="text-green-700">Từ 10/08/2026:</b> HĐ cũ tự động bị xóa nếu mất hết recon (không còn orphan như trước).
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">📊 Tình huống mẫu</h2>

        <div className="bg-card rounded-lg ring-1 ring-slate-200 p-4 space-y-3">
          <h3 className="font-semibold">Ví dụ: căn 2PN dự án A</h3>
          <p className="text-sm text-slate-600">Giá bán 3.5 tỷ, HH sale 5.25%, khách trả nhiều đợt.</p>

          <table className="w-full text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">Đợt</th>
                <th className="text-left p-2">Ngày ĐC</th>
                <th className="text-right p-2">N (khách)</th>
                <th className="text-right p-2">%PMG_LK</th>
                <th className="text-right p-2">DT đợt này</th>
                <th className="text-right p-2">CĐT thưởng sale</th>
                <th className="text-right p-2">Tổng phải thu</th>
                <th className="text-left p-2">HĐ</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-t"><td className="p-2">1</td><td className="p-2">15/05</td><td className="p-2 text-right">30%</td><td className="p-2 text-right">1,50%</td><td className="p-2 text-right">52.500.000</td><td className="p-2 text-right">—</td><td className="p-2 text-right">57.750.000</td><td className="p-2">HĐ 20 · 15/05</td></tr>
              <tr className="border-t"><td className="p-2">2</td><td className="p-2">22/06</td><td className="p-2 text-right">70%</td><td className="p-2 text-right">4,00%</td><td className="p-2 text-right">87.500.000</td><td className="p-2 text-right">10.000.000</td><td className="p-2 text-right">107.250.000</td><td className="p-2">HĐ 24 · 22/06</td></tr>
              <tr className="border-t"><td className="p-2">3</td><td className="p-2">10/08</td><td className="p-2 text-right">100%</td><td className="p-2 text-right">5,25%</td><td className="p-2 text-right">43.750.000</td><td className="p-2 text-right">—</td><td className="p-2 text-right">48.125.000</td><td className="p-2">HĐ 28 · 10/08</td></tr>
            </tbody>
          </table>

          <p className="text-xs text-slate-500 italic">
            3 đợt = 3 records. Tổng HH sale cho căn này = 183.75M (52.5+87.5+43.75). Thưởng nóng 10M đợt 2 chỉ có ở đợt cột riêng.
          </p>
        </div>
      </section>

      <section className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 className="font-semibold text-red-900 mb-2">❌ Sai lầm hay gặp</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li><b>Nhập %PMG_LK từng đợt lẻ:</b> phải nhập LŨY KẾ (VD 4,00% chứ không phải 2,50% chênh so đợt 1). Hệ thống tự tính đợt này = LK − LK đợt trước.</li>
          <li><b>Nhầm ngày CK bank với ngày ĐC:</b> Ngày ĐC = ngày CĐT phát biên bản, KHÔNG phải ngày chuyển tiền vào TK BRE.</li>
          <li><b>Số HĐ trùng nhưng khác ngày:</b> ĐÚNG nếu Kế toán confirm là 2 HĐ khác nhau. Đừng cố merge.</li>
          <li><b>Nhập CĐT thưởng sale vào ô "DT đợt này":</b> Thưởng nóng có ô riêng. Không nhập chung vào doanh thu HH.</li>
          <li><b>Quên chọn số HĐ:</b> Doanh thu không link HĐ → không đối chiếu được với hóa đơn Kế toán xuất.</li>
        </ul>
      </section>

      <div className="text-xs text-slate-500 italic">
        Xem thêm: <Link href="/help/nhap-doi-chieu-gia-von" className="underline">Nhập đối chiếu giá vốn</Link> — sau khi nhập doanh thu, admin/HR tiếp tục nhập giá vốn tương ứng.
      </div>
    </div>
  );
}
