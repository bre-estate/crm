-- Siết quyền kho tệp tai-lieu.
--
-- Bốn policy cũ cho đọc, sửa, tải lên và xóa với điều kiện duy nhất là
-- bucket_id = 'tai-lieu', cấp cho vai trò authenticated. Mà bất kỳ tài khoản
-- Google nào cũng đăng nhập được và nhận vai trò authenticated, kể cả tài
-- khoản chưa được cấp quyền trong app. Nghĩa là người lạ tải về, ghi đè và
-- xóa được mọi tài liệu công ty.
--
-- Kho đang 0 tệp nên chưa mất gì, nhưng hễ bắt đầu dùng là lộ ngay.
--
-- Thêm điều kiện phải có dòng trong user_permissions và còn hoạt động.
-- App đọc kho qua lib/supabase/server (kết nối theo phiên người dùng) nên
-- chịu RLS, nhân viên thật vẫn qua được. Không có client service_role nào
-- trong code nên không đường nào bị bỏ sót.

CREATE OR REPLACE FUNCTION public.la_nhan_su_dang_lam()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions up
    WHERE up.email = auth.email() AND up.active
  );
$$;

DROP POLICY IF EXISTS "tai_lieu_doc"     ON storage.objects;
DROP POLICY IF EXISTS "tai_lieu_sua"     ON storage.objects;
DROP POLICY IF EXISTS "tai_lieu_tai_len" ON storage.objects;
DROP POLICY IF EXISTS "tai_lieu_xoa"     ON storage.objects;

CREATE POLICY "tai_lieu_doc" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tai-lieu' AND public.la_nhan_su_dang_lam());

CREATE POLICY "tai_lieu_sua" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tai-lieu' AND public.la_nhan_su_dang_lam());

CREATE POLICY "tai_lieu_tai_len" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tai-lieu' AND public.la_nhan_su_dang_lam());

CREATE POLICY "tai_lieu_xoa" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tai-lieu' AND public.la_nhan_su_dang_lam());
