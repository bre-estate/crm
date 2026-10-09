<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes, APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BRE CRM

Phần mềm nội bộ quản lý sàn giao dịch bất động sản, **đang vận hành thật** tại
crm.bre.vn. Đặc tả đầy đủ ở `docs/SPEC_TONG_QUAN.md`, đọc mục 7 trước khi sửa
gì liên quan tới nghiệp vụ.

Quy trình cho từng loại việc nằm ở `.claude/skills/`, tự nạp khi gặp đúng việc.

## Không có database chạy ở máy

Mọi môi trường nối thẳng Supabase. **Mọi lệnh ghi đều đụng dữ liệu thật đang
vận hành.** Thử nghiệm chỉ chạy lệnh đọc. Cần ghi để kiểm chứng thì hỏi trước.

## Bốn luật bắt buộc

**1. Lỗi phải TRẢ VỀ, không được ném.** Next.js ở môi trường thật che toàn bộ
lỗi ném ra từ server action, người dùng chỉ thấy một dòng lỗi hệ thống vô
nghĩa. Dùng `chay()` và `cauLoi()` ở `lib/actions/ket-qua.ts`, trả
`{ error: "câu tiếng Việt dễ hiểu" }`. Phía giao diện dùng `baoLoi()` ở
`lib/bao-loi.ts`.

**2. `sql.raw` không được `tsc` hay `npm run build` kiểm.** Truy vấn viết tay
phải chạy thật với dữ liệu thật trước khi đẩy lên.

**3. Kiểm quyền dùng `quyenCua(user, ...)` của `lib/auth.ts`.** Không gọi
thẳng `hasPermission()` đồng bộ của `lib/permissions.ts`: hàm đó cần bảng
quyền vị trí ở tham số cuối, quên là nó lặng lẽ trả kết quả sai.

**4. Trang phải tự kiểm quyền** bằng `requirePermission()`, không dựa vào việc
menu đã ẩn. Menu ẩn mà trang khóa cứng theo chủ tài khoản thì người được cấp
quyền bấm vào ra trang không tồn tại.

## Viết chữ hiển thị

- Tiếng Việt toàn bộ, không lẫn tiếng Anh vào câu tiếng Việt.
- **Không dùng gạch dài.** Thay bằng dấu phẩy, hai chấm, hoặc câu mới.
- Xưng "bạn", không xưng "anh".
- Câu lỗi phải nói rõ sai ở đâu và sửa thế nào, không phải mã lỗi hệ thống.

## Kiểm trước khi khẳng định

Mỗi khẳng định về số liệu phải gắn với một **phép thử chạy được**:

```bash
npx tsx --env-file=.env.local scripts/kiem-bat-bien.ts
```

Mười ba phép thử trên mọi trường số quan trọng. Chạy trước khi kết luận, và
chạy lại sau mỗi lần sửa dữ liệu. Không có phép thử nào phân biệt được đúng
sai thì **không sửa**, hỏi người phụ trách.

Nói rõ đang ở mức nào, đừng trộn ba mức vào một câu:

| Mức | Cách nói |
|---|---|
| Dữ kiện đọc được | "dòng 6117 ghi 10.000.000" |
| Trích lời, có nguồn | "Admin nói trong tin nhắn 06/10 lúc 10:59" |
| Mình suy ra | "công thức này mình suy ra, chưa ai xác nhận" |

Chi tiết ở `.claude/skills/kiem-chung-so-lieu/`, kèm danh sách tiền lệ đã
sai và nguồn sự thật cho từng loại số.

## Vài quy tắc nghiệp vụ hay quên

Danh sách đầy đủ ở mục 7 của `docs/SPEC_TONG_QUAN.md`. Bốn cái hay vấp nhất:

- **Doanh thu một căn có ba trần tách rời**: hoa hồng, CĐT thưởng sale, CĐT
  thưởng quản lý. Không cộng lại rồi so với một trần chung.
- **`phase_pct_this_time` là lũy kế**, không được cộng dồn.
- **Phòng ghi trên căn là phòng lúc bán**, không đổi theo khi người bán chuyển
  đội. Sửa NVKD không được đè lên phòng đã ghi của căn cũ.
- **Tên người là khóa nối** giữa `products.sales_person` và bảng nhân sự.
  Không bao giờ nối thêm chữ vào giá trị đó.

## Lệnh hay dùng

```bash
npm run dev
npm run build
npx tsc --noEmit
npm test
npx tsx --env-file=.env.local scripts/<ten>.ts
```
