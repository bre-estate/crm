-- Vá lỗ hổng: 6 bảng chưa bật RLS và còn nguyên quyền cấp cho anon.
--
-- Phát hiện 05/10/2026 khi soát bảo mật. Khóa anon nằm công khai trong bundle
-- trình duyệt, nên bất kỳ ai mở crm.bre.vn, lấy khóa đó rồi gọi thẳng
-- PostgREST đều ĐỌC, SỬA, XÓA và TRUNCATE được 6 bảng dưới đây. Không cần
-- đăng nhập. Đã thử thật, cả 6 đều trả HTTP 200 kèm dữ liệu.
--
-- Nặng nhất là integrations.secrets, chứa refreshToken Google Drive.
-- Kế đến payroll_months 138 dòng, founder_spending 365 dòng, tax_payments 12
-- dòng, commission_policies 7 dòng.
--
-- Vì sao sót: migration 0022 và 0024 bật RLS cho các bảng nhạy cảm lúc đó,
-- nhưng CHỈ bật RLS chứ không thu hồi quyền bảng. 6 bảng này sinh ra sau và
-- không bảng nào được bổ sung vào đợt bật RLS.
--
-- Không chỗ nào phía trình duyệt đọc 6 bảng này. Đã rà toàn bộ truy vấn
-- supabase-js: chỉ user_permissions và positions, cả hai đã có policy riêng.
-- Drizzle nối bằng chuỗi kết nối trực tiếp nên không chịu RLS, app chạy bình
-- thường sau khi vá.

REVOKE ALL ON TABLE
  commission_policies,
  documents,
  founder_spending,
  integrations,
  payroll_months,
  tax_payments
FROM anon, authenticated;

ALTER TABLE commission_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE founder_spending    ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_months      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_payments        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role only" ON commission_policies;
CREATE POLICY "service_role only" ON commission_policies
  AS RESTRICTIVE FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role only" ON documents;
CREATE POLICY "service_role only" ON documents
  AS RESTRICTIVE FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role only" ON founder_spending;
CREATE POLICY "service_role only" ON founder_spending
  AS RESTRICTIVE FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role only" ON integrations;
CREATE POLICY "service_role only" ON integrations
  AS RESTRICTIVE FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role only" ON payroll_months;
CREATE POLICY "service_role only" ON payroll_months
  AS RESTRICTIVE FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role only" ON tax_payments;
CREATE POLICY "service_role only" ON tax_payments
  AS RESTRICTIVE FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- expense_requests đang mở ALL cho mọi tài khoản đã đăng nhập, điều kiện
-- "true". Mà bất kỳ tài khoản Google nào cũng đăng nhập được, kể cả chưa
-- được cấp quyền trong app, nên policy này cho người lạ đọc và xóa sạch
-- bảng. Bảng đang 0 dòng nên chưa mất gì. App đọc bảng này qua Drizzle.
DROP POLICY IF EXISTS "expense_requests_auth_all" ON expense_requests;
REVOKE ALL ON TABLE expense_requests FROM anon, authenticated;
