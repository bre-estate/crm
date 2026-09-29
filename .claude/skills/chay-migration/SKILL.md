---
name: chay-migration
description: Dùng khi cần đổi cấu trúc database hoặc chuyển dữ liệu hàng loạt trong dự án này: thêm bớt cột, thêm bảng, đổi tên khóa trong cột JSON, dọn dữ liệu sai. Cũng dùng khi cần viết truy vấn sql.raw hay db.execute phức tạp.
---

# Viết và chạy migration

## Cảnh báo trước tiên

**Không có database chạy ở máy.** Mọi môi trường nối thẳng Supabase, nên mọi
lệnh ghi đều đụng dữ liệu thật đang vận hành. Chỉ chạy lệnh đọc khi thử
nghiệm. Đã có lần ghi đè mất lựa chọn của người dùng vì chạy thử lệnh ghi
trong lúc họ đang thao tác trên giao diện.

## Quy trình

**1. Viết tay file SQL** vào `drizzle/00xx_ten_viec.sql`, đánh số tiếp theo số
lớn nhất đang có. Không dùng `drizzle-kit generate`: phần lớn thay đổi ở dự án
này cần kèm chuyển dữ liệu chứ không chỉ đổi cấu trúc.

Đầu file ghi comment nói **vì sao** cần migration này, không chỉ nói nó làm gì.
Người đọc sau cần biết bối cảnh.

**2. Viết script nạp tạm:**

```ts
// scripts/chay-migration.ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";

async function main() {
  await db.execute(sql.raw(readFileSync(process.argv[2], "utf8")));
  console.log(`Đã chạy ${process.argv[2]}`);
}
main().then(() => process.exit(0));
```

**3. Chạy:**

```bash
npx tsx --env-file=.env.local scripts/chay-migration.ts drizzle/00xx_ten_viec.sql
```

Postgres chạy cả tệp trong một giao dịch nên sai ở giữa là quay lui hết. Thất
bại thì đọc kỹ lỗi, sửa file SQL, chạy lại.

**4. Đối chiếu bằng truy vấn đọc**, in ra số trước và sau.

**5. Cập nhật `lib/schema.ts`** cho khớp cấu trúc mới.

**6. `npx tsc --noEmit` và `npm run build`.**

**7. Xóa `scripts/chay-migration.ts`**, rồi commit cả file SQL lẫn thay đổi
schema.

## Bẫy đã vấp

**`tsc` và `npm run build` KHÔNG kiểm được `sql.raw`.** Truy vấn viết tay phải
chạy thật với dữ liệu thật trước khi đẩy lên. Trang Giá vốn đã từng sập vì một
bí danh cột không hợp lệ mà cả hai lệnh trên đều báo sạch.

Cách chạy thử một file có `import "server-only"`:

```bash
sed '/^import "server-only";$/d' lib/X.ts > lib/_thu_X.ts
# viết script import lib/_thu_X.ts, chạy, rồi
rm -f lib/_thu_X.ts
```

**Postgres không cho tham chiếu bí danh cột trong cùng một SELECT.** Viết
thẳng biểu thức ra, đừng đặt bí danh rồi dùng lại ở cột khác.

**Ràng buộc CHECK cũ có thể chặn.** Đổi tập giá trị hợp lệ của một cột thì nhớ
`ALTER TABLE ... DROP CONSTRAINT IF EXISTS ..._check`.

**Khóa ngoại có thể chặn xóa.** Trước khi xóa một dòng danh mục, quét mọi bảng
trỏ tới nó:

```sql
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'ten_bang';
```

**Đổi tên khóa trong cột JSON phải đổi ở mọi bảng chứa nó.** Đổi khóa quyền mà
quên `user_permissions` là người dùng mất quyền.

**Bảng mới cần RLS.** Bảng nghiệp vụ bật RLS không luật (app đọc qua Drizzle
nên đi vòng qua). Bảng nào middleware đọc qua PostgREST thì phải có luật
SELECT cho `authenticated`, không thì chặn sạch mọi người.
