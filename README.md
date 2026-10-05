# BRE CRM

Phần mềm nội bộ quản lý sàn giao dịch bất động sản, của Công ty TNHH Sàn giao
dịch Bất động sản BRE. Đang chạy thật tại [crm.bre.vn](https://crm.bre.vn).

Đặc tả đầy đủ: [`docs/SPEC_TONG_QUAN.md`](docs/SPEC_TONG_QUAN.md). Đọc file đó
trước khi sửa gì liên quan tới nghiệp vụ, đặc biệt là mục 7 về quy tắc nghiệp
vụ, mỗi quy tắc ở đó đều sinh ra từ một lỗi thật.

## Nền tảng

| | |
|---|---|
| Khung | Next.js 16 App Router, Turbopack |
| Ngôn ngữ | TypeScript |
| Giao diện | TailwindCSS 4 |
| Cơ sở dữ liệu | Supabase Postgres, truy cập qua Drizzle ORM |
| Đăng nhập | Supabase Auth với Google OAuth |
| Lưu tệp | Supabase Storage, đồng thời đẩy lên Google Drive |
| Đọc Excel | xlsx (SheetJS) |
| Kiểm tra dữ liệu nhập | zod |
| Kiểm thử | Vitest |
| Triển khai | Vercel |

## Chạy ở máy

Cần `.env.local` với các biến sau:

```
DATABASE_URL=                  # chuỗi kết nối Supabase Postgres
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_CLIENT_ID=              # cho tích hợp Drive
GOOGLE_CLIENT_SECRET=          # đặt là Sensitive trên Vercel
NEXT_PUBLIC_GOOGLE_API_KEY=    # cho Google Picker
BRE_CRM_KEY=
```

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # dựng bản phát hành
npm test        # chạy Vitest
```

Không có database chạy ở máy. Mọi môi trường đều nối thẳng vào Supabase, nên
**mọi lệnh ghi đều đụng dữ liệu thật**. Chỉ chạy lệnh đọc khi thử nghiệm.

## Cơ sở dữ liệu

37 bảng, khai báo ở `lib/schema.ts`. Migration là các file SQL đánh số trong
`drizzle/`, hiện có 60 file.

Cách làm hiện nay là **viết tay file SQL** rồi chạy lên database, không dùng
`drizzle-kit generate`. Lý do là nhiều thay đổi cần kèm chuyển dữ liệu chứ
không chỉ đổi cấu trúc, ví dụ đổi tên khóa quyền trong cột JSON.

Nạp bằng `scripts/chay-migration.ts`, truyền một hoặc nhiều file theo thứ tự:

```bash
npx tsx --env-file=.env.local scripts/chay-migration.ts drizzle/00xx_ten_file.sql
npx tsx --env-file=.env.local scripts/chay-migration.ts drizzle/00xx_a.sql drizzle/00yy_b.sql
```

Postgres chạy cả tệp trong một giao dịch, nên sai ở giữa là quay lui hết,
không để lại trạng thái nửa vời.

## Cấu trúc thư mục

```
app/
  page.tsx                 Trang Tổng quan
  layout.tsx               Khung trang, nạp thanh bên
  partners/  projects/     Nguồn hàng
  products/  revenues/     Giao dịch sơ cấp
  costs/  invoices/
  secondary-sales/         Giao dịch thứ cấp
  reports/                 15 báo cáo
  periods/  payroll/       Kế toán
  finance/  expenses/
  employees/  departments/ Tổ chức
  admin/positions/
  admin/permissions/       Phân quyền
  admin/users/
  notifications/           Thông báo
lib/
  schema.ts                37 bảng
  db.ts                    Kết nối Drizzle
  auth.ts                  getCurrentUser, requirePermission, quyenCua
  permissions.ts           Tài nguyên, nhóm, ánh xạ đường dẫn
  to-chuc.ts               Cây phòng ban, màu, loại hợp đồng
  vi-tri.ts                Vị trí và quyền, đọc từ database
  costCalc.ts              computeLuyKe, công thức trần giá vốn
  alerts.ts                Tính thông báo
  actions/                 Server action
  reports/                 Logic từng báo cáo
scripts/                   Nạp dữ liệu và đồng bộ định kỳ
  _archive/                Script việc một lần đã chạy xong
drizzle/                   Migration SQL
docs/                      Đặc tả
```

## Ba điều dễ vấp

**Lỗi ném ra từ server action bị Next.js che.** Ở môi trường thật, người dùng
chỉ thấy một dòng lỗi hệ thống vô nghĩa. Mọi lỗi kiểm tra phải **trả về** dạng
`{ error: "câu tiếng Việt dễ hiểu" }`, dùng `chay()` và `cauLoi()` ở
`lib/actions/ket-qua.ts`.

**`sql.raw` không được `tsc` hay `npm run build` kiểm.** Truy vấn viết tay phải
chạy thật với dữ liệu thật trước khi đẩy lên. Đã có lần trang Giá vốn sập vì
một bí danh cột không hợp lệ mà cả hai lệnh trên đều báo sạch.

**Kiểm quyền phải dùng `quyenCua(user, ...)` của `lib/auth.ts`.** Không gọi
thẳng `hasPermission()` đồng bộ của `lib/permissions.ts`: hàm đó cần truyền
bảng quyền vị trí ở tham số cuối, quên là nó lặng lẽ rơi về preset cũ trong
code và trả kết quả sai.

## Tài liệu khác

| File | Nội dung |
|---|---|
| `docs/SPEC_TONG_QUAN.md` | Đặc tả toàn hệ thống |
| `docs/SPEC-cap-guards.md` | Chặn vượt trần khi đối chiếu |
| `docs/SPEC_KY_HOA_HONG.md` | Kỳ hoa hồng và thưởng hai tháng |
| `docs/SPEC_PNL_QUAN_TRI.md` | Báo cáo lãi lỗ quản trị |
| `HUONG_DAN_NHAP_LIEU.md` | Hướng dẫn nhập liệu cho người dùng |
| `DEPLOY.md` | Triển khai và cấu hình môi trường |
| `TEST_CHECKLIST.md` | Danh mục kiểm thử tay |
