-- Sửa %PMG của các căn dự án A&T Saigon Riverside cho khớp hợp đồng.
--
-- Triệu chứng: Sale Admin nhập đợt đối chiếu 100% cho 4 căn thì bị chặn "vượt
-- giá trần", dù tiền về đúng 100%.
--
-- Nguyên nhân: tỷ lệ ghi trên căn thấp hơn tỷ lệ đã dùng ở các đợt trước.
-- Hợp đồng ATSR_DXMD ghi cấu trúc "5% PDV cơ bản + 0,5% PQLKD" tức 5,5%,
-- nhưng căn lại cấu hình 5%, thiếu phần phí quản lý kinh doanh. Các đợt cũ đã
-- ghi nhận theo 5,5% nên khi lên 100% thì vượt trần tính theo 5%.
--
-- Đã loại giả thuyết đây là quy ước VAT nhân 1,1: quét toàn bộ 81 căn thì 75
-- căn có hai tỷ lệ bằng nhau, chỉ 6 căn lệch và đều thuộc dự án này.
--
-- Căn B-09-05 vốn đã để 5,5% và lên 100% bình thường, dùng làm mẫu. Sale Admin
-- xác nhận ngày 30/09/2026: B-09-11A là 4,4%, các căn còn lại 5,5%.
--
-- Chỉ sửa pmg_rate (trần doanh thu), giữ nguyên pmg_sale_rate vì đó là cơ sở
-- tính giá vốn, đúng như căn B-09-05 đang chạy.

UPDATE products SET pmg_rate = 0.055
WHERE product_code IN (
  'ATSR_DXMD_A-05-07',
  'ATSR_DXMD_A-29-12',
  'ATSR_DXMD_B-15-01',
  'ATSR_DXMD_B-31-12',
  'ATSR_DXMD_B-35-05'
) AND pmg_rate = 0.05;

UPDATE products SET pmg_rate = 0.044
WHERE product_code = 'ATSR_OPLR_B-09-11A' AND pmg_rate = 0.04;
