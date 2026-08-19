-- Enable RLS trên 9 bảng còn thiếu — Supabase Advisor báo rls_disabled_in_public
-- + sensitive_columns_exposed (bank_transactions.account_number,
-- rentals.landlord_phone, ...) ngày 2026-08-17.
--
-- App KHÔNG dùng supabase client-side query bảng — mọi query qua Drizzle với
-- postgres role (BYPASSRLS=true). Enable RLS + 0 policy = default DENY từ
-- anon/authenticated, server actions không bị ảnh hưởng.

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE secondary_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_end_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_end_other_accruals ENABLE ROW LEVEL SECURITY;
