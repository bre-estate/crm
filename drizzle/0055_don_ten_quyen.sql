-- Dọn tiền tố khóa quyền cho khớp nhóm trên menu, và bật RLS cho bảng positions.
--
-- Tiền tố "admin." dành cho nhóm Quản trị, còn Vị trí nằm ở nhóm Tổ chức cạnh
-- Nhân sự và Phòng ban (hai cái đó đang là "employees", "departments" trơn), nên
-- "admin.positions" thành "positions".
--
-- "settings.integrations" là tiền tố duy nhất kiểu "settings.", mà trang Tích hợp
-- lại nằm trong nhóm Quản trị, nên gom về "admin.integrations".

UPDATE positions
SET permissions = (permissions - 'admin.positions')
                  || jsonb_build_object('positions', permissions -> 'admin.positions'),
    updated_at = now()
WHERE permissions ? 'admin.positions';

UPDATE positions
SET permissions = (permissions - 'settings.integrations')
                  || jsonb_build_object('admin.integrations', permissions -> 'settings.integrations'),
    updated_at = now()
WHERE permissions ? 'settings.integrations';

UPDATE user_permissions
SET permissions = (permissions - 'admin.positions')
                  || jsonb_build_object('positions', permissions -> 'admin.positions')
WHERE permissions ? 'admin.positions';

UPDATE user_permissions
SET permissions = (permissions - 'settings.integrations')
                  || jsonb_build_object('admin.integrations', permissions -> 'settings.integrations')
WHERE permissions ? 'settings.integrations';

-- Bảng positions đang là bảng duy nhất chưa bật RLS, nên đọc được mà không cần
-- đăng nhập. Nó chỉ chứa danh mục chức danh và bảng quyền, không có dữ liệu cá
-- nhân, nhưng vẫn nên đóng lại cho đồng bộ với các bảng còn lại.
--
-- Khác employees và departments (bật RLS, không luật nào, app đọc qua drizzle),
-- bảng này phải cho người đã đăng nhập đọc: middleware tra quyền qua PostgREST
-- bằng phiên của chính người dùng. Không có luật này là chặn sạch mọi trang.
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS positions_doc_khi_dang_nhap ON positions;
CREATE POLICY positions_doc_khi_dang_nhap ON positions
  FOR SELECT TO authenticated USING (true);
