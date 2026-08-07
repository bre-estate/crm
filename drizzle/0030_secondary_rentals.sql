-- Bán thứ cấp (resale F2). Đơn giản hơn sơ cấp: 1 giao dịch = 1 lần chi phí HH.
-- Flow hiện tại: khách CK phí → NV nhận trực tiếp → NV trích % về cty.
CREATE TABLE IF NOT EXISTS secondary_sales (
  id SERIAL PRIMARY KEY,
  unit_code TEXT NOT NULL,
  project_name TEXT,
  sell_price NUMERIC(15, 0) NOT NULL,
  sales_person TEXT NOT NULL,
  deposit_date TEXT, -- YYYY-MM-DD ngày cọc
  completion_date TEXT, -- Ngày công chứng
  recognition_month TEXT, -- YYYY-MM tháng ghi nhận DT
  total_fee NUMERIC(15, 0) NOT NULL, -- Tổng phí HH giao dịch (VD 39.2M)
  commission_rate DOUBLE PRECISION NOT NULL DEFAULT 0.5, -- % NV giữ (default 50%)
  commission_amount NUMERIC(15, 0) NOT NULL DEFAULT 0, -- Thành tiền NV giữ
  company_amount NUMERIC(15, 0) NOT NULL DEFAULT 0, -- Phần cty ăn (= total_fee − commission_amount)
  settlement_status TEXT DEFAULT 'pending', -- pending / settled (NV đã trích % về cty chưa)
  settled_date TEXT, -- Ngày NV chuyển phần cty về
  status TEXT DEFAULT 'processing', -- processing / done / cancelled
  note TEXT,
  source_file TEXT, -- 'excel-tddt' nếu import, null nếu form
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS secondary_sales_deposit_idx ON secondary_sales (deposit_date);
CREATE INDEX IF NOT EXISTS secondary_sales_sales_person_idx ON secondary_sales (sales_person);
CREATE INDEX IF NOT EXISTS secondary_sales_month_idx ON secondary_sales (recognition_month);
CREATE INDEX IF NOT EXISTS secondary_sales_settlement_idx ON secondary_sales (settlement_status);

-- Cho thuê. Mỗi HD = 1 record (gia hạn = record mới, không update).
-- Flow tương tự: khách CK phí → NV nhận → trích % về cty.
CREATE TABLE IF NOT EXISTS rentals (
  id SERIAL PRIMARY KEY,
  unit_code TEXT NOT NULL,
  project_name TEXT,
  landlord_name TEXT, -- Chủ nhà (bên A)
  landlord_phone TEXT,
  tenant_name TEXT NOT NULL, -- Khách thuê (bên B)
  tenant_phone TEXT,
  monthly_rent NUMERIC(15, 0) NOT NULL, -- Giá thuê/tháng
  lease_term_months INTEGER NOT NULL, -- Kỳ hạn HD (số tháng)
  lease_start DATE NOT NULL, -- Ngày bắt đầu
  lease_end DATE, -- Ngày kết thúc (tự tính)
  deposit NUMERIC(15, 0) DEFAULT 0, -- Đặt cọc (thường 1-2 tháng)
  total_fee NUMERIC(15, 0) NOT NULL, -- Phí HH giao dịch (default = 1 tháng rent × term/12, sửa được)
  commission_rate DOUBLE PRECISION NOT NULL DEFAULT 0.5, -- % NV giữ (default 50%)
  commission_amount NUMERIC(15, 0) NOT NULL DEFAULT 0, -- Thành tiền NV giữ
  company_amount NUMERIC(15, 0) NOT NULL DEFAULT 0, -- Phần cty ăn
  settlement_status TEXT DEFAULT 'pending', -- pending / settled
  settled_date DATE, -- Ngày NV chuyển phần cty về
  contract_date DATE NOT NULL, -- Ngày ký HD
  sales_person TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active / ended / cancelled
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rentals_contract_date_idx ON rentals (contract_date);
CREATE INDEX IF NOT EXISTS rentals_sales_person_idx ON rentals (sales_person);
CREATE INDEX IF NOT EXISTS rentals_status_idx ON rentals (status);
CREATE INDEX IF NOT EXISTS rentals_settlement_idx ON rentals (settlement_status);
