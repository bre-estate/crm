-- Chính sách lương + hoa hồng theo vai trò + giai đoạn thời gian.
-- Nguồn: docs/Chính Sách Lương/ (6 file .docx từ TGĐ Đoàn Lê Bách).
CREATE TABLE IF NOT EXISTS commission_policies (
  id serial PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('nvkd', 'ctv', 'tpkd', 'admin')),
  effective_from date NOT NULL,
  effective_to date,
  cycle_months int NOT NULL DEFAULT 2,
  -- HH sale NVKD: tier theo doanh số cá nhân trong kỳ
  --   base_rate = level 1 (dưới ngưỡng)
  --   tiers = [{threshold, rate}] (level 2+)
  -- CTV flat rate: chỉ set base_rate, không có tiers
  -- Admin KPI: chỉ set base_rate (0.25% hoặc 0.5%)
  base_rate numeric,
  tiers jsonb,
  -- Lương cứng
  base_salary numeric,
  probation_salary numeric,
  apprentice_salary numeric,
  -- Thưởng doanh số NVKD
  bonus_floor numeric,
  bonus_step numeric,
  bonus_step_amount numeric,
  bonus_cycle_multiplier numeric DEFAULT 1,
  bonus_cap_per_cycle numeric,
  -- TPKD HH quản lý theo doanh số phòng
  manager_bonus_tiers jsonb,
  -- TPKD lương theo số NVKD phòng
  manager_salary_tiers jsonb,
  manager_probation_salary numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, effective_from)
);

CREATE INDEX IF NOT EXISTS commission_policies_role_date_idx
  ON commission_policies (role, effective_from);
