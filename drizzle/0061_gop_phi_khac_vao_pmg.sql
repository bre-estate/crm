-- Gộp %phí khác vào %PMG_LK và trả %PMG sale về đúng cơ sở giá vốn.
--
-- Bản này viết lại ngày 06/10/2026. Bản cũ viết cho trạng thái ngày 03/10 và
-- CHƯA TỪNG CHẠY, kiểm chứng bằng dữ liệu: nếu đã chạy thì other_fee_pct của
-- 5 căn phải bằng 0, thực tế vẫn 0,005. Bản này đặt thẳng giá trị đích thay
-- vì cộng dồn, nên chạy bao nhiêu lần cũng ra một kết quả.
--
-- BỐI CẢNH
--
-- Hợp đồng ATSR_DXMD số 09/2025/HĐDV/DXMD-BRE: 5% PDV cơ bản + 0,5% PQLKD,
-- bậc dưới 25 sản phẩm, tổng 5,5%. BRE đang có 7 căn nên đúng bậc này.
-- Admin xác nhận B-09-11A là 4,4%.
--
-- Đợt nhập đọc sheet 2.1 cột U vào pmg_rate, cột V vào other_fee_pct. Công
-- thức doanh thu cộng cả hai. Nhưng giao diện KHÔNG có ô nào hiện cột V, chỉ
-- có input ẩn nộp lại giá trị cũ. Người sửa căn thấy 5% nên tưởng thiếu rồi
-- nâng pmg_rate lên 5,5%, thành tính hai lần ra 6%. Đã lặp bốn lần:
-- migration 0058 (tự sửa, đã hoàn tác), B-09-05 từ trước, 03/10 với B-09-05
-- và B-15-01, rồi 05/10 với B-31-12, B-35-05, A-05-07, B-09-11A.
--
-- Các lần điều chỉnh đó còn kéo theo pmg_sale_rate từ 0,05 lên 0,055. Cột
-- này là cơ sở tính GIÁ VỐN, sheet 2.3 cột M ghi 0,05 cho mọi căn DXMD, nên
-- phải trả về 0,05. Chênh giữa 5,5% doanh thu và 5% giá vốn là phần thặng dư
-- có chủ đích, app đang hiển thị ở trang căn.
--
-- Sau bản vá này other_fee_pct bằng 0 trên toàn hệ thống, và hai script nhập
-- đã sửa ở cùng đợt để cộng cột V thẳng vào pmg_rate, nên cách lưu tách hai
-- trường không quay lại được nữa.

UPDATE products SET
  pmg_rate      = 0.055,
  pmg_sale_rate = 0.05,
  other_fee_pct = 0
WHERE product_code IN (
  'ATSR_DXMD_A-05-07',
  'ATSR_DXMD_A-29-12',
  'ATSR_DXMD_B-09-05',
  'ATSR_DXMD_B-15-01',
  'ATSR_DXMD_B-31-12',
  'ATSR_DXMD_B-35-05'
);

-- Admin xác nhận 4,4%. Giá vốn giữ 0,04 đúng sheet 2.3 cột M.
UPDATE products SET
  pmg_rate      = 0.044,
  pmg_sale_rate = 0.04,
  other_fee_pct = 0
WHERE product_code = 'ATSR_OPLR_B-09-11A';

-- Quét sạch phần còn sót, phòng căn nào khác cũng dính.
UPDATE products SET other_fee_pct = 0 WHERE COALESCE(other_fee_pct, 0) <> 0;
