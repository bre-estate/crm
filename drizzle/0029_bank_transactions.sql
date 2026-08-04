-- Sao kê bank Techcombank (cty) — cash flow thực tế 100%.
-- Import từ CSV export Techcombank Internet Banking.
CREATE TABLE IF NOT EXISTS bank_transactions (
  id SERIAL PRIMARY KEY,
  account_number TEXT NOT NULL, -- 39676789 (Techcombank cty)
  request_date TIMESTAMPTZ NOT NULL, -- Ngày KH thực hiện
  transaction_date DATE NOT NULL, -- Ngày giao dịch (settlement)
  reference_number TEXT NOT NULL UNIQUE, -- FT24293549963410 or similar
  partner_bank TEXT, -- ACB, TPBank, etc
  partner_account TEXT, -- STK đối tác
  partner_name TEXT, -- Tên đối tác
  description TEXT NOT NULL, -- Nội dung chuyển khoản
  debit_amount NUMERIC(15, 0), -- Nợ (out - negative)
  credit_amount NUMERIC(15, 0), -- Có (in - positive)
  fee_interest NUMERIC(15, 0),
  vat NUMERIC(15, 0),
  running_balance NUMERIC(15, 0),
  source_file TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bt_tx_date_idx ON bank_transactions (transaction_date);
CREATE INDEX IF NOT EXISTS bt_debit_idx ON bank_transactions (debit_amount) WHERE debit_amount IS NOT NULL;
CREATE INDEX IF NOT EXISTS bt_credit_idx ON bank_transactions (credit_amount) WHERE credit_amount IS NOT NULL;
CREATE INDEX IF NOT EXISTS bt_partner_idx ON bank_transactions (partner_name);
