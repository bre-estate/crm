# Đặc tả hệ thống BRE CRM

| | |
|---|---|
| **Sản phẩm** | BRE CRM, phần mềm nội bộ quản lý sàn giao dịch bất động sản |
| **Chủ sở hữu** | Công ty TNHH Sàn giao dịch Bất động sản BRE |
| **Phiên bản tài liệu** | 1.0 |
| **Ngày** | 27/09/2026 |
| **Trạng thái** | Đang vận hành thật (production) tại crm.bre.vn |
| **Phạm vi** | Toàn bộ hệ thống |

Tài liệu này mô tả hệ thống **đang chạy**, không phải hệ thống mong muốn. Mọi
con số trong tài liệu được đo từ dữ liệu thật ngày 27/09/2026. Phần việc chưa
làm hoặc còn treo nằm ở mục 14.

Ba đặc tả hẹp đã có từ trước, tài liệu này không lặp lại nội dung của chúng:

- `docs/SPEC-cap-guards.md`: chặn vượt trần khi đối chiếu
- `docs/SPEC_KY_HOA_HONG.md`: kỳ hoa hồng và thưởng hai tháng
- `docs/SPEC_PNL_QUAN_TRI.md`: báo cáo lãi lỗ quản trị

---

## 1. Mục đích và phạm vi

### 1.1 Vấn đề cần giải

BRE là **sàn môi giới**, không phải chủ đầu tư. Doanh thu của công ty là phí
môi giới do chủ đầu tư hoặc đơn vị F1 trả, còn chi phí lớn nhất là hoa hồng và
thưởng trả cho nhân viên bán hàng. Hai dòng tiền này lệch pha nhau nhiều
tháng: chủ đầu tư trả theo từng đợt tùy tiến độ khách thanh toán, còn nhân
viên thì phải được trả theo cam kết.

Trước khi có hệ thống, toàn bộ việc này nằm trong một file Excel nhiều sheet.
File đó vẫn tồn tại và vẫn là nguồn đối chiếu, nhưng không trả lời được các
câu hỏi vận hành: căn nào còn nợ tiền, ai chưa được trả đủ, tháng này lãi hay
lỗ.

### 1.2 Mục tiêu

1. Ghi nhận trọn vòng đời một giao dịch: từ lúc khách cọc tới lúc trả xong hoa
   hồng cho nhân viên.
2. Không cho ghi sai vượt trần, vì tiền đã chi ra khó đòi lại.
3. Trả lời được câu hỏi tiền mặt và lãi lỗ theo tháng, không phải chờ kế toán.
4. Phân quyền để mỗi vị trí chỉ thấy phần việc của mình.

### 1.3 Ngoài phạm vi

- Không phải phần mềm kế toán. Sổ sách thuế vẫn do kế toán ngoài làm trên phần
  mềm riêng, hệ thống chỉ nhập lại bảng cân đối để đối chiếu.
- Không quản lý khách hàng tiềm năng, không có chức năng chăm sóc khách.
- Không phát hành hóa đơn điện tử.
- Không tính lương cơ bản và bảo hiểm. Chỉ tính phần hoa hồng và thưởng.

### 1.4 Quy mô hiện tại

| Đối tượng | Số lượng |
|---|---|
| Dự án | 17 |
| Đối tác (chủ đầu tư, F1, F2) | 12 |
| Căn sơ cấp | 85 |
| Căn thứ cấp | 52 |
| Đợt đối chiếu doanh thu | 299 |
| Đợt đối chiếu giá vốn | 517 |
| Dòng sao kê ngân hàng | 924 |
| Nhân sự | 48 |
| Tài khoản đăng nhập | 4 |

---

## 2. Bối cảnh nghiệp vụ

### 2.1 Chuỗi phân phối

```
Chủ đầu tư (CĐT)
   └─ F1: đơn vị tổng phân phối
        └─ F2: sàn bán lẻ
```

BRE đứng ở vị trí F1 hoặc F2 tùy dự án, khai báo ở trường `breRole` của dự án.
Đứng ở đâu thì tỷ lệ phí môi giới khác nhau, nên cấu hình theo từng dự án chứ
không đặt chung.

### 2.2 Cách BRE kiếm tiền

Với mỗi căn bán được, BRE nhận tối đa ba khoản, độc lập nhau:

1. **Phí môi giới (PMG)** = giá tính PMG × %PMG_LK. Đây là khoản chính.
2. **CĐT thưởng sale**: chủ đầu tư thưởng thêm cho nhân viên bán, số cố định.
3. **CĐT thưởng quản lý**: thưởng cho cấp quản lý, số cố định.

Chủ đầu tư trừ **phí hành chính** trước khi trả, và trả theo **từng đợt** ứng
với tiến độ khách thanh toán.

### 2.3 Cách BRE chi tiền

Mỗi căn có tối đa chín loại chi phí, gọi chung là **giá vốn**:

| Mã | Tên | Cách tính |
|---|---|---|
| `sale_commission` | Hoa hồng sale | theo tỷ lệ trên PMG |
| `kpi_ceo` | KPI CEO | theo tỷ lệ trên PMG |
| `kpi_tpkd` | KPI trưởng phòng | theo tỷ lệ trên PMG |
| `kpi_admin` | KPI admin | theo tỷ lệ trên PMG |
| `cdt_bonus_sale` | CĐT thưởng sale | số cố định |
| `cdt_bonus_manager` | CĐT thưởng quản lý | số cố định |
| `bonus_sale` | Công ty thưởng sale | số cố định |
| `bonus_manager` | Công ty thưởng quản lý | số cố định |
| `customer_support` | Hỗ trợ khách | số cố định |

Công thức trần cho loại tính theo tỷ lệ:

```
trần = ((giá tính PMG × %PMG_LK_sale − phí admin) / 1,1 − hỗ trợ khách) × tỷ lệ
```

Chia 1,1 là bỏ VAT. Hàm `computeLuyKe()` ở `lib/costCalc.ts` là nơi duy nhất
cài công thức này, mọi màn hình và báo cáo đều gọi vào đó.

---

## 3. Từ điển thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Căn** | Một sản phẩm bất động sản đã bán. Đơn vị gốc của mọi tính toán |
| **Sơ cấp** | Bán hàng mới từ chủ đầu tư |
| **Thứ cấp** | Mua đi bán lại, quản lý ở bảng riêng |
| **PMG** | Phí môi giới |
| **%PMG_LK** | Tỷ lệ phí môi giới liên kết, do chủ đầu tư quy định |
| **Đợt đối chiếu** | Một lần chốt số giữa BRE và đối tác, hoặc giữa BRE và nhân viên. Một căn có nhiều đợt |
| **Doanh thu** | Tiền BRE được nhận. Bảng `revenue_reconciliations` |
| **Giá vốn** | Tiền BRE phải trả cho người. Bảng `cost_reconciliations` |
| **Trần** | Số tiền tối đa được đối chiếu cho một loại chi phí của một căn |
| **Nghĩa vụ** | Số đã đối chiếu, chưa chắc đã chi |
| **Thu tiền** | `payments_in`, tiền thật về tài khoản |
| **Chi tiền** | `payments_out`, tiền thật ra khỏi tài khoản |
| **Đứng tên** | Một người ký chứng từ thay người khác. Doanh số quy về người bán thật |

---

## 4. Người dùng và phân quyền

### 4.1 Mô hình

Hệ thống có **một danh mục duy nhất** vừa là chức danh nhân sự vừa là đơn vị
cấp quyền: bảng `positions`. Trước đây tách làm hai (chức danh và vai trò đăng
nhập) nên mỗi lần thêm chức danh phải sửa hai chỗ.

Quyền của một tài khoản được giải theo thứ tự:

1. Vai trò `owner`: toàn quyền, không cấu hình được.
2. Vai trò `custom`: dùng bộ quyền riêng ghi ở `user_permissions.permissions`.
3. Còn lại: vai trò chính là **mã vị trí**, quyền lấy từ `positions.permissions`.

### 4.2 Tài nguyên và hành động

37 tài nguyên, mỗi tài nguyên hỗ trợ tập hành động riêng trong `view`, `edit`,
`delete`. Nhóm theo đúng thứ tự menu:

| Nhóm | Số tài nguyên |
|---|---|
| Nguồn hàng | 1 |
| Giao dịch | 6 |
| Báo cáo | 15 |
| Kế toán | 5 |
| Tổ chức | 3 |
| Quản trị | 5 |
| Chung | 2 |

Quy tắc bắt buộc: có `edit` hoặc `delete` thì phải có `view`. Giao diện tự bật
`view` khi tick hai quyền kia, và tự bỏ cả ba khi bỏ `view`.

### 4.3 Vị trí hiện có

| Vị trí | Phòng ban | Số quyền | Nhân sự | Tài khoản |
|---|---|---|---|---|
| CEO | Ban lãnh đạo | 32 | 1 | 1 |
| TPKD | Kinh doanh | 19 | 2 | 0 |
| NVKD | Kinh doanh | 0 | 32 | 0 |
| Sale Admin | Hành chính nhân sự | 11 | 6 | 1 |
| HR | Hành chính nhân sự | 13 | 1 | 1 |
| Kế toán | Hành chính nhân sự | 0 | 0 | 0 |
| Content Writer | Marketing | 0 | 1 | 0 |
| Video Editor | Marketing | 0 | 3 | 0 |
| Cameraman | Marketing | 0 | 2 | 0 |

Vị trí 0 quyền nghĩa là chưa ai ở vị trí đó cần đăng nhập. Cấp quyền được bất
cứ lúc nào ở trang Phân quyền, không cần sửa code.

### 4.4 Nguyên tắc phân quyền

**Trưởng phòng kinh doanh không thấy tiền của công ty.** TPKD quản đội bán
hàng nên không được vào Dòng tiền, Lãi lỗ quản trị, Bảng cân đối kế toán, Phân
tích chi phí, KPI dashboard, Nghĩa vụ tài chính, Tuổi nợ phải trả, Vốn góp.
Cũng không thấy Lãi lỗ theo dự án và Lãi lỗ per căn, vì hai cái đó lộ cơ cấu
giá vốn.

**Ba tầng chặn, không dựa vào một tầng nào.**

1. Middleware chặn theo đường dẫn, tra bảng `positions` qua PostgREST bằng
   phiên của chính người dùng.
2. Từng trang gọi `requirePermission()` ở đầu hàm.
3. Từng lệnh ghi gọi `requirePermission(tài_nguyên, "edit")`.

Tầng 1 không được thay tầng 2. Đã có lỗi thật: menu ẩn theo quyền nhưng trang
lại khóa cứng theo chủ tài khoản, nên người được cấp quyền bấm vào ra trang
không tồn tại.

**Luôn dùng `quyenCua(user, ...)` của `lib/auth.ts`**, không gọi thẳng
`hasPermission()` đồng bộ của `lib/permissions.ts`. Hàm kia cần truyền bảng
quyền vị trí ở tham số cuối, quên là nó lặng lẽ rơi về preset cũ trong code và
trả kết quả sai. Lỗi này đã từng làm CEO bị chặn khỏi mọi trang.

---

## 5. Cơ cấu tổ chức

### 5.1 Cây phòng ban

Phòng ban có cấp cha con, tối đa **ba cấp**: phòng lớn, đội, đội nhỏ trong
đội. Nhân viên và căn gắn vào bất kỳ cấp nào.

```
Ban lãnh đạo            3 người    23 căn
Hành chính nhân sự      4           0
Kinh doanh             13          62
  └ 1 Tỷ                4           8
  └ Hồ Gia              5          50
Marketing               4           0
  └ Nội dung            4           0
```

Số của phòng cha **đã gồm cả các đội bên trong**. Hàm `congDonCay()` lo việc
này. Đếm rời từng phòng cho ra cảnh vô lý, phòng Kinh doanh hiện 4 người trong
khi hai đội con của nó có 9 người.

Khi mở thêm sàn, chèn một cấp ở giữa:

```
Kinh doanh
  └ Sàn Thủ Đức          trưởng phòng = giám đốc sàn
      └ Đội Hồ Gia       trưởng phòng = TPKD
      └ Đội 1 Tỷ
```

Ba cấp là đủ cho cấu trúc này. Phó phòng và Giám đốc sàn là **vị trí**, không
phải cấp trong cây.

### 5.2 Loại hợp đồng

Cộng tác viên là **loại hợp đồng**, không phải chức danh. Một người có thể là
NVKD ký hợp đồng dịch vụ, hoặc Video Editor ký hợp đồng dịch vụ.

| Loại | Số người |
|---|---|
| Hợp đồng lao động | 13 |
| Hợp đồng dịch vụ (CTV) | 33 |
| Chưa ghi | 2 |

### 5.3 Người đứng tên

`employees.alias_of_id` trỏ tới người bán thật. Người đứng tên chỉ ký chứng
từ, mọi báo cáo quy doanh số về người bán thật. Hiện có 5 người đứng tên.

---

## 6. Luồng nghiệp vụ chính

### 6.1 Vòng đời một căn

```
1. Sale Admin tạo căn            /products/new
   nhập giá, %PMG_LK, các tỷ lệ chi phí, NVKD, phòng ghi nhận

2. Sale Admin tạo đối chiếu doanh thu   /revenues/new
   mỗi lần chủ đầu tư chốt một đợt

3. Sale Admin ghi nhận thu tiền         payments_in
   khi tiền thật về tài khoản

4. Hệ thống báo cho nhân sự             thông báo "cần tạo giá vốn"
   tab Cần tạo ở /costs?view=pending

5. Nhân sự tạo đối chiếu giá vốn        /costs/new
   đủ các loại đang cấu hình trên căn

6. Nhân sự ghi nhận chi tiền            payments_out
   khi đã chuyển khoản cho người nhận
```

### 6.2 Vì sao không nối trực tiếp đợt doanh thu với đợt giá vốn

Chủ đầu tư chi theo tiến độ của họ, BRE trả nhân viên theo chính sách của
BRE. Hai nhịp không trùng nhau và không có quan hệ một đối một. Hệ thống chỉ
trả lời hai câu cho từng căn:

1. Tiền có về sau lần lập giá vốn gần nhất không?
2. Loại giá vốn nào đang cấu hình trên căn mà chưa có đợt nào?

Logic ở `lib/cho-tao-gia-von.ts`.

### 6.3 Đối chiếu sao kê

Sao kê Techcombank nhập từ file xuất theo quý. Trang Sao kê là **bản sao trung
thực**, hiện đúng những gì ngân hàng ghi, không phân loại gì. Việc xếp nhóm
thu chi do báo cáo tự làm mỗi lần chạy, bằng bộ luật ở `lib/bank-cash-core.ts`.

Đặc thù file Techcombank, đã xử lý trong `lib/sao-ke-core.ts`:

- Dòng xếp mới nhất trước.
- `debit_amount` lưu số âm.
- Dòng phí mang tiền ở cột Phí và VAT, cột Nợ bằng 0.
- Chuỗi số dư: `số dư = số dư trước + nợ + có + phí + VAT`.
- Dòng cùng ngày có thể sai thứ tự. Cụm cộng lại bằng 0 là do thứ tự, không
  phải thiếu dòng.

---

## 7. Quy tắc nghiệp vụ

Đây là phần quan trọng nhất của tài liệu. Mỗi quy tắc dưới đây đều bắt nguồn
từ một lỗi thật đã xảy ra.

### BR-01. Ba trần doanh thu tách rời

Doanh thu một căn có ba trần độc lập: hoa hồng, CĐT thưởng sale, CĐT thưởng
quản lý. Không được cộng chúng lại rồi so với một trần chung.

*Lỗi đã xảy ra:* so tổng gồm cả thưởng với trần chỉ của hoa hồng, chặn nhầm 7
căn FENICA và Emerald mà người nhập không hiểu vì sao.

### BR-02. `phase_pct_this_time` là lũy kế, không được cộng

Cột phần trăm tiến độ đợt này là số **lũy kế** của căn, không phải phần tăng
thêm. Chỉ kiểm từng dòng có vượt 100% không.

*Lỗi đã xảy ra:* cộng dồn cột lũy kế rồi chặn, khóa 60 trên 85 căn.

### BR-03. Lỗi phải trả về, không được ném

Next.js ở môi trường thật **che toàn bộ lỗi ném ra từ server action**, người
dùng chỉ thấy một dòng lỗi hệ thống vô nghĩa. Mọi lỗi kiểm tra phải trả về
dạng `{ error: "câu tiếng Việt dễ hiểu" }`.

Hạ tầng: `lib/actions/ket-qua.ts` (`chay`, `cauLoi`) và `lib/bao-loi.ts`.

### BR-04. Phòng ghi nhận và người bán là hai dữ kiện độc lập

Người đổi đội được, còn căn đã bán thì thuộc về đội lúc bán. Chọn NVKD **không
tự điền** phòng, chỉ gợi ý.

*Ca thật:* Cẩm Giang bán 7 căn hồi còn ở Hồ Gia rồi tách ra lập đội 1 Tỷ. Bảy
căn đó là doanh số của Hồ Gia vĩnh viễn, doanh số cá nhân thì luôn của chị.

Hệ quả: báo cáo theo phòng đọc `products.department_id`, báo cáo theo người
đọc `products.sales_person`. Không suy cái này từ cái kia.

### BR-05. Tên người là khóa, không được thêm hậu tố

`products.sales_person` và `cost_reconciliations.employee_name` lưu tên dạng
văn bản và dùng để nối với bảng nhân sự. Không bao giờ nối thêm chữ vào giá
trị này.

*Lỗi đã xảy ra:* ô chọn NVKD nối "(đã nghỉ)" vào chính giá trị, ghi xuống
database thành "Nguyễn Hồng Diễm (đã Nghỉ)", từ đó không khớp bảng nhân sự
nữa. Mở lại căn thì ô NVKD trống trơn.

Trạng thái nghỉ để ở dòng mô tả phụ. Tạo căn mới thì lọc bỏ người đã nghỉ, sửa
căn cũ thì vẫn cho chọn.

### BR-06. Tên trong sao kê không dấu và viết hoa

Ngân hàng Việt Nam lưu tên không dấu, viết hoa. So tên phải bỏ dấu cả hai vế
và so khớp chính xác, không so chứa.

*Lỗi đã xảy ra:* so tên có dấu với văn bản sao kê không dấu, kết luận sai rằng
13 người chưa từng phát sinh khoản chi nào. Số đúng là 5 trên 14.

### BR-07. Postgres không cho dùng bí danh cột trong cùng một SELECT

Viết thẳng biểu thức ra, không đặt bí danh rồi dùng lại ở cột khác.

*Lỗi đã xảy ra:* `sql.raw` dùng bí danh `pmg`, trang Giá vốn sập. **`tsc` và
`npm run build` không bắt được lỗi SQL**, phải chạy thật với dữ liệu thật
trước khi đẩy lên.

### BR-08. Lịch sử phòng ban không được viết lại

Sửa NVKD trên một căn cũ không được đè lên phòng đã ghi. Chỉ điền hộ khi tạo
căn mới hoặc khi ô phòng đang trống.

### BR-09. Lọc theo phòng phải lấy cả nhánh

Chọn phòng Kinh doanh phải ra cả người và căn của Hồ Gia và 1 Tỷ. Dùng
`nhanhDuoi()`.

### BR-10. Màu phòng tự động phải né màu đã chọn tay

*Lỗi đã xảy ra:* Hành chính nhân sự chọn Xanh dương thì 1 Tỷ tự động cũng nhận
Xanh dương.

---

## 8. Mô hình dữ liệu

37 bảng. Nhóm theo miền nghiệp vụ, kèm số dòng thật ngày 27/09/2026.

### 8.1 Danh mục nền

| Bảng | Dòng | Ghi chú |
|---|---|---|
| `partners` | 12 | CĐT, F1, F2 |
| `projects` | 17 | cấu hình tỷ lệ theo dự án |
| `departments` | 7 | cây cha con, có `parent_id` và `color` |
| `positions` | 9 | chức danh kiêm đơn vị cấp quyền |
| `employees` | 48 | có `alias_of_id`, `contract_type` |
| `accounting_categories` | 23 | |
| `commission_policies` | 7 | |

### 8.2 Giao dịch

| Bảng | Dòng |
|---|---|
| `products` | 85 |
| `secondary_sales` | 52 |
| `revenue_reconciliations` | 299 |
| `payments_in` | 319 |
| `cost_reconciliations` | 517 |
| `payments_out` | 517 |
| `invoices` | 86 |
| `contracts` | 20 |

### 8.3 Tài chính

| Bảng | Dòng |
|---|---|
| `bank_transactions` | 924 |
| `financial_transactions` | 903 |
| `accounting_journal` | 756 |
| `founder_spending` | 365 |
| `payroll_months` | 138 |
| `trial_balance` | 42 |
| `year_end_accruals` | 37 |
| `tax_payments` | 12 |

### 8.4 Hệ thống

| Bảng | Dòng |
|---|---|
| `activity_logs` | 351 |
| `user_permissions` | 4 |
| `import_logs` | 13 |
| `notification_reads` | 1 |
| `integrations` | 1 |
| `company_settings` | 1 |

### 8.5 Bảng rỗng

`chat_logs`, `company_expenses`, `company_investments`, `documents`,
`expense_requests`, `general_expenses`, `pmg_tiers`, `product_adjustments`,
`rentals`.

Chín bảng chưa có dòng nào. `rentals` là tính năng cho thuê, đã dựng nhưng
chưa bật lên menu theo yêu cầu. `documents` là kho tài liệu, đã dựng xong chờ
dùng. Bảy bảng còn lại cần rà lại xem có bỏ được không.

### 8.6 Bảo mật tầng dữ liệu

Chạy trên Supabase Postgres. Bảng nghiệp vụ bật RLS và không có luật nào, app
đọc qua kết nối Drizzle nên đi vòng qua RLS. Hai ngoại lệ đọc qua PostgREST
bằng phiên người dùng nên phải có luật cho `authenticated`:

- `user_permissions`: middleware đọc để biết vai trò.
- `positions`: middleware đọc để giải quyền.

---

## 9. Danh mục màn hình

70 trang. Menu chia bảy nhóm:

| Nhóm | Màn hình |
|---|---|
| | Tổng quan |
| Nguồn hàng | Đối tác, Dự án |
| Giao dịch | Căn sơ cấp, Doanh thu, Giá vốn, Hóa đơn, Căn thứ cấp |
| Báo cáo | Lãi lỗ và dòng tiền, KPI, Bán hàng, Hoa hồng, cộng 11 báo cáo ở trang Báo cáo |
| Kế toán | Kỳ HH và thưởng, Xuất bảng HH, Yêu cầu chi, Sao kê ngân hàng, Giao dịch chưa xếp nhóm, Sổ NKC, Giao dịch tài chính, Vốn góp và tài sản |
| Tổ chức | Nhân viên, Phòng ban, Vị trí |
| Quản trị | Người dùng, Phân quyền, Tích hợp, Kho tài liệu, Kiểm tra dữ liệu, Lịch sử hoạt động, Phân tích chatbot, Đối chiếu Excel và app |
| | Hướng dẫn |

Thông báo không nằm trong nhóm nào, là cái chuông trên đầu thanh bên.

---

## 10. Báo cáo

15 báo cáo, mỗi cái một tài nguyên quyền riêng.

| Báo cáo | Trả lời câu hỏi |
|---|---|
| Tổng quan | trang gom các báo cáo |
| Lãi lỗ quản trị | tháng này lãi hay lỗ |
| Dòng tiền | tiền vào ra đi đâu |
| Tuổi nợ phải thu | ai còn nợ BRE, bao lâu rồi |
| Tuổi nợ phải trả | BRE còn nợ ai |
| Bảng cân đối kế toán | đối chiếu với sổ kế toán ngoài |
| Bán hàng | bán được bao nhiêu, theo dự án, phòng, thời gian |
| Hoa hồng | ai được bao nhiêu |
| Lãi lỗ theo dự án | dự án nào có lời |
| Lãi lỗ per căn | căn nào có lời |
| Phân tích chi phí | tiền đi vào khoản nào |
| KPI dashboard | các chỉ số điều hành |
| Sale/Team | ai bán tốt |
| Phân khúc căn | bán được loại căn nào |
| Nghĩa vụ tài chính | còn phải thu và phải trả bao nhiêu |

Hai điểm kỹ thuật:

- Báo cáo dòng tiền có **hai bảng** cùng ra một số: phương pháp trực tiếp và
  gián tiếp. Hai cái phải khớp nhau, đó là phép kiểm chéo.
- Báo cáo bán hàng tab Theo phòng gom theo `products.department_id`, không gom
  theo cột text cũ `products.dept_name`.

---

## 11. Thông báo

Tính ở `lib/alerts.ts`, hiện ở chuông trên thanh bên và trang `/notifications`.

| Mã | Nội dung | Gửi cho |
|---|---|---|
| `below-be-3m` | ba tháng liền bán dưới điểm hòa vốn | Chủ tài khoản, CEO |
| `doanh-thu-ve` | tiền chủ đầu tư vừa về | Chủ tài khoản, CEO |
| `idle-sale` | sale không phát sinh hoa hồng 3 tháng | Chủ tài khoản, CEO |
| `opex-spike` | chi phí hoạt động tháng bất thường | Chủ tài khoản |
| `overdue-receivables` | công nợ phải thu quá 60 ngày | Chủ tài khoản, CEO, Sale Admin |
| `cho-tao-gia-von` | căn đã nhận tiền mà chưa lập giá vốn | Chủ tài khoản, HR |

Lọc hai lớp: bảng vai trò, cộng quyền mở được trang mà thông báo dẫn tới. Lớp
thứ hai đảm bảo không ai nhận thông báo bấm vào ra trang báo lỗi.

Khóa của thông báo quyết định khi nào nó sáng lại. `doanh-thu-ve` gắn khóa với
đợt thu mới nhất nên đọc rồi là im tới khi có tiền về tiếp.

Tính thông báo chạy hơn 20 truy vấn, mất 2 tới 3 giây. Có giới hạn 8 giây, quá
giờ thì **ném lỗi** chứ không trả danh sách rỗng, để trình duyệt giữ số cũ.
Trả rỗng khiến chuông tụt về 0 như thể đã hết việc.

---

## 12. Tích hợp ngoài

### 12.1 Google Drive

Nối theo chuẩn OAuth, người dùng bấm nút cho phép chứ không dán khóa. Phạm vi
`drive.file`. Chọn thư mục bằng Google Picker, hỗ trợ Shared Drive.

Mỗi loại tài liệu ánh xạ một thư mục Drive riêng. Khi tải lên, file đi vào cả
Supabase Storage (để app xử lý) lẫn Drive (để lưu trữ).

Khóa làm mới mã hóa AES-256-GCM, khóa suy từ `GOOGLE_CLIENT_SECRET`. Không lưu
bí mật dạng văn bản thường trong database.

### 12.2 Supabase Storage

Bucket `tai-lieu`, giới hạn 50 MB một file, có RLS. Liên kết tải về ký tạm 5
phút. Trình duyệt tải thẳng lên để không đụng giới hạn dung lượng của server
action.

### 12.3 Ngân hàng

Không nối API. Nhập thủ công từ file Techcombank xuất ra theo quý.

---

## 13. Kiểm soát chất lượng dữ liệu

### 13.1 Trang Kiểm tra dữ liệu

`/admin/data-checks` chạy một loạt phép kiểm bất biến mỗi lần mở. Chỉ liệt kê
phép kiểm chưa đạt, phép đạt chỉ đếm số.

### 13.2 Đối chiếu với Excel của kế toán

Script `scripts/doi-chieu-gia-von.ts` so giá vốn trong app với sheet
`2.3_Gia von`. Khóa nối là cột D `Ma_SP`.

Cách đọc file khác nhau theo loại chi phí:

- KPI CEO và KPI TPKD có ba cột (lũy kế, đã thanh toán, còn thanh toán đợt
  này). Lấy **tổng các đợt** vì tiền cũng chi theo đợt.
- Các loại còn lại chỉ có một cột, cộng các đợt.
- Ba dòng 245, 246, 445 có cột tổng AM khác tổng các cột khoản. Ở cả ba, AM
  trùng cột AO "Số tiền thanh toán", nên lấy AM. Gặp dòng lệch mới chưa khai
  thì script cảnh báo chứ không im lặng bỏ qua.

Kết quả ngày 27/09/2026: tổng app 6.601.112.561, tổng Excel 6.639.516.225.
Còn một chênh lệch chưa rõ là "Thưởng booking" FENICA 46.540.000, một mã sản
phẩm ảo trong Excel không gắn căn nào.

### 13.3 Kỷ luật kiểm thử

- `sql.raw` phải chạy thật với dữ liệu thật trước khi đẩy lên. `tsc` và
  `npm run build` không bắt được lỗi SQL.
- Không chạy lệnh ghi lên database thật để thử tính năng khi người dùng đang
  thao tác trên giao diện.
- Trước khi khẳng định một nguyên nhân, phải mở đúng bảng log, timestamp hoặc
  `git log` ra xem.

---

## 14. Hạn chế hiện tại và việc còn treo

### 14.1 Hạn chế đã biết

| Hạn chế | Ảnh hưởng |
|---|---|
| Không sửa hàng loạt phòng của căn cũ | Sai phòng thì phải mở từng căn. Cố ý không làm, xử lý bằng script khi cần |
| Không lưu vết chi dư rồi thu lại | App chỉ thấy số cuối. Khớp từng dòng với ngân hàng sẽ hụt |
| Supabase gói miễn phí | Không có khôi phục theo thời điểm. Chưa có sao lưu `pg_dump` định kỳ |
| Nhập sao kê thủ công | Phụ thuộc người nhớ nhập theo quý |

### 14.2 Việc còn treo

| Việc | Chờ ai |
|---|---|
| "Thưởng booking" FENICA 46.540.000 | Sale Admin |
| KPI CEO và Công ty thưởng quản lý ngừng đối chiếu từ 09/03/2026, 85 căn cấu hình nhưng chỉ 37 căn từng đối chiếu | Kế toán. Đang tạm ẩn khỏi danh sách nhắc |
| Hai người chưa ghi loại hợp đồng | HR |
| Ngày sinh Võ Thị Thanh Bình ghi sai "31//2006" | HR |
| Ngày cọc thứ cấp `2026-20-06` tháng 20 không hợp lệ | Sale Admin |
| Kỳ hạn ba sổ tiết kiệm 300tr ngày 21/07/2026 | Chủ tài khoản |

---

## 15. Phi chức năng

| Hạng mục | Hiện trạng |
|---|---|
| Nền tảng | Next.js 16 App Router, TypeScript, TailwindCSS 4 |
| Cơ sở dữ liệu | Supabase Postgres, truy cập qua Drizzle ORM |
| Triển khai | Vercel, tên miền crm.bre.vn |
| Đăng nhập | Supabase Auth, Google OAuth, danh sách email cho phép |
| Ngôn ngữ giao diện | Tiếng Việt toàn bộ |
| Giới hạn server action | 1 MB một yêu cầu |
| Giới hạn hàm | 10 giây trên Vercel |
| Số migration | 60 file trong `drizzle/` |

Quy ước viết chữ hiển thị: không dùng gạch dài, không lẫn tiếng Anh vào câu
tiếng Việt, xưng "bạn" chứ không xưng "anh".

---

## 16. Lịch sử tài liệu

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| 1.0 | 27/09/2026 | Bản đầu, mô tả hệ thống đang chạy |
