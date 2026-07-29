-- Phase 1.1: Enable RLS cho các bảng nhạy cảm (2026-07-30)
-- Trước: bảng user_permissions expose qua Supabase anon key → user tự PATCH role.
-- Giờ: enable RLS + policy chỉ cho phép read/write qua service_role.

-- 1. user_permissions — cực kỳ nhạy cảm
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON user_permissions;
CREATE POLICY "service_role only" ON user_permissions
  AS RESTRICTIVE
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. financial_transactions — chi phí công ty, không cho anon đọc
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON financial_transactions;
CREATE POLICY "service_role only" ON financial_transactions
  AS RESTRICTIVE
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. accounting_categories — cấu hình phân loại, cho anon READ (để UI filter)
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read for authenticated" ON accounting_categories;
DROP POLICY IF EXISTS "service_role only" ON accounting_categories;
CREATE POLICY "service_role only" ON accounting_categories
  AS RESTRICTIVE
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
