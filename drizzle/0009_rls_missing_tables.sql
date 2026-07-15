-- Migration: bật RLS cho các bảng thêm sau 0002_rls_policies.sql
-- Không tạo policy → default DENY qua REST API (anon key).
-- App dùng DATABASE_URL (postgres role) vẫn bypass RLS bình thường.
-- Idempotent.

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
