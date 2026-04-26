# Hướng dẫn deploy app BRE lên cloud

Mục tiêu: đưa app lên `https://crm.bre.vn` để CEO/Admin/Kế toán vào dùng.

**Stack:** Next.js → Vercel (hosting) · Supabase (Postgres DB + Auth với Google login).

---

## Checklist tổng quan

- [ ] 1. Tạo account GitHub
- [ ] 2. Tạo account Vercel
- [ ] 3. Tạo project Supabase (region Singapore)
- [ ] 4. Copy env vars về máy local (`.env.local`)
- [ ] 5. Chạy DB migration + import data lên Supabase
- [ ] 6. Bật Google OAuth (Supabase + Google Cloud Console)
- [ ] 7. Push code lên GitHub (private repo)
- [ ] 8. Import repo vào Vercel + paste env vars
- [ ] 9. Thêm DNS record `crm.bre.vn` → Vercel (qua PA Việt Nam)
- [ ] 10. Mời CEO/Admin/Kế toán bằng email → họ login Google

---

## Bước 1 — GitHub account (5 phút)

1. Mở https://github.com/signup
2. Sign up với email công ty (tốt hơn email cá nhân)
3. Bật 2FA: **Settings → Password and authentication → Two-factor authentication** → dùng app Authenticator (Google Authenticator / 1Password) hoặc SMS
4. Ghi chú username cho mình.

---

## Bước 2 — Vercel account (3 phút)

1. Mở https://vercel.com/signup
2. Click **"Continue with GitHub"** → authorize
3. Tên team/project: để mặc định
4. Plan: **Hobby** (free). Xong.

---

## Bước 3 — Supabase project (10 phút)

1. Mở https://supabase.com/dashboard
2. **"Continue with GitHub"** → authorize
3. Click **"New project"**:
   - Organization: default
   - Name: `bre-app`
   - Database Password: click "Generate a password", rồi **copy lưu vào password manager** (sẽ dùng nhiều lần)
   - Region: **Southeast Asia (Singapore)** ← quan trọng
   - Plan: Free
4. Đợi 1-2 phút cho provisioning.
5. Sau khi project tạo xong, vào **Project Settings**:

   **a. API keys** (Settings → API):
   - Copy `Project URL` → là `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon public` key → là `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   **b. Database connection** (Settings → Database → Connection string):
   - Chọn tab **"Transaction pooler"** (quan trọng!)
   - Copy chuỗi `postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
   - Thay `[YOUR-PASSWORD]` bằng password đã lưu ở bước 3
   - Đây là `DATABASE_URL`

---

## Bước 4 — Local env (2 phút)

Ở máy của bạn, mở Terminal:

```bash
cd /Users/trietnguyen/Documents/Company/BRE/App
cp .env.example .env.local
```

Mở `.env.local` và paste 3 giá trị vừa copy ở bước 3 vào.

---

## Bước 5 — Migrate DB + import data (5 phút)

Vẫn ở Terminal, chạy:

```bash
# Tạo các bảng trong Supabase Postgres
npx tsx scripts/migrate.ts

# Thêm trigger auto-create profile khi user signup — làm thủ công qua Supabase SQL editor:
# Mở Supabase Dashboard → SQL editor → New query
# Copy-paste toàn bộ nội dung file: drizzle/0001_profiles_trigger.sql
# → Run

# Import data từ file Excel cũ
npx tsx scripts/import-excel.ts
```

Sau khi chạy xong:
- Vào Supabase Dashboard → **Table Editor** để kiểm tra các bảng đã có data (partners 10, projects 13, products 52, v.v.)

---

## Bước 6 — Bật Google OAuth (10 phút)

### 6a. Google Cloud Console

1. Mở https://console.cloud.google.com/
2. Tạo project mới: tên `BRE App`
3. Menu bên trái → **APIs & Services → OAuth consent screen**:
   - User Type: **External**
   - App name: `BRE`
   - User support email: email của bạn
   - Developer email: email của bạn
   - Save & Continue (các bước sau để mặc định cũng được)
4. **Credentials → + CREATE CREDENTIALS → OAuth client ID**:
   - Application type: **Web application**
   - Name: `BRE Web`
   - Authorized redirect URIs: **thêm đúng URL Supabase** (lấy ở bước 6b dưới đây, quay lại paste vào)
5. Sau khi create, copy **Client ID** và **Client Secret**

### 6b. Supabase Auth

1. Supabase Dashboard → **Authentication → Providers → Google** → toggle **Enable**
2. Copy **"Callback URL (for OAuth)"** ở đây — dạng `https://xxxxx.supabase.co/auth/v1/callback`
3. Quay lại Google Cloud Console, paste URL này vào **Authorized redirect URIs** → Save
4. Quay lại Supabase, paste **Client ID** và **Client Secret** → Save

### 6c. Cấu hình Site URL (để redirect đúng sau login)

Supabase Dashboard → **Authentication → URL Configuration**:
- Site URL: `https://crm.bre.vn` (sẽ trỏ về sau, paste trước cũng được)
- Redirect URLs (thêm cả 2):
  - `https://crm.bre.vn/**`
  - `http://localhost:3000/**` (cho dev local)

---

## Bước 7 — Push code lên GitHub (5 phút)

Ở Terminal:

```bash
cd /Users/trietnguyen/Documents/Company/BRE/App

# Init git + commit đầu
git init
git add .
git commit -m "Initial BRE app — Postgres + Supabase Auth"

# Tạo repo trên GitHub (web UI):
# → https://github.com/new
# → Repository name: bre-app
# → Private: YES
# → KHÔNG tick "Initialize with README" (repo phải rỗng)
# → Create

# Push lên
git remote add origin https://github.com/YOUR_USERNAME/bre-app.git
git branch -M main
git push -u origin main
```

---

## Bước 8 — Deploy Vercel (5 phút)

1. Vercel Dashboard → **"Add New... → Project"**
2. Chọn repo `bre-app` vừa push (có thể cần authorize Vercel vào GitHub)
3. **Environment Variables** — paste 3 biến giống `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `DATABASE_URL`
4. Click **Deploy**. Đợi ~2 phút.
5. Xong: Vercel cho bạn URL kiểu `bre-app-xxx.vercel.app` → thử vào xem app chạy được chưa.

---

## Bước 9 — DNS: trỏ `crm.bre.vn` về Vercel (5 phút trên portal + 5-30 phút đợi DNS)

### Lấy DNS target từ Vercel

1. Vercel Dashboard → project `bre-app` → **Settings → Domains**
2. Nhập `crm.bre.vn` → Add
3. Vercel sẽ show dòng:
   ```
   Type: CNAME
   Name: crm
   Value: cname.vercel-dns.com
   ```

### Add record tại PA Việt Nam

**Cách A — Tự làm** (nếu còn quyền truy cập `my.pavietnam.vn`):
1. Đăng nhập `my.pavietnam.vn`
2. Tìm domain `bre.vn` → **Quản lý DNS**
3. Thêm record:
   - Type: `CNAME`
   - Name/Host: `crm`
   - Value/Target: `cname.vercel-dns.com`
   - TTL: `3600`
4. Save

**Cách B — Nhờ đơn vị web cũ**:
Gửi email / nhắn tin nội dung:
> Mình cần thêm 1 subdomain cho domain bre.vn. Nhờ bạn add giúp 1 DNS record như sau (chỉ thêm mới, không ảnh hưởng website/email hiện tại):
> ```
> Type: CNAME
> Host: crm
> Value: cname.vercel-dns.com
> TTL: 3600
> ```
> Cảm ơn bạn.

### Đợi DNS propagate

Kiểm tra bằng lệnh (ở Terminal):
```bash
dig crm.bre.vn +short
```
Khi thấy chuỗi kiểu `xxx.cname.vercel-dns.com` là DNS đã ăn. Vercel sẽ tự cấp SSL trong 1-2 phút.

---

## Bước 10 — Cho người khác vào

App mặc định **chỉ cho user đã có profile mới vào được**. Flow:

1. **Bạn (admin) login trước bằng Google** — sau khi vào, DB auto tạo profile role `admin` cho bạn (trigger ở `drizzle/0001_profiles_trigger.sql` đã chạy)
2. CEO / Admin / Kế toán click login Google → DB tạo profile role `viewer` cho họ (mặc định chưa có quyền sửa, chỉ xem)
3. Bạn vào Supabase Dashboard → **Table Editor → profiles** → đổi cột `role` của họ thành `admin` hoặc `accountant`

Role hiện có:
- `admin` — full quyền CRUD
- `accountant` — edit payments (chưa áp dụng ở code, sẽ làm ở iteration sau)
- `viewer` — read-only (chưa áp dụng ở code, sẽ làm ở iteration sau)

---

## Troubleshooting

- **Bug DB connection**: kiểm tra `DATABASE_URL` dùng đúng **Transaction pooler** (port `6543`), không phải **Direct connection** (port `5432`). Supabase pooler cần để serverless hoạt động.
- **Google login báo redirect_uri_mismatch**: quay lại Google Cloud Console, thêm đúng URL callback của Supabase vào Authorized redirect URIs.
- **Sau khi deploy vào thấy trang login nhưng login xong redirect lỗi**: kiểm tra Site URL ở Supabase Auth → URL Configuration phải chính xác.
- **DNS chưa ăn sau 30 phút**: kiểm tra record CNAME đã add đúng chưa (đặc biệt host chỉ là `crm`, không phải `crm.bre.vn`).

---

## Sau khi deploy xong — gửi mình biết 3 thứ

1. URL production (vd `https://crm.bre.vn`)
2. Vercel deployment có lỗi không (check logs ở Vercel dashboard)
3. User đầu tiên đã login Google được chưa

Mình sẽ làm tiếp iteration sau: phân quyền theo role (viewer/accountant không được sửa), form CRUD đầy đủ, import Excel nhẹ qua UI.
