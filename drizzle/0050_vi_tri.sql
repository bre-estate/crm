-- Gộp "vai trò" vào "vị trí" để chỉ còn một danh sách duy nhất.
--
-- Trước đây có hai bảng danh mục song song mô tả cùng một thứ:
--   employees.position  ceo, tpkd, nvkd, admin, hr, accountant, content_writer, ...
--   user_permissions.role  owner, manager, admin, hr, custom
-- Hai cái admin và hr vốn đã trùng tên, chỉ manager là tên khác của tpkd. Giữ song
-- song thì mỗi lần thêm một chức danh phải nhớ sửa hai chỗ.
--
-- Giờ chỉ còn bảng positions: vừa là danh mục chức danh cho hồ sơ nhân sự, vừa là
-- nơi giữ quyền truy cập. Nhãn, phòng ban gợi ý và quyền đều nằm đây thay vì ghi
-- cứng rải rác trong code.
--
-- Mã vị trí giữ nguyên, nên logic tính hoa hồng và bảng lương đang tra theo mã
-- ('nvkd', 'tpkd') không bị ảnh hưởng.

CREATE TABLE IF NOT EXISTS positions (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  -- Mã phòng gốc gợi ý, để form nhân sự lọc vị trí theo phòng đang chọn.
  khoi        text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Vị trí dựng sẵn: sửa được nhưng không xóa được.
  builtin     boolean NOT NULL DEFAULT false,
  thu_tu      integer NOT NULL DEFAULT 100,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO positions (code, label, khoi, thu_tu, builtin) VALUES
  ('ceo',            'CEO',            'BLD', 10, true),
  ('tpkd',           'TPKD',           'KD',  20, true),
  ('nvkd',           'NVKD',           'KD',  30, true),
  ('admin',          'Sale Admin',     'VP',  40, true),
  ('hr',             'HR',             'VP',  50, true),
  ('accountant',     'Kế toán',        'VP',  60, true),
  ('content_writer', 'Content Writer', 'MKT', 70, true),
  ('video_editor',   'Video Editor',   'MKT', 80, true),
  ('cameraman',      'Cameraman',      'MKT', 90, true)
ON CONFLICT (code) DO NOTHING;

-- Chuyển quyền từ vai trò cũ sang vị trí tương ứng.
-- "manager" là tên khác của cấp quản lý, chép cho cả CEO lẫn TPKD. Bách đang mang
-- vai trò manager mà hồ sơ nhân sự ghi CEO, nên CEO phải giữ đúng bộ quyền đó.
UPDATE positions p SET permissions = r.permissions
FROM role_permissions r WHERE r.role = 'manager' AND p.code IN ('ceo', 'tpkd');

UPDATE positions p SET permissions = r.permissions
FROM role_permissions r WHERE r.role = 'admin' AND p.code = 'admin';

UPDATE positions p SET permissions = r.permissions
FROM role_permissions r WHERE r.role = 'hr' AND p.code = 'hr';

-- Ràng buộc cũ chỉ cho phép đúng năm giá trị owner/manager/admin/hr/custom. Giờ vai
-- trò là mã vị trí nên danh sách mở, không ghi cứng được ở tầng database nữa. Kiểm
-- tra chuyển lên tầng ứng dụng, xem app/admin/users/actions.ts.
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_role_check;

UPDATE user_permissions SET role = 'ceo' WHERE role = 'manager';

DROP TABLE IF EXISTS role_permissions;
