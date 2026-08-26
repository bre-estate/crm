-- Migration 0040: expense_requests
-- Workflow yêu cầu chi tiền công ty (P1 MVP).
-- Không đụng company_expenses legacy — bảng mới hoàn toàn.

CREATE TABLE IF NOT EXISTS expense_requests (
  id SERIAL PRIMARY KEY,
  expense_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VND',
  expense_date TEXT NOT NULL,
  payment_method TEXT,

  requester_email TEXT NOT NULL,
  approver_email TEXT,

  status TEXT NOT NULL DEFAULT 'draft',

  account_code TEXT,
  note TEXT,
  rejection_reason TEXT,

  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  paid_by TEXT,

  link_type TEXT,
  link_id INTEGER,

  attachments JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_requests_status ON expense_requests(status);
CREATE INDEX IF NOT EXISTS idx_expense_requests_requester ON expense_requests(requester_email);
CREATE INDEX IF NOT EXISTS idx_expense_requests_approver ON expense_requests(approver_email);
CREATE INDEX IF NOT EXISTS idx_expense_requests_date ON expense_requests(expense_date DESC);

-- RLS: match pattern các bảng nội bộ khác (service role bypass, authenticated allow all).
-- Auth check nằm ở lib/auth.ts requirePermission cấp app layer.
ALTER TABLE expense_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_requests_service_all" ON expense_requests;
CREATE POLICY "expense_requests_service_all" ON expense_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "expense_requests_auth_all" ON expense_requests;
CREATE POLICY "expense_requests_auth_all" ON expense_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
