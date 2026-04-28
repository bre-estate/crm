-- ============================================================
-- Row Level Security cho toàn bộ app
-- ============================================================
-- App dùng DATABASE_URL (postgres role, bypass RLS) nên data flow trong app
-- không bị ảnh hưởng. RLS chỉ chặn direct REST API access qua anon key
-- (đó là attack surface duy nhất bị hở trước khi bật RLS).
--
-- Strategy: enable RLS trên mọi bảng. Mặc định không có policy = không ai
-- truy cập được qua REST API. Riêng `profiles` cho phép user đọc/sửa
-- profile của chính mình (cho phép UI client hiển thị role nếu cần sau này).
--
-- Chạy 1 lần trong Supabase SQL Editor.
-- ============================================================

-- 1. Enable RLS on all app tables
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmg_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments_out ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. profiles policies: user đọc được profile của mình; admin đọc/sửa được tất cả

-- Drop policies cũ (idempotent)
DROP POLICY IF EXISTS "users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "users can update own profile (limited)" ON public.profiles;

-- User đọc được profile của mình
CREATE POLICY "users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Admin đọc được mọi profile
CREATE POLICY "admins can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin đổi được role/email của user khác
CREATE POLICY "admins can update profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- 3. Tất cả bảng còn lại: KHÔNG tạo policy nào.
-- Mặc định RLS không cho ai truy cập qua REST API.
-- App vẫn truy cập được vì dùng DATABASE_URL (postgres role bypass RLS).
