-- Migration: employees.alias_of_id
-- Cho phép flag 1 NV là "alias" (tên đứng bán trên chứng từ) của người khác.
-- Reports sẽ resolve alias → owner khi group doanh số.
-- Idempotent.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS "alias_of_id" integer REFERENCES public.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.employees.alias_of_id IS 'Nếu set → NV này chỉ đứng tên trên chứng từ, doanh số thực về employee được ref (owner). Owner không có alias_of_id (null).';

CREATE INDEX IF NOT EXISTS "employees_alias_of_idx" ON public.employees ("alias_of_id");
