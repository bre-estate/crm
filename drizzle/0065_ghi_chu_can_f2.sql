-- Ghi lý do vì sao B-09-11A có tỷ lệ khác sáu căn A&T còn lại.
--
-- Sale Admin xác nhận 06/10/2026: căn này BRE đứng vai F2, chỉ hưởng 80%
-- mức phí. PMG đầy đủ của dự án là 5,5% như mọi căn A&T khác, nên:
--
--   doanh thu  5,5% × 80% = 4,4%   (pmg_rate      = 0,044)
--   giá vốn    5,0% × 80% = 4,0%   (pmg_sale_rate = 0,04)
--
-- Một con số 80% giải thích được cả hai tỷ lệ, đó là lý do tin cách đọc này.
--
-- App lưu tỷ lệ ĐÃ nhân sẵn, không có trường nào ghi vai F1/F2 hay phần
-- hưởng. Nên nhìn vào chỉ thấy 4,4% nằm cạnh sáu căn 5,5% mà không rõ vì
-- sao, đúng kiểu tình huống đã bốn lần khiến người dùng tự nâng tỷ lệ lên
-- cho "khớp". Ghi vào cột note để hiện trên trang căn.
--
-- Con số 4,5% ghi ở sheet 2.1 (cột U 0,04 + cột V 0,005) là cấu hình sai từ
-- đầu, không phải một mức phí riêng. Đã sửa ở migration 0061.

UPDATE products
SET note = COALESCE(NULLIF(TRIM(note), '') || E'\n', '') ||
  'BRE là F2 ở căn này, chỉ hưởng 80% mức phí. PMG đầy đủ của dự án là 5,5%, '
  'nên doanh thu 5,5% x 80% = 4,4% và giá vốn 5% x 80% = 4%. '
  'Tỷ lệ lưu trong hệ thống là tỷ lệ đã nhân sẵn, đừng sửa thành 5,5%. '
  'Sale Admin xác nhận 06/10/2026.'
WHERE product_code = 'ATSR_OPLR_B-09-11A'
  AND COALESCE(note, '') NOT LIKE '%F2%';
