-- Bảng sổ nhật ký kế toán chuẩn TT200 — mirror sổ Kim (NKC sheet).
-- Mỗi row = 1 journal entry double-entry: Debit TK X = Credit TK Y = amount.

CREATE TABLE accounting_journal (
  id serial PRIMARY KEY,

  -- Thời gian (text YYYY-MM-DD để tránh timezone issues + đồng nhất với
  -- financialTransactions.transactionDate)
  entry_date text NOT NULL,        -- Ngày ghi sổ (từ col 3 NKC)

  -- Chứng từ
  doc_type text NOT NULL,          -- PC (Phiếu Chi), PKT (Phiếu Kế Toán),
                                   -- HD (Hóa Đơn), CTNH (Chứng Từ Ngân Hàng),
                                   -- CPCPB (Chi Phí Chờ Phân Bổ), etc.
  doc_number text NOT NULL,        -- Số chứng từ
  invoice_seri text,               -- Seri HĐ (nếu có)
  invoice_number text,             -- Số HĐ
  invoice_date text,               -- Ngày HĐ (YYYY-MM-DD)

  description text NOT NULL,       -- Diễn giải

  -- Double-entry
  debit_account text NOT NULL,     -- TK Nợ (VD "811", "6417", "1111")
  credit_account text NOT NULL,    -- TK Có
  amount double precision NOT NULL, -- Thành tiền (Nợ = Có = amount)

  -- Truy vết
  source_file text NOT NULL,       -- "SO SACH BRE 2025.xlsx"
  source_sheet text NOT NULL,      -- "NKC"
  source_row integer NOT NULL,     -- Row index trong sheet
  dedup_key text NOT NULL UNIQUE,  -- hash để idempotent import

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index cho query phổ biến
CREATE INDEX accounting_journal_date_idx ON accounting_journal (entry_date);
CREATE INDEX accounting_journal_debit_acc_idx ON accounting_journal (debit_account, entry_date);
CREATE INDEX accounting_journal_credit_acc_idx ON accounting_journal (credit_account, entry_date);
CREATE INDEX accounting_journal_month_idx
  ON accounting_journal (substring(entry_date, 1, 7));

-- RLS: owner + role có finance perm mới xem được
ALTER TABLE accounting_journal ENABLE ROW LEVEL SECURITY;

-- Deny by default (chỉ read qua server component, service_role bypass)
CREATE POLICY "no_public_access" ON accounting_journal FOR ALL USING (false);
