-- Hoàn tác migration 0058. Chẩn đoán ban đầu sai.
--
-- 0058 nâng pmg_rate của các căn A&T từ 5% lên 5,5% vì tưởng cấu hình thiếu
-- 0,5% phí quản lý kinh doanh. Thực tế 0,5% đó ĐÃ CÓ, nằm ở cột other_fee_pct,
-- và công thức doanh thu của app đã cộng nó vào:
--
--   lib/actions/products.ts:592   pmgBase * (rate + otherFeePct) + ...
--
-- Nên nâng pmg_rate là tính 0,5% hai lần, tổng thành 6% thay vì 5,5%.
--
-- Lỗi thật nằm ở chốt chặn trần: lib/actions/cap-guards.ts tính
-- cap = pmgBase * pmgRate, bỏ qua other_fee_pct. Hai công thức đá nhau nên
-- doanh thu ghi đúng vẫn bị báo vượt trần. Sửa ở code, không sửa dữ liệu.

UPDATE products SET pmg_rate = 0.05
WHERE product_code IN (
  'ATSR_DXMD_A-05-07',
  'ATSR_DXMD_A-29-12',
  'ATSR_DXMD_B-15-01',
  'ATSR_DXMD_B-31-12',
  'ATSR_DXMD_B-35-05'
) AND pmg_rate = 0.055;

UPDATE products SET pmg_rate = 0.04
WHERE product_code = 'ATSR_OPLR_B-09-11A' AND pmg_rate = 0.044;
