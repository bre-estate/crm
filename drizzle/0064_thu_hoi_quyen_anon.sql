-- Lớp phòng thủ thứ hai: thu hồi sạch quyền của vai trò anon trên schema public.
--
-- Sau migration 0062 và 0063, mọi bảng đều bật RLS và không bảng nào trả dữ
-- liệu cho khóa anon nữa. Nhưng 28 bảng vẫn còn nguyên quyền cấp cho anon,
-- chỉ nhờ RLS chặn nên mới rỗng. Trạng thái đó mong manh: chỉ cần ai đó thêm
-- một policy cho phép, dù vô tình, là mở toang trở lại. Đã thử thật, 7 bảng
-- đã thu hồi quyền trả 401, còn 28 bảng kia trả 200 kèm mảng rỗng.
--
-- Không chỗ nào trong app dùng vai trò anon để đọc bảng nghiệp vụ. Trang
-- đăng nhập chỉ gọi signInWithOAuth, tức schema auth chứ không phải public.
-- Sau khi đăng nhập thì mọi truy vấn qua supabase-js chạy dưới vai trò
-- authenticated. Drizzle nối bằng chuỗi kết nối trực tiếp, không liên quan.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- positions đang cho mọi tài khoản đã đăng nhập đọc toàn bộ, điều kiện
-- "true". Bảng này chứa bảng quyền của từng vị trí, không phải dữ liệu
-- kinh doanh, nhưng vẫn để lộ cấu trúc phân quyền của công ty cho bất kỳ
-- tài khoản Google nào. Middleware chỉ đọc bảng này sau khi đã xác nhận
-- người dùng có dòng trong user_permissions và đang hoạt động, nên siết
-- thêm điều kiện đó không ảnh hưởng gì.
DROP POLICY IF EXISTS "positions_auth_read" ON positions;
DROP POLICY IF EXISTS "positions_select_authenticated" ON positions;
DO $$
DECLARE ten text;
BEGIN
  FOR ten IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='positions'
               AND roles::text LIKE '%authenticated%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON positions', ten);
  END LOOP;
END $$;

CREATE POLICY "positions_nhan_su_dang_lam" ON positions
  FOR SELECT TO authenticated
  USING (public.la_nhan_su_dang_lam());
