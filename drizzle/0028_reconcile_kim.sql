-- Bảng payment_requests: import từ sheet "1.1-Đề nghị thanh toán".
-- Chi tiết per person / per invoice — dùng để breakdown Kim NKC bulk entries.
CREATE TABLE IF NOT EXISTS payment_requests (
  id SERIAL PRIMARY KEY,
  stt INTEGER, -- STT trong sheet
  request_date DATE, -- Ngày đề nghị
  requester TEXT, -- Người đề nghị (thường admin)
  department TEXT, -- Bộ phận
  detail TEXT, -- Chi tiết khoản thanh toán
  amount NUMERIC(15, 0) NOT NULL, -- Số tiền
  attachments TEXT, -- Hồ sơ chứng từ kèm
  payment_method TEXT, -- Hình thức thanh toán
  transfer_content TEXT, -- Nội dung chuyển khoản
  recipient TEXT, -- Người nhận tiền
  recipient_account TEXT, -- STK người nhận
  recipient_bank TEXT, -- Ngân hàng
  reviewed_by TEXT, -- Người kiểm tra (Kim)
  reviewed_at DATE, -- Ngày kiểm tra
  reviewed_status TEXT, -- Đồng ý / Từ chối / Pending
  approved_by TEXT, -- Người phê duyệt (Triết)
  approved_at DATE,
  paid_at DATE, -- Ngày thanh toán thực tế
  source_row INTEGER NOT NULL, -- row trong Excel
  dedup_key TEXT NOT NULL UNIQUE, -- 'dntt-{stt}' or hash
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pr_date_idx ON payment_requests (request_date);
CREATE INDEX IF NOT EXISTS pr_recipient_idx ON payment_requests (recipient);
CREATE INDEX IF NOT EXISTS pr_amount_idx ON payment_requests (amount);

-- Bảng kim_entry_reconciliation: mark từng entry Kim = done + link DNTT rows.
CREATE TABLE IF NOT EXISTS kim_entry_reconciliation (
  kim_entry_id INTEGER PRIMARY KEY REFERENCES accounting_journal(id) ON DELETE CASCADE,
  linked_payment_request_ids INTEGER[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | needs_kim | orphan
  note TEXT,
  reconciled_at TIMESTAMPTZ,
  reconciled_by TEXT
);

CREATE INDEX IF NOT EXISTS kim_recon_status_idx ON kim_entry_reconciliation (status);
