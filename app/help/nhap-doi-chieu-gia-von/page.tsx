import Link from "next/link";

export const dynamic = "force-static";

export default function NhapDCGiaVonPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <div className="text-xs">
          <Link href="/help" className="text-blue-600 hover:underline">← Trợ giúp</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Hướng dẫn nhập Đối chiếu giá vốn</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dành cho admin (Tường Vi, Nga) khi nhập đối chiếu giá vốn trên CRM.
          Đồng bộ với Excel BCDT sheet 2.3_Gia von.
        </p>
      </div>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-semibold text-blue-900 mb-2">🎯 2 ô nhập quan trọng nhất</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li>
            <b>N — Tiến độ PMG đã thu tiền (%):</b> khách đã trả CĐT bao nhiêu % giá căn.
            <br />
            <span className="text-slate-500">VD: khách trả 70% → nhập <code>70</code></span>
          </li>
          <li>
            <b>M — %PMG_LK_sale (%):</b> tỷ lệ <b>lũy kế</b> CĐT đã chi cho cty đến đợt này.
            <br />
            <span className="text-slate-500">Đây là cột M trong Excel BCDT. Nhập tay dựa vào thông báo/sao kê CĐT.</span>
          </li>
        </ul>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h2 className="font-semibold mb-2">🔢 Quy ước số thập phân</h2>
        <ul className="text-sm space-y-1 text-slate-700">
          <li>• Dùng dấu phẩy <code>,</code> cho phần thập phân (chuẩn Việt Nam)</li>
          <li>• VD nhập <code>6,925</code> (KHÔNG phải <code>6.925</code>)</li>
          <li>• Số âm: bắt đầu bằng dấu <code>-</code> (VD <code>-1000000</code> khi hoàn tiền)</li>
          <li>• Ô nhập tự chặn ký tự lạ (chữ cái, dấu chấm, v.v.)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">📝 3 tình huống mẫu</h2>

        <div className="space-y-4">
          {/* CASE 1 */}
          <div className="bg-card rounded-lg ring-1 ring-slate-200 p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Tình huống 1: Cách CŨ — CĐT chi 1 lần khi khách trả tới mốc</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">Bcons, Phú Đông, căn cũ AVIO</span>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              Tỷ lệ M tăng khi tiến độ N tăng. Mỗi lần khách trả tới mốc, CĐT chi ngay tỷ lệ tương ứng (1 lần).
            </p>
            <div className="mt-3 bg-slate-50 rounded p-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">Ví dụ căn Bcons B.28.18:</div>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left p-1">Đợt</th>
                    <th className="text-left p-1">Ngày</th>
                    <th className="text-right p-1">N (khách trả)</th>
                    <th className="text-right p-1">M (CĐT chi)</th>
                    <th className="text-left p-1">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <tr className="border-t"><td className="p-1">1</td><td className="p-1">17/11</td><td className="p-1 text-right">80%</td><td className="p-1 text-right">5,75%</td><td className="p-1 text-slate-500">CĐT chi trọn cho mốc 80%</td></tr>
                  <tr className="border-t"><td className="p-1">2</td><td className="p-1">04/02</td><td className="p-1 text-right">90%</td><td className="p-1 text-right">6,50%</td><td className="p-1 text-slate-500">Khách trả tiếp lên 90%, CĐT chi thêm</td></tr>
                  <tr className="border-t"><td className="p-1">3</td><td className="p-1">15/03</td><td className="p-1 text-right">100%</td><td className="p-1 text-right">7,00%</td><td className="p-1 text-slate-500">Đủ theo HĐ khi khách trả 100%</td></tr>
                </tbody>
              </table>
              <div className="text-[10px] text-slate-500 mt-2 italic">
                Đặc điểm: N tăng → M tăng. Mỗi mốc N chỉ có 1 đợt đối chiếu.
              </div>
            </div>
          </div>

          {/* CASE 2 */}
          <div className="bg-card rounded-lg ring-1 ring-amber-200 p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Tình huống 2: Cách MỚI — CĐT chi rải rác nhiều đợt cùng mốc N</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">AVIO Dataloca 2026</span>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              N giữ nguyên nhưng M tăng dần vì CĐT chi trả theo lịch riêng (không cùng lúc khách trả).
            </p>
            <div className="mt-3 bg-slate-50 rounded p-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">Ví dụ căn AVIO A2-07-08:</div>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left p-1">Đợt</th>
                    <th className="text-left p-1">Ngày</th>
                    <th className="text-right p-1">N (khách trả)</th>
                    <th className="text-right p-1">M (CĐT chi)</th>
                    <th className="text-left p-1">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <tr className="border-t"><td className="p-1">1</td><td className="p-1">04/07</td><td className="p-1 text-right">70%</td><td className="p-1 text-right">6,75%</td><td className="p-1 text-slate-500">CĐT chi lần 1 (chưa đủ)</td></tr>
                  <tr className="border-t bg-amber-50"><td className="p-1">2</td><td className="p-1">05/08</td><td className="p-1 text-right"><b>70%</b></td><td className="p-1 text-right"><b>6,925%</b></td><td className="p-1 text-slate-500">N GIỮ NGUYÊN, CĐT chi thêm 0,175%</td></tr>
                  <tr className="border-t"><td className="p-1">3</td><td className="p-1">?</td><td className="p-1 text-right">70%</td><td className="p-1 text-right">7,00%</td><td className="p-1 text-slate-500">CĐT chi tiếp cho đủ (giả định)</td></tr>
                </tbody>
              </table>
              <div className="text-[10px] text-slate-500 mt-2 italic">
                Đặc điểm: N giữ 70% qua 3 đợt, M tăng theo lịch CĐT chi.
                Đợt 2 admin nhập N=70 (như đợt 1) nhưng M=6,925 (tự nhìn thông báo CĐT).
              </div>
            </div>
          </div>

          {/* CASE 3 */}
          <div className="bg-card rounded-lg ring-1 ring-red-200 p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Tình huống 3: CĐT tăng mức tối đa HĐ (VD 7% → 8%)</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Hiếm gặp</span>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              CĐT sửa HĐ tăng tỷ lệ tổng lên. Cần cập nhật mức tối đa trong CRM TRƯỚC khi nhập đối chiếu mới.
            </p>
            <div className="mt-3 bg-slate-50 rounded p-3 text-sm">
              <div className="font-semibold text-slate-700 mb-2">Quy trình:</div>
              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                <li>Vào trang căn đó → Sửa</li>
                <li>Đổi ô <b>%PMG_LK_sale</b> từ 7% → 8%</li>
                <li>Lưu căn</li>
                <li>Vào form đối chiếu giá vốn → nhập M mới (VD 7,5% hoặc 8%)</li>
              </ol>
              <div className="text-xs text-amber-700 mt-2">
                ⚠️ Nếu nhập M vượt mức tối đa trước khi cập nhật căn → form sẽ hiện cảnh báo.
                Đừng bỏ qua cảnh báo, sửa mức tối đa trước.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 rounded-lg p-4">
        <h2 className="font-semibold mb-2">🔍 Kiểm tra sau khi nhập</h2>
        <ul className="text-sm space-y-1 text-slate-700">
          <li>• Số "Đợt này (dự tính)" trên form khớp Excel BCDT cột U (PMG phải trả đợt này)</li>
          <li>• Thanh tiến độ &lt; 100% mức tối đa</li>
          <li>• Không có cảnh báo đỏ hoặc vàng</li>
        </ul>
      </section>

      <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h2 className="font-semibold text-amber-900 mb-2">❌ Sai lầm hay gặp</h2>
        <ul className="text-sm space-y-2 text-slate-700">
          <li>
            <b>Nhầm cột M với cột N:</b> N là % khách trả CĐT (thường 70%, 80%, 90%). M là tỷ lệ CĐT chi (thường 5%-7%). Đừng nhập ngược.
          </li>
          <li>
            <b>Không nhập M khi cần thiết:</b> nếu để trống M, app dùng mặc định = %PMG_LK_sale từ căn.
            Với cách mới (CĐT chi rải rác), <b>phải nhập M</b> mỗi đợt vì tỷ lệ khác nhau.
          </li>
          <li>
            <b>Nhập M từng đợt lẻ thay vì lũy kế:</b> M là <b>lũy kế</b> đến ngày đối chiếu.
            Đừng nhập tỷ lệ CĐT chi lẻ đợt này (VD 0,175%), phải nhập lũy kế (6,925%).
          </li>
          <li>
            <b>Dùng dấu chấm thay dấu phẩy:</b> phải nhập <code>6,925</code>, không phải <code>6.925</code>.
          </li>
        </ul>
      </section>
    </div>
  );
}
