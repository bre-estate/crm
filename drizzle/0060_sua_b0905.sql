-- Căn ATSR B-09-05 có pmg_rate 5,5% trong khi năm căn cùng dự án đều 5%.
--
-- Cộng với other_fee_pct 0,5% thì tổng thành 6%, cao hơn tỷ lệ 5,5% mà chính
-- các đợt của căn này đã ghi nhận. Doanh thu đã ghi là 195.690.776, đúng bằng
-- 3.558.014.106 x 5,5%, xác nhận 5,5% mới là tỷ lệ thật.
--
-- Nhiều khả năng căn này từng bị chặn vượt trần y như năm căn kia, rồi được
-- chữa bằng cách nâng pmg_rate thay vì sửa chốt chặn. Chốt chặn đã sửa ở
-- lib/actions/cap-guards.ts nên trả tỷ lệ về đúng.
UPDATE products SET pmg_rate = 0.05
WHERE product_code = 'ATSR_DXMD_B-09-05' AND pmg_rate = 0.055;
