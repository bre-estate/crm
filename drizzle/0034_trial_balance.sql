-- 2026-08-08: Bảng cân đối phát sinh (CDPS) — nguồn cho Balance Sheet quản trị.
-- Import từ sheet CDPS trong SO SACH BRE 2025.xlsx (Kim làm chuẩn TT200 B01-DN).

CREATE TABLE IF NOT EXISTS trial_balance (
  id serial PRIMARY KEY,
  period_end date NOT NULL,         -- 2025-12-31
  account_code text NOT NULL,       -- 111, 1111, 112, 11211, 131, ...
  account_name text NOT NULL,
  opening_debit double precision DEFAULT 0,
  opening_credit double precision DEFAULT 0,
  period_debit double precision DEFAULT 0,
  period_credit double precision DEFAULT 0,
  closing_debit double precision DEFAULT 0,
  closing_credit double precision DEFAULT 0,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_end, account_code)
);

CREATE INDEX IF NOT EXISTS idx_tb_period ON trial_balance(period_end);
CREATE INDEX IF NOT EXISTS idx_tb_account ON trial_balance(account_code);
