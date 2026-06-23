-- ============================================================
-- Performance indexes
-- ============================================================
-- Tạo idempotent — chạy nhiều lần OK.
-- ============================================================

-- products: hay query theo project, department, sale_type, deposit_date
CREATE INDEX IF NOT EXISTS products_project_id_idx ON public.products (project_id);
CREATE INDEX IF NOT EXISTS products_department_id_idx ON public.products (department_id);
CREATE INDEX IF NOT EXISTS products_sale_type_idx ON public.products (sale_type);
CREATE INDEX IF NOT EXISTS products_deposit_date_idx ON public.products (deposit_date DESC);
CREATE INDEX IF NOT EXISTS products_recognition_month_idx ON public.products (recognition_month);

-- projects: lookup partner
CREATE INDEX IF NOT EXISTS projects_partner_id_idx ON public.projects (partner_id);
CREATE INDEX IF NOT EXISTS projects_name_idx ON public.projects (name);

-- revenue_recons: hay join với products, sort theo date
CREATE INDEX IF NOT EXISTS revenue_recons_product_id_idx ON public.revenue_reconciliations (product_id);
CREATE INDEX IF NOT EXISTS revenue_recons_invoice_id_idx ON public.revenue_reconciliations (invoice_id);
CREATE INDEX IF NOT EXISTS revenue_recons_date_idx ON public.revenue_reconciliations (reconciliation_date DESC);

-- cost_recons
CREATE INDEX IF NOT EXISTS cost_recons_product_id_idx ON public.cost_reconciliations (product_id);
CREATE INDEX IF NOT EXISTS cost_recons_type_idx ON public.cost_reconciliations (cost_type);
CREATE INDEX IF NOT EXISTS cost_recons_employee_idx ON public.cost_reconciliations (employee_name);
CREATE INDEX IF NOT EXISTS cost_recons_date_idx ON public.cost_reconciliations (reconciliation_date DESC);

-- payments
CREATE INDEX IF NOT EXISTS payments_in_rec_id_idx ON public.payments_in (reconciliation_id);
CREATE INDEX IF NOT EXISTS payments_out_cost_id_idx ON public.payments_out (cost_reconciliation_id);

-- invoices
CREATE INDEX IF NOT EXISTS invoices_partner_id_idx ON public.invoices (partner_id);
CREATE INDEX IF NOT EXISTS invoices_date_idx ON public.invoices (invoice_date DESC);
