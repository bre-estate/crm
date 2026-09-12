-- Bảng lương theo tháng, từng người, đọc từ Drive 4.1-Bảng lương (sheet 3-Bangluong-HĐLĐ và Bangluong-CTV).
-- Dùng để tách phần lương cứng ra khỏi lệnh chuyển gộp "lương + hoa hồng" trên sao kê.
CREATE TABLE IF NOT EXISTS payroll_months (
  id serial PRIMARY KEY,
  month text NOT NULL,                 -- YYYY-MM
  kind text NOT NULL,                  -- hdld | ctv
  code text,                           -- NV-xxx nếu có
  name text NOT NULL,
  position text,
  base_salary double precision NOT NULL DEFAULT 0,   -- lương cơ bản hoặc thù lao CTV
  allowances double precision NOT NULL DEFAULT 0,    -- phụ cấp, chuyên cần, khoán, hỗ trợ ăn/xăng/điện thoại
  commission double precision NOT NULL DEFAULT 0,    -- hoa hồng (bảng tính)
  bonus double precision NOT NULL DEFAULT 0,         -- thưởng doanh số, tháng 13, danh hiệu, thưởng khác
  gross_total double precision,                      -- tổng cộng theo sheet nếu có
  source_file text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, kind, name)
);
