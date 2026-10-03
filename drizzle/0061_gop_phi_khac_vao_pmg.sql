-- Gộp %phí khác vào %PMG_LK, bỏ cách lưu tách hai trường.
--
-- Hợp đồng ATSR_DXMD số 09/2025/HĐDV/DXMD-BRE ghi cấu trúc ba phần:
--   X < 25 SP:       5% PDV cơ bản + 0,5% PQLKD
--   25 =< X < 50 SP: 5% PDV cơ bản + 0,5% PQLKD + 0,5% PDVLT
--   X >= 50 SP:      5% PDV cơ bản + 0,5% PQLKD + 1% PDVLT
-- BRE đang có 7 căn A&T nên thuộc bậc đầu, tổng đúng là 5,5%.
--
-- Đợt nhập đọc sheet 2.1 cột U vào pmg_rate và cột V vào other_fee_pct. Công
-- thức doanh thu cộng cả hai, nhưng giao diện sửa căn KHÔNG có ô nào hiện
-- other_fee_pct, chỉ có input ẩn. Người sửa căn thấy 5% nên tưởng thiếu 0,5%
-- rồi nâng pmg_rate lên 5,5%, thành ra tính hai lần. Đã xảy ra ba lần:
-- migration 0058 (tự sửa, đã hoàn tác), căn B-09-05 trước đó, và 03/10/2026.
--
-- Dự án FENICA có cấu trúc hợp đồng y hệt (6,5% PDV + 0,5% QLKD + PLT) nhưng
-- lưu gộp thành một số 7,5%. Migration này đưa A&T về cùng quy ước đó.
--
-- Toàn hệ thống chỉ 7 căn A&T có other_fee_pct khác 0, không dự án nào đặt
-- mặc định. Phép gộp không đổi doanh thu tính ra, vì công thức vốn đã cộng
-- cả hai trường.
--
-- CHƯA XỬ LÝ ở đây: B-09-05 và B-15-01. Hai căn đó đang có pmg_rate 0,055
-- cộng other_fee_pct 0,005 thành 6%, và gắn hóa đơn 46 ngày 29/09/2026 tổng
-- 136.875.199 mà tỷ lệ suy ra không tròn (5,90% và 5,88%). Chờ Sale Admin
-- xác nhận hóa đơn rồi xử lý riêng.

UPDATE products
SET pmg_rate = pmg_rate + other_fee_pct,
    other_fee_pct = 0
WHERE product_code IN (
  'ATSR_DXMD_A-05-07',
  'ATSR_DXMD_A-29-12',
  'ATSR_DXMD_B-31-12',
  'ATSR_DXMD_B-35-05',
  'ATSR_OPLR_B-09-11A'
) AND COALESCE(other_fee_pct, 0) <> 0;
