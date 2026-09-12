-- Giấy nộp thuế (GNT) đọc từ Drive 6.1-Hồ sơ thuế, để tách loại thuế trên sao kê (sao kê chỉ ghi KBNN, không ghi loại).
CREATE TABLE IF NOT EXISTS tax_payments (
  id serial PRIMARY KEY,
  paid_date text NOT NULL,          -- YYYY-MM-DD, ngày ký giấy nộp
  tax_type text NOT NULL,           -- gtgt | tncn | tndn | mon_bai | khac
  period text,                      -- "Q1/2026", "CN/2025"
  amount double precision NOT NULL,
  sub_item text,                    -- tiểu mục 1701, 1001, 1052, 2863
  source_file text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paid_date, tax_type, amount)
);
