-- Cấp quyền xem trang Soát dữ liệu.
--
-- Trang liệt kê các căn có doanh thu hoặc giá vốn vượt trần hợp đồng, kèm
-- phép tính đầy đủ. Trước đây những sai lệch này chỉ nằm trong các lần rà
-- tay rời rạc, muốn xem lại phải mò từng căn.
--
-- Cấp cho vị trí nào đang xem được báo cáo hoa hồng, vì cùng nhóm người
-- phải xử lý khi phát hiện sai. Chủ tài khoản luôn thấy mọi trang.

UPDATE positions
SET permissions = jsonb_set(
      permissions::jsonb,
      '{reports.soat-du-lieu}',
      '["view"]'::jsonb,
      true
    )::json
WHERE permissions::jsonb ? 'reports.commissions'
  AND NOT (permissions::jsonb ? 'reports.soat-du-lieu');
