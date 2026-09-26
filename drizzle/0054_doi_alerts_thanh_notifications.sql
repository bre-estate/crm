-- Trang Thông báo đổi đường dẫn từ /alerts sang /notifications, và khóa quyền
-- đổi theo từ "alerts" sang "notifications".
--
-- Trang, chuông và nhãn phân quyền đều gọi là Thông báo, chỉ mỗi đường dẫn với
-- khóa quyền còn gọi là cảnh báo. Bảng lưu trạng thái đã đọc vốn đã tên
-- notification_reads, nên đổi hai chỗ còn lại cho khớp.
--
-- Đổi tên khóa trong JSON quyền của cả vị trí lẫn tài khoản có quyền riêng,
-- không thì ai đang được cấp sẽ mất quyền vào trang.

UPDATE positions
SET permissions = (permissions - 'alerts')
                  || jsonb_build_object('notifications', permissions -> 'alerts'),
    updated_at = now()
WHERE permissions ? 'alerts';

UPDATE user_permissions
SET permissions = (permissions - 'alerts')
                  || jsonb_build_object('notifications', permissions -> 'alerts')
WHERE permissions ? 'alerts';
