-- Bổ sung quyền xem trang Soát dữ liệu cho Sale Admin.
--
-- Migration 0066 cấp theo điều kiện "đang xem được báo cáo hoa hồng", nên
-- chỉ CEO và TPKD nhận được. Điều kiện đó sai: người nhập đối chiếu doanh
-- thu và giá vốn là Sale Admin, cũng là người phải sửa khi trang báo sai
-- lệch. Để họ không thấy thì mỗi lần phát hiện lỗi vẫn phải nhắn qua lại.
--
-- Sale Admin đang có costs, costs-report, revenues, products, tức toàn bộ
-- dữ liệu mà trang này soát. Cấp thêm quyền xem không mở rộng phạm vi gì.
--
-- Vị trí Kế toán hiện chưa cấu hình quyền nào nên không đụng tới.

UPDATE positions
SET permissions = jsonb_set(
      permissions::jsonb,
      '{reports.soat-du-lieu}',
      '["view"]'::jsonb,
      true
    )::json
WHERE code = 'admin'
  AND NOT (permissions::jsonb ? 'reports.soat-du-lieu');
