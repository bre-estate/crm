# SPEC: Kỳ hoa hồng & thưởng (2 tháng)

Chốt với operator 2026-09-08. Nguồn chính sách: `docs/Chính Sách Lương/` (6 file .docx), bảng `commission_policies` (drizzle/0041), helper `lib/commission-policy.ts`.

## 1. Nguyên tắc

1. Mọi thứ quy về **doanh thu** và **giá vốn**.
   - Doanh thu: lũy kế theo kỳ, hồi tố khi đạt mức lũy kế tiếp theo. Tính cho cá nhân và cho phòng. Là cơ sở xét NVKD hưởng 50% hay 55%, và có thưởng doanh số hay không.
   - Giá vốn: dựa trên doanh thu để tính hoa hồng chi cho nhân viên theo tháng hoặc theo kỳ. Tính đúng giá vốn thì mới ra lãi lỗ đúng.
2. App hỗ trợ HR tính chi hoa hồng + thưởng hàng tháng cho NVKD, TPKD, CEO, Admin.
3. Khi có hồi tố: có view liệt kê căn đã chi rồi nhưng do đạt mức lũy kế nên rate tăng, HR từ đó tạo đối chiếu mới cho đợt tiếp theo.
4. Phát hiện chi dư đợt trước để hoàn lại đợt sau.
5. Thể hiện chi theo kỳ: cuối mỗi kỳ (T2, T4, T6...) HR tính được phần cuối kỳ: thưởng doanh số NVKD (mốc 80tr / 100tr), KPI TPKD (tier 2..5%).

## 2. Định nghĩa

### Kỳ
Kỳ = 2 tháng cặp: P1 = T1-2, P2 = T3-4, P3 = T5-6, P4 = T7-8, P5 = T9-10, P6 = T11-12. Key: `YYYY-P{n}`. Ngày cuối kỳ = ngày cuối tháng chẵn. Chính sách áp cho kỳ = chính sách hiện hành tại **ngày cuối kỳ**.

### Căn thuộc kỳ nào
Ưu tiên theo thứ tự (cột "Căn cứ kỳ" trên UI):
1. `products.recognition_month` (Tháng ghi nhận, YYYY-MM) nếu có.
2. `deposit_date` (ngày cọc). Mặc định, vì chính sách ghi "doanh thu sản phẩm đã cọc".
3. Tháng của đợt đối chiếu doanh thu đầu tiên có `revenue_this_time > 0` (chỉ khi thiếu ngày cọc).

Kiểm chứng trên data thật (2026-09-09): theo ngày cọc, Trần Minh Nhật kỳ T3-4/2026 có 388tr ≥ mốc 200tr → 55%, khớp các ĐC đã tạo ở 55%. Nếu dùng "đợt doanh thu đầu" thì Hồ Gia kỳ T5-6 gom 10 căn (1,44 tỷ → 4%) trong khi HR chỉ tính 3 căn (401,8tr → 2%). Ba căn HR đưa vào T5-6 dù cọc 28-29/04 (A1-21-17, A2-15-15, B2-22-05) là ngoại lệ: điền Tháng ghi nhận = 2026-05 trên căn.

Phòng chỉ xét KPI TPKD khi có nhân viên position `tpkd` thuộc phòng (bỏ BLĐ, CTV, Hành chính).

### Doanh thu xét tier
`revenue = pmg_base_price × pmg_rate − admin_fee` (gross, chưa trừ VAT, **không** gồm CĐT thưởng nóng). Khớp cột "Doanh thu sản phẩm đã cọc" của HR (A1-21-17 = 149.186.720).

- Doanh thu cá nhân = Σ revenue căn trong kỳ có `sales_person` = người đó (alias gộp về owner: Hạ Sang / Thu Thảo → Đoàn Lê Bách).
- Doanh thu phòng = Σ revenue căn trong kỳ có `department_id` = phòng.

### Rate mong đợi theo chính sách
| Loại chi phí | Vai trò | Rate |
|-|-|-|
| `sale_commission` | nvkd, tpkd (HH cá nhân), ceo | `nvkdRate(policy nvkd, doanh thu cá nhân)`: 50% dưới mốc, 55% từ mốc (200tr trước 01/05/2026, 400tr sau) |
| `sale_commission` | ctv | 65% flat (từ 01/07/2026) |
| `kpi_tpkd` | tpkd | `tpkdManagerRate(policy tpkd, doanh thu phòng)`: 0 / 2 / 3 / 4 / 5% theo mốc 400tr / 800tr / 1 tỷ / 1,5 tỷ |
| `kpi_admin` | admin | 0,25% đến 30/06/2026, 0,5% từ 01/07/2026 |
| `kpi_ceo` | ceo | Chưa có chính sách, giữ config trên căn |

### Thưởng doanh số NVKD (chỉ position `nvkd`)
```
excess = max(0, doanh thu cá nhân kỳ − 60tr)
mốc    = floor(excess / step)        step = 80tr (trước 01/07/2026), 100tr (từ 01/07/2026)
thưởng = mốc × 1tr × 2               (×2 vì kỳ 2 tháng), trần 30tr/kỳ
```
Kiểm chứng: Trần Minh Nhật kỳ T5-6/2026, doanh thu 147tr → (147−60)/80 = 1 mốc → 2tr. Khớp `Bảng HH Sale T6.2026.xlsx`.

## 3. Hồi tố và chi dư

Với mỗi đối chiếu đã có trong kỳ (theo căn thuộc kỳ), so `rate thực` của đối chiếu với `rate mong đợi` của kỳ:

```
chênh = amount × (rate_mong_đợi / rate_thực − 1)
```
- chênh > 0: **hồi tố tăng** (đã chi 50%, kỳ đạt 55%).
- chênh < 0: **chi dư** (đã chi 3% KPI TPKD, phòng chỉ đạt mức 2%), hoàn lại đợt sau.
- Đối chiếu có rate 0 hoặc amount 0 bỏ qua.

Quy tắc chốt với operator: **hồi tố chỉ tính trên đối chiếu mới**. Không sửa đối chiếu cũ. HR bấm "Tạo ĐC hồi tố" → app tạo 1 đối chiếu mới cùng căn, cùng người, cùng loại chi phí, `amount = chênh` (âm nếu chi dư), rate = rate mong đợi, N / M / phí admin sao chép từ đối chiếu gốc, ghi chú tự động `Hồi tố kỳ YYYY-P{n}: 50% → 55% (từ ĐC #id)`. Có nút tạo hàng loạt cho cả kỳ.

Đối chiếu hồi tố có `commission_rate` = rate mong đợi nên chạy lại view sẽ không đề xuất lần nữa. Trần hợp đồng (cap-guard) không chặn hồi tố vì tổng sau hồi tố đúng bằng base × rate mong đợi.

## 4. Màn hình

### `/periods` — danh sách kỳ
Mỗi dòng: kỳ, số căn, doanh thu tổng, số NVKD, số phòng, chênh hồi tố còn treo (+) và chi dư (−), chính sách áp dụng. Link vào chi tiết.

### `/periods/[key]` — chi tiết kỳ, 4 tab
1. **NVKD**: STT, tên, chức vụ, phòng, số căn, doanh thu kỳ, rate mong đợi, HH đã đối chiếu, HH mong đợi, chênh, thưởng doanh số. Xuất Excel "Bảng HH Sale" theo mẫu HR.
2. **TPKD / phòng**: phòng, TPKD, số căn, doanh thu phòng, tier, rate mong đợi, KPI đã đối chiếu, KPI mong đợi, chênh. Danh sách căn trong phòng (mã căn, NVKD, doanh thu, rate đã ĐC). Xuất Excel "Quyết định KPI TPKD" theo mẫu HR.
3. **Admin / CEO**: rate mong đợi Admin, từng căn: KPI Admin đã ĐC, rate thực, chênh; KPI CEO đã ĐC (chỉ hiển thị).
4. **Hồi tố / chi dư**: mọi đối chiếu có chênh ≠ 0, cột: căn, người, loại, ĐC gốc, rate thực → mong đợi, chênh, trạng thái (đã tạo hồi tố chưa), nút tạo. Nút "Tạo tất cả hồi tố kỳ này".

### Form đối chiếu (`/costs/new`, `/costs/[id]/edit`)
Banner đề xuất rate theo chính sách (đã làm ở `909dc02`), dùng cùng cách tính kỳ và doanh thu ở trên (server tính `periodKey` + `revenue` cho từng căn rồi truyền xuống).

## 5. Quyền
Resource mới `periods` (view / edit). Owner mặc định có. HR có view + edit (edit = tạo hồi tố, xuất Excel). Sidebar: Kế toán → "Kỳ HH & thưởng".

## 6. Ngoài phạm vi (làm sau)
- Cron tự tạo KPI TPKD cuối kỳ (E). Hiện HR tạo tay từ tab TPKD hoặc `/costs/new` (đã có đề xuất rate).
- Bảng lương đầy đủ (lương cứng + BHXH) — chỉ hiển thị thưởng doanh số và lương TPKD theo số NVKD như tham khảo.
- CEO chưa có chính sách văn bản.

## 7. Giả định cần operator xác nhận
- Căn cứ kỳ theo thứ tự ở mục 2 (Tháng ghi nhận > ngày cọc > đợt doanh thu đầu). Ba căn T5-6/2026 trong QĐ KPI của HR cần điền Tháng ghi nhận 2026-05.
- TPKD tự đứng tên căn: HH cá nhân theo policy NVKD, không thưởng doanh số.
- CEO (Đoàn Lê Bách) HH cá nhân theo policy NVKD khi tự đứng tên căn.
