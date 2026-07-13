# TEST CHECKLIST — BRE CRM

Manual test cases cho các flow mà unit test không cover được (UI, browser autofill, click flow).

Chạy `npm test` cho unit tests (46 tests parse/formula/audit/regression).  
Chạy checklist này cho UI flows.

## Trước khi test

- [ ] Deploy latest commit lên Vercel
- [ ] F5 hard (Cmd+Shift+R) để clear cache
- [ ] Test trên Chrome (nhiều bug autofill là Chrome-specific)

---

## 1. Sửa cấu hình căn có recon (căn 655 = B1-14-10 là canonical)

### 1.1. Adjustment %PMG_LK bình thường
- [ ] Vào `/products/655/edit`
- [ ] Bấm "+ Thêm điều chỉnh" trong block "⚙️ Điều chỉnh thông tin căn"
- [ ] Tick ô "%PMG_LK (CĐT trả BRE)", gõ `7` → "Lưu điều chỉnh (1 trường)"
- [ ] Dialog đóng, row mới hiện màu **vàng "Chờ lưu"**
- [ ] Bấm nút **Lưu** ở cuối form
- [ ] Redirect về `/products/655`, chip Lịch sử %PMG_LK có `7% (13/07)`

### 1.2. Adjustment với dấu phẩy VN
- [ ] "+ Thêm" → gõ `7,5` → Lưu điều chỉnh → row pending → Lưu form
- [ ] Verify: pmg_rate = 0.075 trong DB, không phải 0

### 1.3. Adjustment với ký tự %
- [ ] "+ Thêm" → gõ `7,5%` → Lưu điều chỉnh
- [ ] Không alert lỗi, row pending hiện đúng "7,5%"
- [ ] Lưu form → DB pmg_rate = 0.075

### 1.4. Adjustment gõ rác
- [ ] "+ Thêm" → tick %PMG_LK → gõ `abc` → Lưu điều chỉnh
- [ ] **Expected**: Alert "Nhập giá trị chưa hợp lệ: %PMG_LK: 'abc' không phải số"
- [ ] Không có row pending nào tạo ra

### 1.5. Adjustment tick nhưng bỏ trống
- [ ] "+ Thêm" → tick %PMG_LK + Giá PMG → không gõ gì cho %PMG_LK, chỉ gõ Giá PMG
- [ ] **Expected**: Alert "Chưa nhập giá trị mới cho: %PMG_LK (CĐT trả BRE)"

### 1.6. Xóa adjustment pending trước khi Lưu
- [ ] Tạo 2 adjustment pending
- [ ] Bấm nút "Xóa" trên 1 row pending → row đó biến mất
- [ ] Lưu form → chỉ adjustment còn lại được apply

### 1.7. Hủy form → discard pending
- [ ] Tạo 1 adjustment pending → bấm "Hủy" ở cuối form
- [ ] Về list, mở lại căn → adjustment KHÔNG có trong DB

---

## 2. Browser autofill (Chrome-specific)

### 2.1. Money field
- [ ] Vào form Sửa recon giá vốn `/costs/[id]/edit`
- [ ] Field "Số tiền thanh toán" — gõ vài số
- [ ] **Expected**: KHÔNG có dropdown "Saved info" pop up
- [ ] Nếu Chrome vẫn hiện, verify data submit không bị đè

### 2.2. Số % rate
- [ ] Vào `/products/[id]/edit`
- [ ] Field "%PMG_LK" — gõ vài số
- [ ] Verify không có dropdown autofill

---

## 3. Lịch sử %PMG_LK (Section 2 detail page)

- [ ] Vào `/products/655`
- [ ] Section 2 "Doanh thu" → chip "Lịch sử %PMG_LK" hiện đúng thứ tự
- [ ] Consecutive same rate compact (VD 7% 05/02 + 7% 11/07 → chỉ 1 chip)
- [ ] Adjustment mới thêm → chip mới hiện sau khi Lưu

---

## 4. Section 4 profit calculation

- [ ] Vào `/products/655`
- [ ] Section 4 "Cơ cấu phân bổ tiền"
- [ ] A. Tổng DT = PMG × latestRate + CĐT - admin → khớp DB `total_revenue`
- [ ] B. Chi phí breakdown khớp Excel col R
- [ ] C. Lợi nhuận = A/1.1 - B → dương

---

## 5. Activity log button

- [ ] Vào `/products/655`
- [ ] Góc trên phải header có button "🕓 Lịch sử N"
- [ ] Click → modal overlay hiện timeline
- [ ] Badge Tạo/Sửa/Xóa màu xanh/blue/đỏ
- [ ] Diff format `field: cũ → mới` với label VN
- [ ] Click ngoài modal / nút × → đóng

---

## 6. Redirect + banner sau CRUD

### 6.1. Tạo cost recon → về edit
- [ ] `/costs/new` → tạo mới → Lưu
- [ ] Redirect về `/costs/{newId}/edit?created=1`
- [ ] Banner **xanh** "Đã tạo đối chiếu #N"

### 6.2. Sửa cost recon từ list → về list giữ filter
- [ ] `/costs?unitCode=09-22` → bấm Sửa 1 record
- [ ] Ở edit → sửa gì đó → Lưu
- [ ] Redirect về `/costs?unitCode=09-22&updated=N`
- [ ] Banner **xanh** "Đã cập nhật đối chiếu #N", filter unitCode vẫn giữ

### 6.3. Xóa cost recon từ list → về list giữ filter + banner đỏ
- [ ] Tương tự 6.2, bấm Xóa
- [ ] Redirect về list với filter + banner **đỏ** "Đã xóa đối chiếu #N"

---

## 7. Dropdown căn hiển thị rõ

- [ ] `/costs/new` → dropdown "Căn (sản phẩm)"
- [ ] Label chính = mã căn ngắn `B1-09-22` (không phải mã dài `EMGV_DT25_...`)
- [ ] Sublabel = tên dự án · CĐT · mã dài
- [ ] Search bằng cả mã dài / tên dự án / CĐT đều tìm được

---

## 8. Regression bugs đã fix

### 8.1. Căn B1-09-22 (id=643) tổng giá vốn khớp Excel
- [ ] `/products/643` → Section 4 → Tổng chi phí = 79,618,509 (khớp Excel col R sau khi thêm KPI TPKD 4%)

### 8.2. Căn B1-14-10 (id=655) sau fix
- [ ] `/products/655` → total_revenue = 157,663,769 (không phải 18,150,000 hoặc 175,129,039)
- [ ] Section 4 lợi nhuận **dương** (~46.9M biên ~35%)
- [ ] Section 2 chip 7% có mặt

---

## Ghi chú khi test fail

Nếu 1 case fail, ghi lại:
1. Bước nào fail
2. Expected vs Actual
3. Screenshot nếu là UI bug
4. Console log (F12 → Console) nếu là JS error

Post vào chat để em fix + add regression test.
