-- 2026-08-11: Bảng contracts — source of truth cho rates hợp đồng đại lý.
-- 1 hợp đồng = 1 dự án × 1 CĐT × 1 thời kỳ. 1 dự án có thể có nhiều hợp đồng
-- (VD The Emerald Garden View có 4 hợp đồng: Dataloca 2025/2026, Zland 2026, Vạn Xuân 2026).
--
-- Import từ sheet 1_HOP DONG trong BAO CAO DOANH THU.xlsx.

CREATE TABLE IF NOT EXISTS contracts (
  id serial PRIMARY KEY,
  project_code text NOT NULL,             -- BCGE_BCOH, AVIO_BAML...
  project_id integer REFERENCES projects(id) ON DELETE SET NULL,
  partner_id integer REFERENCES partners(id) ON DELETE SET NULL,
  partner_name text,                       -- Bcons Homes, Dataloca 2025...

  contract_number text,                    -- "02/2024/HĐLKMG/BHM-BRE"
  status text DEFAULT 'active',            -- 'active' | 'expired' | 'terminated'

  -- Rates (từ Excel columns)
  pmg_lk double precision,                 -- % PMG_LK (rate CĐT trả BRE tối đa)
  pmg_lk_sale double precision,            -- % PMG_LK_sale (rate BRE trả sale tối đa)
  pmg_structure text,                      -- Biểu PMG (text mô tả rate tier: theo số căn / theo %)
  admin_fee double precision,              -- Phí admin (gồm VAT)
  admin_fee_sale double precision,         -- Phí admin sale (gồm VAT)

  -- Payment terms
  payment_phases integer,                  -- Số đợt thanh toán (1-5)
  pmg_phase_1 text,                        -- Text (có thể "70% PMG" hoặc 0.7)
  pmg_phase_2 text,
  pmg_phase_3 text,
  pmg_phase_4 text,
  pmg_phase_5 text,

  -- Bonuses (default cho hợp đồng)
  cdt_bonus_sale double precision,         -- CĐT thưởng sale (gồm VAT)
  cdt_bonus_manager text,                  -- CĐT thưởng QL (có thể là range: "5,000,000-10,000,000")

  source_file text,
  source_row integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_partner ON contracts(partner_id);
CREATE INDEX IF NOT EXISTS idx_contracts_code ON contracts(project_code);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contracts_project_partner
  ON contracts(project_code, partner_name);
