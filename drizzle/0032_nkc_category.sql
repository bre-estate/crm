-- 2026-08-08: Classify NKC rows để build P&L dồn tích khớp Kim BC.
-- Kim BC là accrual từ NKC nhưng bucket theo bản chất (không theo mã TK).
-- VD: 6411 (198M) + 6417 rows "hỗ trợ CTV" T1-T8 (156M) = Kim BC 4.1 (345M).

ALTER TABLE accounting_journal
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS category_source text,
  ADD COLUMN IF NOT EXISTS category_confidence integer;

CREATE INDEX IF NOT EXISTS idx_nkc_category ON accounting_journal(category);
CREATE INDEX IF NOT EXISTS idx_nkc_debit_cat ON accounting_journal(debit_account, category);

COMMENT ON COLUMN accounting_journal.category IS
  'Bucket phân loại Kim BC (32 giá trị). Dùng cùng module với bank_transactions.';
COMMENT ON COLUMN accounting_journal.category_source IS 'auto | manual';
