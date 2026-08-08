-- 2026-08-08: Phase 1 báo cáo quản trị
-- 1. Thêm cột category + reconciliation vào bank_transactions
-- 2. Tạo bảng general_expenses (CP quản lý — nhập tay hoặc import từ bank)

-- 1. bank_transactions: category + linked event
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS category_source text,
  ADD COLUMN IF NOT EXISTS category_confidence integer,
  ADD COLUMN IF NOT EXISTS linked_event_type text,
  ADD COLUMN IF NOT EXISTS linked_event_id integer,
  ADD COLUMN IF NOT EXISTS reconciliation_status text DEFAULT 'unmatched';

COMMENT ON COLUMN bank_transactions.category IS
  'Bucket phân loại (33 giá trị, xem lib/transaction-classifier.ts)';
COMMENT ON COLUMN bank_transactions.category_source IS 'auto | manual';
COMMENT ON COLUMN bank_transactions.category_confidence IS '0-100 (auto rule strength)';
COMMENT ON COLUMN bank_transactions.linked_event_type IS
  'revenue_reconciliation | cost_reconciliation | secondary_sale | rental | general_expense';
COMMENT ON COLUMN bank_transactions.reconciliation_status IS
  'matched | unmatched | manual | ignored';

CREATE INDEX IF NOT EXISTS idx_bank_tx_category ON bank_transactions(category);
CREATE INDEX IF NOT EXISTS idx_bank_tx_linked_event
  ON bank_transactions(linked_event_type, linked_event_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_reconciliation
  ON bank_transactions(reconciliation_status);

-- 2. general_expenses: CP quản lý (lương, marketing, thuê VP, tiếp khách...)
CREATE TABLE IF NOT EXISTS general_expenses (
  id serial PRIMARY KEY,
  expense_date date NOT NULL,
  amount double precision NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  beneficiary_name text,
  beneficiary_account text,
  payment_method text DEFAULT 'bank',

  -- Workflow (Payment Request / P2P)
  status text NOT NULL DEFAULT 'draft',
  requested_by uuid,
  approver_id uuid,
  approved_at timestamptz,
  rejected_reason text,

  -- Cash payment tracking
  paid_at timestamptz,
  bank_transaction_id integer REFERENCES bank_transactions(id) ON DELETE SET NULL,

  -- Chứng từ
  attachment_url text,
  invoice_number text,
  invoice_date date,

  -- Meta
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE general_expenses IS
  'CP quản lý (lương, marketing, thuê VP, tiếp khách...). Nhập tay hoặc reverse-import từ bank.';
COMMENT ON COLUMN general_expenses.status IS
  'draft | pending | approved | rejected | paid';
COMMENT ON COLUMN general_expenses.payment_method IS 'bank | cash';

CREATE INDEX IF NOT EXISTS idx_gen_exp_date ON general_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_gen_exp_category ON general_expenses(category);
CREATE INDEX IF NOT EXISTS idx_gen_exp_status ON general_expenses(status);
CREATE INDEX IF NOT EXISTS idx_gen_exp_bank_tx ON general_expenses(bank_transaction_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gen_exp_updated ON general_expenses;
CREATE TRIGGER trg_gen_exp_updated
  BEFORE UPDATE ON general_expenses
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
