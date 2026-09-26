-- Gỡ đuôi "(đã nghỉ)" bị dính vào tên người trong dữ liệu.
--
-- Trang sửa giao dịch đang nối chuỗi đó vào chính GIÁ TRỊ của lựa chọn NVKD chứ
-- không chỉ vào nhãn. Ai chọn một người đã nghỉ là tên có đuôi được ghi thẳng
-- xuống database, và từ đó tên không khớp với bảng nhân sự nữa: mở lại căn thì
-- ô NVKD trống trơn, báo cáo theo người thì tách người đó làm hai.
--
-- Đây chính là ca căn A2-12A-11 với Nguyễn Hồng Diễm. Quét toàn bộ cột chứa tên
-- người thì chỉ hai chỗ dính, mỗi chỗ một dòng.
--
-- Nguyên nhân đã vá ở app/products/[id]/edit/page.tsx: đuôi chuyển sang dòng mô
-- tả phụ, giá trị giữ đúng tên gốc.

UPDATE products
SET sales_person = btrim(regexp_replace(sales_person, '\s*\(đã\s+nghỉ\)\s*$', '', 'i'))
WHERE sales_person ~* '\(đã\s+nghỉ\)\s*$';

UPDATE cost_reconciliations
SET employee_name = btrim(regexp_replace(employee_name, '\s*\(đã\s+nghỉ\)\s*$', '', 'i'))
WHERE employee_name ~* '\(đã\s+nghỉ\)\s*$';
