-- 2026-08-08: Bảng trích trước cuối kỳ theo căn (Kim's breakdown).
-- Nguồn: file "251231_Trich truoc 335.xlsx" sheet "Chi tiết GV trích trước".
-- Mỗi row = 1 căn với 7 cột breakdown → sum → bucket P&L khớp Kim BC.

CREATE TABLE IF NOT EXISTS year_end_accruals (
  id serial PRIMARY KEY,
  accrual_date date NOT NULL,             -- 2025-12-31
  unit_code text NOT NULL,                -- Mã căn
  project_name text,                      -- Dự án
  partner_name text,                      -- Đối tác/CĐT
  employee_name text,                     -- NVKD

  -- 7 cột breakdown (khớp bucket Kim BC 2.x)
  hh_sale double precision DEFAULT 0,          -- Kim BC 2.1
  cdt_bonus_sale double precision DEFAULT 0,   -- Kim BC 2.3
  cty_bonus_ql double precision DEFAULT 0,     -- Kim BC 2.5 (thưởng nóng QL)
  kpi_ceo double precision DEFAULT 0,          -- Kim BC 2.8
  kpi_tpkd double precision DEFAULT 0,         -- Kim BC 2.6
  bonus_admin double precision DEFAULT 0,      -- Kim BC 2.7
  customer_support double precision DEFAULT 0, -- Kim BC 2.2 (hỗ trợ khách)

  total_amount double precision DEFAULT 0,     -- Tổng row

  source_file text,
  source_row integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(accrual_date, unit_code, employee_name)
);

CREATE INDEX IF NOT EXISTS idx_yea_date ON year_end_accruals(accrual_date);
CREATE INDEX IF NOT EXISTS idx_yea_unit ON year_end_accruals(unit_code);

-- Bảng flat khác: các trích trước KHÔNG gắn căn (KPI năm, thưởng khác)
-- VD trong file "Chi tiet 335": mục #8 (10M thưởng đạt DS) + #9 (25M top DS)
CREATE TABLE IF NOT EXISTS year_end_other_accruals (
  id serial PRIMARY KEY,
  accrual_date date NOT NULL,
  description text NOT NULL,
  category text NOT NULL,  -- bucket P&L
  amount double precision NOT NULL,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yeoa_date ON year_end_other_accruals(accrual_date);
CREATE INDEX IF NOT EXISTS idx_yeoa_category ON year_end_other_accruals(category);
