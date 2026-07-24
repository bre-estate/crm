-- Phase 1 accounting subsystem (2026-07-24)
-- Nền tảng cho phần quản lý kế toán/tài chính nội bộ.

CREATE TABLE IF NOT EXISTS accounting_categories (
  code text PRIMARY KEY,
  name text NOT NULL,
  group_name text NOT NULL,
  is_expense boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id serial PRIMARY KEY,
  transaction_date text NOT NULL,
  transaction_month text NOT NULL,
  description text NOT NULL,
  amount double precision NOT NULL,
  direction text NOT NULL DEFAULT 'out',
  category_code text NOT NULL REFERENCES accounting_categories(code),
  management_group text,
  payer text,
  recipient text,
  has_invoice boolean NOT NULL DEFAULT false,
  invoice_no text,
  invoice_valid boolean,
  source_file text NOT NULL,
  source_row integer,
  dedup_key text NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ft_month ON financial_transactions(transaction_month);
CREATE INDEX IF NOT EXISTS idx_ft_category ON financial_transactions(category_code);
CREATE INDEX IF NOT EXISTS idx_ft_source ON financial_transactions(source_file);
CREATE INDEX IF NOT EXISTS idx_ft_payer ON financial_transactions(payer);

-- Seed chart of accounts (theo TT200 simplified — khớp classifier)
INSERT INTO accounting_categories (code, name, group_name, is_expense, display_order) VALUES
  ('6421', 'Chi phí nhân viên quản lý', 'Chi phí quản lý', true, 10),
  ('6427-rent', 'Thuê văn phòng + tiện ích', 'Chi phí quản lý', true, 20),
  ('6427-svc', 'Dịch vụ mua ngoài', 'Chi phí quản lý', true, 30),
  ('6417', 'Chi phí bán hàng — Marketing', 'Chi phí quản lý', true, 40),
  ('153-211', 'Thiết bị / TSCĐ', 'Chi phí quản lý', true, 50),
  ('6428', 'Vận hành khác', 'Chi phí quản lý', true, 60),
  ('6425', 'Thuế / Phí NN', 'Chi phí quản lý', true, 70),
  ('635', 'Chi phí tài chính', 'Chi phí quản lý', true, 80),
  ('632', 'HH sale / Thù lao sale', 'Giá vốn dịch vụ', true, 90),
  ('secondary', 'Chi phí thứ cấp (loại)', 'Loại trừ', false, 95),
  ('411', 'Vốn góp CSH', 'Vốn / Tài sản', false, 100),
  ('244', 'Ký quỹ dài hạn', 'Vốn / Tài sản', false, 110),
  ('3411', 'Vay chủ / hoàn nội bộ', 'Công nợ', false, 120),
  ('131', 'Phải thu khách (cọc hộ)', 'Vốn / Tài sản', false, 130),
  ('unclassified', 'Chưa phân loại', 'Cần dò', true, 999)
ON CONFLICT (code) DO NOTHING;
