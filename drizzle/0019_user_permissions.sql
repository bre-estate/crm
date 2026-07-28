-- User permission management (2026-07-28)
-- Thay thế hardcode OWNER_EMAILS trong lib/auth.ts.
-- Owner add user qua /admin/users → user login Google lần đầu → auto activate.

CREATE TABLE IF NOT EXISTS user_permissions (
  email          text PRIMARY KEY,
  full_name      text,
  role           text NOT NULL DEFAULT 'viewer'
                   CHECK (role IN ('owner', 'manager', 'sale', 'admin', 'hr', 'viewer', 'custom')),
  -- JSONB map: { "resource_key": ["view", "edit", "delete"] }
  -- Nếu role != 'custom' → permissions được auto-fill từ preset (server-side).
  permissions    jsonb NOT NULL DEFAULT '{}'::jsonb,
  active         boolean NOT NULL DEFAULT true,
  invited_by     text,
  invited_at     timestamptz NOT NULL DEFAULT now(),
  last_login     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_role ON user_permissions(role);
CREATE INDEX IF NOT EXISTS idx_user_permissions_active ON user_permissions(active);

-- Seed 2 owner hiện tại (Triết + Bách)
INSERT INTO user_permissions (email, full_name, role, permissions, active, invited_at)
VALUES
  ('trietnguyen308@gmail.com', 'Triết Nguyễn', 'owner', '{}'::jsonb, true, now()),
  ('bach.khdt@gmail.com',       'Đoàn Lê Bách', 'owner', '{}'::jsonb, true, now())
ON CONFLICT (email) DO NOTHING;

-- Seed reader hiện tại (Lan Viên Hồ)
INSERT INTO user_permissions (email, full_name, role, permissions, active, invited_at)
VALUES
  ('lanvienho@gmail.com', 'Lan Viên Hồ', 'custom',
   '{"reports.segments": ["view", "edit"]}'::jsonb, true, now())
ON CONFLICT (email) DO NOTHING;
