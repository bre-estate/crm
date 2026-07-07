# Hướng dẫn nhập liệu — BRE CRM

Cập nhật: 2026-07-07

Trang web: https://crm-azure-kappa-85.vercel.app

Tài liệu này hướng dẫn thứ tự nhập liệu, ý nghĩa từng trường, và cách hệ thống hiểu số liệu. Đọc lần đầu 15 phút, sau đó chỉ cần tra khi gặp trường không quen.

---

## Mục lục

1. [Nguyên tắc chung](#1-nguyên-tắc-chung)
2. [Thứ tự nhập liệu](#2-thứ-tự-nhập-liệu-làm-từ-trên-xuống)
3. [Đối tác (`/partners`)](#3-đối-tác-partners)
4. [Dự án (`/projects`)](#4-dự-án-projects)
5. [Giao dịch — Sơ cấp (`/products`)](#5-giao-dịch--sơ-cấp)
6. [Giao dịch — Thứ cấp](#6-giao-dịch--thứ-cấp)
7. [Đối chiếu doanh thu (`/revenues`)](#7-đối-chiếu-doanh-thu-revenues)
8. [Đối chiếu giá vốn (`/costs`)](#8-đối-chiếu-giá-vốn-costs)
9. [Báo cáo (`/reports`)](#9-báo-cáo-reports)
10. [Từ điển thuật ngữ](#10-từ-điển-thuật-ngữ)

---

## 1. Nguyên tắc chung

### 1.1. Loại giao dịch

Hệ thống phân biệt 2 loại, dữ liệu và UI khác nhau:

| Loại | Khi nào | Form nhập | Trang chi tiết |
|---|---|---|---|
| **Sơ cấp** | Có HĐ giữa BRE và CĐT (hoặc F1) — BRE nhận HH theo %PMG_LK | Đầy đủ trường CĐT, %PMG_LK, phí admin | Có mục "Thu phí HH từ CĐT" |
| **Thứ cấp** | Mua đi bán lại giữa cá nhân — không có CĐT, BRE chỉ hưởng chênh lệch/HH môi giới | Chỉ 1 ô "Doanh thu về cty" | KHÔNG có mục thu phí CĐT |

Chọn đúng ngay từ đầu, hệ thống tự ẩn/hiện các trường không phù hợp.

### 1.2. Vai trò BRE (breRole)

Trên mỗi dự án có badge:

- 🟢 **BRE = F1**: BRE ký HĐ trực tiếp với **CĐT** (hiện chỉ có Bcons Homes)
- 🔵 **BRE = F2**: BRE ký HĐ với **sàn F1** (DXMD, DKRS, Dataloca, TA, ...) → bán qua họ
- 🟠 **Thứ cấp**: không có đối tác — dự án mua bán lại

Sai vai trò → sai công thức lãi. Kiểm tra kỹ khi tạo dự án.

### 1.3. Snapshot vs cấu hình

Có 2 loại số:
- **Cấu hình** trên dự án/căn (%PMG_LK, %HH sale…) — dùng cho tính toán dự kiến
- **Snapshot** trên đợt đối chiếu (chốt tại thời điểm tạo đợt) — dùng làm số liệu lịch sử

Vào **Sửa** đợt ĐC, các ô snapshot có **nền xám** — không sửa được. Muốn đổi thì xóa đợt rồi tạo lại.

### 1.4. Thu/trả tiền

Có 2 khái niệm khác nhau:
- **Đợt đối chiếu (recon)**: "Chốt số với CĐT/người nhận: đợt này phải thu/trả X đồng"
- **Thanh toán (payment)**: "Ngày Y, thực nhận/trả Z đồng cho đợt X"

Đợt ĐC = **cam kết**, payment = **tiền thực chạy**. Nếu đợt chưa có payment record → **cột "Đã thu/trả" mặc định = 0 = "Chưa thu/trả"**. Phải dò lại với admin để nhập payment thực.

---

## 2. Thứ tự nhập liệu (làm từ trên xuống)

```
1. Đối tác (nếu partner mới)     → /partners/new
   ↓
2. Dự án (nếu dự án mới)         → /projects/new  (cần đối tác)
   ↓
3. Giao dịch — căn cốt            → /products/new  (cần dự án)
   ↓
4. Đối chiếu doanh thu            → /revenues/new?productId=X
   ↓
5. Đối chiếu giá vốn              → /costs/new?productId=X
   ↓
6. Payment (thu/trả thực)         → sửa recon → điền số + ngày
```

Đi sai thứ tự → hệ thống không cho lưu vì thiếu FK.

---

## 3. Đối tác (`/partners`)

### 3.1. Phân loại

| Type | Nghĩa | Ví dụ |
|---|---|---|
| **cdt** | Chủ đầu tư — trực tiếp bán sản phẩm ra thị trường | Bcons Homes |
| **f1** | Sàn nhận phân phối chính từ CĐT | DXMD, DKRS, Dataloca, TA |
| **f2** | Sàn phụ dưới F1 (ít dùng) | — |

### 3.2. Cách xác định

Đối tác đó ký hợp đồng với ai?
- Ký thẳng với CĐT thực sự (chủ dự án) → `type=cdt`
- Nhận phân phối từ CĐT khác → `type=f1`

**Không tự động điền — người nhập phải biết**. Nếu không chắc, hỏi TPKD/CEO.

### 3.3. Trường bắt buộc

- **Code**: mã ngắn, viết hoa, không dấu (`BCON`, `DXMD`, `DKRS`)
- **Name**: tên hiển thị đầy đủ
- **Type**: cdt / f1 / f2

---

## 4. Dự án (`/projects`)

### 4.1. Quy trình

Vào `/projects` → **+ Thêm dự án**.

### 4.2. Các trường

| Trường | Ý nghĩa | Ví dụ |
|---|---|---|
| **Mã DA** | Mã ngắn, viết tắt tên dự án | `BGDX`, `PĐSG` |
| **Tên dự án** | Tên đầy đủ | Bcons Green Diamond |
| **Đối tác** | Chọn từ danh sách partner | Bcons Homes |
| **Vai trò BRE** | F1 (BRE ký thẳng CĐT) hoặc F2 (BRE qua sàn F1) | Xem #1.2 |
| **%PMG_LK** | Tỷ lệ HH CĐT trả BRE trên giá tính PMG | `5.5` (nghĩa là 5.5%) |
| **%PMG_LK_sale** | Tỷ lệ BRE phải trả cho F2 dưới (nếu có) | Bỏ trống nếu không có F2 |
| **Phí admin** | Phí CĐT trừ trước khi chuyển BRE (BRE ko nhận) | `3.000.000` |
| **Đợt TT** | Số đợt thanh toán trong hợp đồng | `3`, `5` |
| **Tình trạng HĐ** | chưa ký / đang đàm phán / đã ký / ngừng | |

### 4.3. Với dự án thứ cấp

Chọn `Loại giao dịch = thứ cấp` KHI tạo **căn** — dự án vẫn tạo bình thường nhưng có thể để trống Đối tác nếu không có sàn nào đứng ra.

---

## 5. Giao dịch — Sơ cấp

Vào `/products` → **+ Thêm giao dịch**. Đảm bảo chọn **Loại = Sơ cấp**.

### 5.1. Section "Thông tin căn"

| Trường | Ý nghĩa |
|---|---|
| Dự án | Chọn từ danh sách |
| Mã căn | vd `A.25.26` |
| Tên khách | Viết hoa chữ đầu — hệ thống tự title-case |
| NVKD | Người bán căn này |
| Phòng KD | Chọn từ danh sách phòng |
| Loại giao dịch | **Sơ cấp (HĐ với CĐT)** |
| Tháng ghi nhận DT | `YYYY-MM` — dùng để filter báo cáo theo quý/năm |
| Ngày cọc | Ngày khách đặt cọc |

### 5.2. Section "Doanh thu (CĐT/F1 trả BRE)"

| Trường | Ý nghĩa | Nguồn |
|---|---|---|
| Giá bán | Giá thực khách mua | HĐMB |
| Tổng doanh thu (gồm VAT) | Số CĐT trả BRE trước khi trừ admin | Excel cột P |
| Giá tính PMG | Số dùng để nhân với %PMG_LK | HĐ với CĐT |
| %PMG_LK | Nhập số dạng `5.5` (= 5.5%) | HĐ |
| Phí admin (gồm VAT) | CĐT trừ trước, chuyển F1 liên kết | HĐ |
| CĐT thưởng sale | Thưởng nóng cho NVKD, đi qua BRE chuyển tiếp | Chỉ khi CĐT có chương trình |
| CĐT thưởng QL | Thưởng cho TPKD (2 dạng: CĐT trả riêng hoặc gộp vào HH) | |

**Lưu ý**: Phí admin & CĐT thưởng KHÔNG phải phần BRE hưởng — hệ thống trừ ra khỏi lãi.

### 5.3. Section "Giá vốn (BRE trả nội bộ + F2 dưới)"

Đây là chi phí BRE phải trả ra khỏi phần HH nhận từ CĐT:

| Trường | Ý nghĩa | Ví dụ |
|---|---|---|
| Tổng giá vốn | Tổng chi (nếu biết trước) | |
| %PMG_LK_sale | Trả F2 dưới (nếu có) | `3` |
| %HH sale (NVKD) | HH cho NVKD | `65` (= 65% Q) |
| Phí admin sale | BRE tự chi cho sàn F1 liên kết | |
| Hỗ trợ khách | Chiết khấu cho khách | |
| CTY thưởng NVKD/QL | Thưởng từ BRE | |
| %KPI CEO / TPKD / Admin | KPI trích từ HH CĐT trả BRE | `3.5`, `2`, `1.5` |

### 5.4. Lãi dự kiến

Sau khi lưu, xem `/products/{id}` mục **3. Cơ cấu phân bổ tiền**:
- Bước 1: CĐT trả BRE tổng
- Bước 2: BRE giữ Q = PMG × %PMG_LK − admin
- Bước 3: BRE chi ra (HH sale, KPI, thưởng…)
- Bước 4: Lợi nhuận công ty = Q − tổng chi

---

## 6. Giao dịch — Thứ cấp

Vào `/products` → **+ Thêm giao dịch**. Chọn **Loại = Thứ cấp (mua bán lại)**.

Form tự ẩn các trường không áp dụng — chỉ còn:

### 6.1. Section "Thông tin căn"

Giống sơ cấp, ngoại trừ:
- Không có Phí admin
- Không có %PMG_LK

### 6.2. Section "Doanh thu"

**Chỉ 1 ô**:
- **Doanh thu về cty (VND)** = số cty thực nhận (đã net trung gian)

Không có Giá bán, Giá tính PMG, %PMG_LK, Phí admin, CĐT thưởng — không áp dụng.

### 6.3. Section "Giá vốn (BRE trả NVKD)"

Chỉ các khoản nội bộ:
- Tổng giá vốn
- %HH sale (NVKD)
- Hỗ trợ khách
- CTY thưởng NVKD/QL
- CP giá vốn khác

Ẩn: %PMG_LK_sale, Phí admin sale, %KPI CEO/TPKD/Admin (không áp dụng với thứ cấp).

### 6.4. Lãi dự kiến

Trang chi tiết mục **3. Cơ cấu doanh thu / giá vốn**:
- Bước 1: Doanh thu về cty
- Bước 2: Chi phí (chỉ liệt kê khoản có số > 0)
- Bước 3: Lợi nhuận = DT − Tổng chi

---

## 7. Đối chiếu doanh thu (`/revenues`)

Dùng khi CĐT chốt biên bản đối chiếu 1 đợt.

### 7.1. Tạo mới

2 cách:
- Từ `/products/{id}` mục 4 → nút **+ Thêm đợt** (khuyến khích, tự prefill căn)
- Từ `/revenues` → **+ Thêm đợt đối chiếu**

### 7.2. Trường

| Trường | Ý nghĩa |
|---|---|
| Căn (sản phẩm) | Prefill nếu vào từ product detail. **Không sửa được khi Sửa đợt** |
| Đợt số | 1-5 tùy hợp đồng |
| Ngày ĐC | Ngày ký biên bản ĐC |
| Số biên bản | Số BB ĐC |
| Số HĐ / Ngày HĐ / Giá trị HĐ | Nếu trùng HĐ đã có, hệ thống tự link |
| %PMG_LK lũy kế đến đợt | vd đợt 3 lũy kế 60% |
| %thu PMG đợt này | Riêng đợt này (30%, 20%…) |
| Giá tính PMG (chốt lúc tạo) | Snapshot, không sửa được khi vào Sửa |
| DT theo tiến độ đợt này | Số CĐT phải chuyển đợt này |
| Phí admin (đợt này) | Nếu có |
| CĐT thưởng sale/QL (đợt này) | Nếu có |
| Tổng phải thu đợt này | Số cuối cùng |

### 7.3. Ghi nhận thu tiền

Ở cuối form (**chỉ khi tạo mới**, sửa không thấy):
- Ngày nhận tiền
- Số tiền thực nhận

→ Hệ thống tạo 1 dòng payment_in liên kết. Nếu chưa nhận cứ để trống.

### 7.4. Trang list

Cột **Đã thu** hiện `Chưa thu` (xám) nếu chưa có payment_in record → dò lại với admin.

---

## 8. Đối chiếu giá vốn (`/costs`)

Dùng khi trả tiền HH sale / KPI / thưởng cho từng cá nhân.

Mỗi dòng = **1 người × 1 căn × 1 lần đối chiếu**.

### 8.1. Tạo mới

- Từ `/products/{id}` mục 5 → **+ Thêm dòng** (prefill căn)
- Từ `/costs` → **+ Thêm dòng đối chiếu**

### 8.2. Loại chi phí

| Enum | Nhãn | Áp dụng |
|---|---|---|
| `sale_commission` | Hoa hồng sale | HH cho NVKD |
| `customer_support` | Hỗ trợ khách | Chiết khấu cho khách qua NVKD |
| `bonus_sale` | Thưởng NVKD (CTY) | BRE thưởng NVKD |
| `bonus_manager` | Thưởng TPKD (CTY) | BRE thưởng TPKD |
| `cdt_bonus_sale` | Thưởng nóng CĐT (NVKD) | CĐT trả thêm ngoài %PMG |
| `cdt_bonus_manager` | Thưởng nóng CĐT (TPKD) | Như trên nhưng cho TPKD |
| `kpi_ceo` | KPI CEO | Trích từ HH CĐT trả BRE |
| `kpi_tpkd` | KPI TPKD (Trưởng phòng) | Như trên |
| `kpi_admin` | KPI Admin | Như trên |

### 8.3. Trường

Section "Cơ sở tính (chốt lúc tạo)":
- Giá tính PMG sale, %PMG_LK_sale, %PMG đã thu — snapshot, không sửa khi Sửa

Section "Hoa hồng sale" (khi cost_type = sale_commission):
- %HH sale, PMG đợt này, PMG phải trả đợt này...

Section "KPI" (khi cost_type = kpi_*):
- %KPI, Tiền KPI đợt này

Section "Thưởng" (khi cost_type = bonus_*):
- Chỉ có "Tổng phải trả" — số sau VAT (chia 1.1)

**Tổng phải trả đợt này (VND)**: bắt buộc, số cuối cùng.

### 8.4. Ghi nhận chi tiền

Ở cuối form (chỉ khi tạo mới):
- Ngày thanh toán
- Số tiền thanh toán

→ Tạo 1 dòng payment_out liên kết.

---

## 9. Báo cáo (`/reports`)

Trang tổng hợp theo thời gian + phòng/NVKD.

### 9.1. Filter thời gian

- **Năm**: chọn từ dropdown (chỉ hiện năm có data)
- **Khoảng**:
  - Cả năm
  - Q1 (T1-T3), Q2 (T4-T6), Q3 (T7-T9), Q4 (T10-T12)
  - Nửa đầu năm (T1-T6), Nửa cuối năm (T7-T12)

Filter apply xuyên suốt: KPI cards, theo phòng, top NVKD, chi tiết dự án.

### 9.2. Cơ sở filter

Dựa vào **`products.recognitionMonth`** (tháng ghi nhận DT). Vd căn ghi nhận T3/2025 → thuộc Q1 2025.

### 9.3. Các bảng

- **KPI cards**: DT dự kiến, GV dự kiến, lãi gộp, biên LN, DT/GV đã ĐC, công nợ thuần
- **Theo phòng**: bán tốt nhất phòng nào
- **Top NVKD**: top 15 doanh thu
- **Ghi nhận DT theo tháng**: dòng thời gian
- **Chi tiết dự án**: từng dự án + vai trò (F1/F2/Thứ cấp)

---

## 10. Từ điển thuật ngữ

| Viết tắt | Nghĩa |
|---|---|
| **CĐT** | Chủ đầu tư — người sở hữu dự án |
| **F1** | Sàn phân phối chính, nhận trực tiếp từ CĐT |
| **F2** | Sàn phụ, nhận từ F1 |
| **PMG** | Phí môi giới — hoa hồng CĐT trả sàn theo % giá tính PMG |
| **%PMG_LK** | Tỷ lệ HH liên kết CĐT trả cho sàn F1 (5.5%, 6%, 7%…) |
| **%PMG_LK_sale** | Tỷ lệ F1 trả tiếp cho F2 dưới |
| **HH** | Hoa hồng |
| **NVKD** | Nhân viên kinh doanh (sale) |
| **TPKD** | Trưởng phòng kinh doanh = Trưởng phòng = Quản lý sàn |
| **KPI** | % trích ra cho CEO/TPKD/Admin từ HH CĐT trả BRE |
| **BLĐ** | Ban lãnh đạo |
| **ĐC** | Đối chiếu |
| **HĐ / BB** | Hóa đơn / Biên bản |
| **DT** | Doanh thu |
| **GV** | Giá vốn |
| **Q** | Số BRE giữ để chia = PMG × %PMG_LK − phí admin CĐT |
| **CK** | Chiết khấu |
| **snapshot** | Số chốt tại thời điểm tạo đợt ĐC — không sửa được |

---

## Ghi chú vận hành

- **Session Supabase auto-pause sau 7 ngày idle** → nếu login mà 504 timeout → cty vào Supabase console restore lại
- **UptimeRobot ping /api/keep-alive mỗi 5 phút** để chống pause
- **Repo**: `bre-estate/crm` (KHÔNG phải artt-platform)
- Có bug/thắc mắc → screenshot + note trong file này hoặc báo dev
