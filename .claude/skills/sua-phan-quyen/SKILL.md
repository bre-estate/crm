---
name: sua-phan-quyen
description: Dùng khi thêm hoặc sửa quyền truy cập, thêm vị trí công việc, thêm trang mới cần phân quyền, thêm tài nguyên vào bảng phân quyền, hoặc khi ai đó báo không vào được một trang mà đáng lẽ phải vào được.
---

# Sửa phân quyền

## Mô hình

Một danh mục duy nhất vừa là chức danh vừa là đơn vị cấp quyền: bảng
`positions`. Vai trò của tài khoản chính là **mã vị trí**, trừ hai giá trị đặc
biệt `owner` (toàn quyền) và `custom` (quyền riêng ở `user_permissions`).

Phần lớn việc phân quyền **không cần sửa code**: trang `/admin/positions` thêm
vị trí, trang `/admin/permissions` cấp quyền. Chỉ sửa code khi thêm **tài
nguyên mới**.

## Thêm một tài nguyên mới (khi có trang mới)

Sửa `lib/permissions.ts`, đủ bốn chỗ:

1. `RESOURCE_ACTIONS` nếu tài nguyên không chỉ có `view`
2. `RESOURCES`: khóa và nhãn tiếng Việt
3. `RESOURCE_GROUPS`: xếp vào đúng nhóm, thứ tự khớp menu
4. `resourceOfPath()`: ánh xạ đường dẫn

Rồi thêm mục vào `NAV` của `components/AppSidebar.tsx`, và gọi
`requirePermission("tai_nguyen")` ở đầu trang.

Tiền tố khóa phải khớp nhóm menu: `admin.*` cho nhóm Quản trị, `reports.*` cho
báo cáo, còn lại để trơn.

## Ba tầng chặn, kiểm cả ba

1. **Middleware** (`lib/supabase/middleware.ts`) chặn theo đường dẫn.
2. **Trang** gọi `requirePermission()` ở đầu hàm.
3. **Lệnh ghi** gọi `requirePermission(tài_nguyên, "edit")`.

Tầng 1 không thay được tầng 2. Menu ẩn theo quyền mà trang khóa cứng theo chủ
tài khoản thì người được cấp quyền bấm vào ra trang không tồn tại. Lỗi này đã
xảy ra ba lần: trang Thông báo, trang Phòng ban, trang Nhân viên.

## Bẫy nguy hiểm nhất

**Luôn dùng `quyenCua(user, ...)` của `lib/auth.ts`.** Không gọi thẳng
`hasPermission()` đồng bộ của `lib/permissions.ts`: hàm đó cần bảng quyền vị
trí ở tham số cuối, quên là nó lặng lẽ rơi về preset cũ trong code và trả kết
quả sai.

Middleware không dùng được `quyenCua` vì chạy ở tầng khác, nó phải tự đọc bảng
`positions` qua PostgREST rồi truyền vào `resolvePermissions()`. Đã có lần
quên bước này và CEO bị chặn khỏi **mọi trang**.

## Kiểm sau khi sửa

Chạy lệnh đọc, in ra ai vào được trang nào:

```ts
import { resolvePermissions, resourceOfPath } from "@/lib/permissions";
// nạp positions + user_permissions, rồi với từng người và từng đường dẫn:
// resolvePermissions(u.role, u.permissions, quyenViTri)[resourceOfPath(duong)]
```

Đối chiếu với bốn tài khoản thật: Triết (owner), Bách (ceo), Thúy (admin),
Nga (hr). Đừng chỉ tin `tsc` chạy sạch.

## Nguyên tắc nghiệp vụ

Trưởng phòng kinh doanh **không thấy tiền của công ty**: không Dòng tiền, Lãi
lỗ quản trị, Cân đối kế toán, Phân tích chi phí, KPI dashboard, Nghĩa vụ tài
chính, Tuổi nợ phải trả, Vốn góp. Cũng không Lãi lỗ theo dự án và per căn vì
lộ cơ cấu giá vốn.

Có `edit` hoặc `delete` thì phải có `view`.
