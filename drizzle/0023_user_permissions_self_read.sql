-- Phase 1.1b: Cho phép authenticated user READ ROW của chính họ (email match).
-- Middleware cần query user_permissions bằng anon Supabase client → phải có
-- policy này. Không cho write, không cho đọc user khác.

CREATE POLICY "self read only" ON user_permissions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (email = auth.email());
