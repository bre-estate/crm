# BRE — App quản lý sàn giao dịch BĐS

App nội bộ cho Công ty TNHH Sàn giao dịch BĐS BRE.

## Stack

- **Next.js 16** (App Router, Turbopack) — React full-stack
- **TypeScript** + **TailwindCSS 4**
- **Drizzle ORM** + **better-sqlite3** — DB local SQLite file
- **xlsx** (SheetJS) — import từ Excel
- **zod** — validate form

## Chạy app

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## DB — SQLite

File DB: `data/bre.db` (tự tạo lần đầu).

**Chạy migration** (nếu schema đổi):
```bash
npx drizzle-kit generate
npx tsx scripts/migrate.ts
```

**Import data từ Excel**:
```bash
npx tsx scripts/import-excel.ts
```
Script sẽ XÓA toàn bộ DB và import lại từ file
`/Users/trietnguyen/Documents/Company/Artonis/App/BRE/BAO CAO DOANH THU.xlsx`.

## Cấu trúc

```
app/
  page.tsx              # Dashboard tổng quan
  layout.tsx            # Sidebar nav
  partners/             # Đối tác (CĐT/F1/F2)
  projects/             # Dự án + HĐ
  products/             # Giao dịch (căn chốt)
  revenues/             # Đối chiếu DT với CĐT/F1
  costs/                # Đối chiếu GV nội bộ
  reports/              # Báo cáo tổng hợp
lib/
  db.ts                 # Drizzle instance
  schema.ts             # 9 bảng DB
  format.ts             # Format VND/%/ngày
  actions/              # Server actions
scripts/
  migrate.ts            # Run migrations
  import-excel.ts       # Import Excel -> SQLite
drizzle/                # Migration SQL (auto-generated)
data/
  bre.db                # SQLite file (gitignored)
```

## Flow nghiệp vụ (tương ứng Excel)

| Excel sheet | App module | Bảng DB |
|---|---|---|
| 9_DANH MUC | Đối tác | `partners` |
| 1_HOP DONG | Dự án / HĐ | `projects` + `pmg_tiers` |
| 2.1_TT DU AN | Giao dịch | `products` |
| 2.2_Doanh thu | Doanh thu | `revenue_reconciliations` + `invoices` + `payments_in` |
| 2.3_Gia von | Giá vốn | `cost_reconciliations` + `payments_out` |
| 3_BC | Báo cáo | (view tổng hợp) |
