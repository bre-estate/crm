-- Phòng ban có cấp cha con, và tách CTV ra khỏi vị trí thành loại hợp đồng.
--
-- Trước đây CTV được ghi ở bốn chỗ khác nhau và không chỗ nào khớp chỗ nào:
-- mã CTV-xxx (4 người), vị trí 'ctv' (4 người), phòng CTV (4 người), và
-- contract_type 'Cộng Tác Viên' (33 người). File nhân sự ghi 33, nên CTV là
-- loại hợp đồng chứ không phải một nghề. Bốn người mang vị trí 'ctv' thật ra
-- là Trần Bình Trọng cùng ba người đứng tên dùm, việc thật của họ là NVKD.

ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_id integer REFERENCES departments(id);

-- Bốn phòng gốc
UPDATE departments SET name = 'Ban lãnh đạo' WHERE code = 'BLD';
UPDATE departments SET code = 'VP', name = 'Khối văn phòng' WHERE code = 'HC';
INSERT INTO departments (code, name)
SELECT 'KD', 'Kinh doanh'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE code = 'KD');

-- Hai đội kinh doanh thành nhánh con, tên bỏ tiền tố cho gọn
UPDATE departments SET name = 'Hồ Gia', parent_id = (SELECT id FROM departments WHERE code = 'KD')
WHERE code = 'HoGia';
UPDATE departments SET name = '1 Tỷ', parent_id = (SELECT id FROM departments WHERE code = 'KD')
WHERE code = 'MotTy';

-- Team Nội dung nằm trong Marketing. Chỗ chạy quảng cáo thêm sau khi có người.
INSERT INTO departments (code, name, parent_id)
SELECT 'NoiDung', 'Nội dung', (SELECT id FROM departments WHERE code = 'MKT')
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE code = 'NoiDung');

UPDATE employees SET department_id = (SELECT id FROM departments WHERE code = 'NoiDung')
WHERE department_id = (SELECT id FROM departments WHERE code = 'MKT');

-- Nhóm CTV cũ là người kinh doanh, đưa về phòng Kinh doanh rồi bỏ hai phòng rỗng.
-- Bốn căn đang gắn phòng CTV đều là của Trần Bình Trọng, chuyển theo luôn: CTV là
-- loại hợp đồng chứ không phải một phòng, nên doanh số của anh thuộc về Kinh doanh.
UPDATE employees SET department_id = (SELECT id FROM departments WHERE code = 'KD')
WHERE department_id = (SELECT id FROM departments WHERE code = 'CTV');

UPDATE products SET department_id = (SELECT id FROM departments WHERE code = 'KD')
WHERE department_id = (SELECT id FROM departments WHERE code = 'CTV');

DELETE FROM departments
WHERE code IN ('CTV', 'Freelancer')
  AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.department_id = departments.id)
  AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.department_id = departments.id)
  AND NOT EXISTS (SELECT 1 FROM departments d2 WHERE d2.parent_id = departments.id);

-- Vị trí 'ctv' không còn, việc thật của họ là NVKD
UPDATE employees SET position = 'nvkd' WHERE position = 'ctv';

-- Loại hợp đồng về mã máy đọc được
UPDATE employees SET contract_type = 'hd_dich_vu'  WHERE contract_type = 'Cộng Tác Viên';
UPDATE employees SET contract_type = 'hd_lao_dong' WHERE contract_type = 'Toàn thời gian';
