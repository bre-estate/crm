-- Fix 0022: RESTRICTIVE service_role policy AND-combines với PERMISSIVE
-- policy → chặn authenticated user đọc chính row họ dù self-read PERMISSIVE
-- có match. Middleware không đọc được user_permissions → redirect vô hạn.
--
-- Supabase service_role JWT đã bypass RLS tự động (postgres role BYPASSRLS)
-- → KHÔNG cần policy cho service_role. Chỉ cần enable RLS + PERMISSIVE cho
-- các query hợp lệ qua anon client.

-- user_permissions: bỏ RESTRICTIVE, giữ self-read PERMISSIVE (0023 tạo).
DROP POLICY IF EXISTS "service_role only" ON user_permissions;

-- financial_transactions: bỏ RESTRICTIVE. Không có UI nào đọc bảng này qua
-- anon client (tất cả qua drizzle + service creds) → RLS enable nhưng không
-- policy nào = default deny cho anon, service_role bypass.
DROP POLICY IF EXISTS "service_role only" ON financial_transactions;

-- accounting_categories: tương tự.
DROP POLICY IF EXISTS "service_role only" ON accounting_categories;
