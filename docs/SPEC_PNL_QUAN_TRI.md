# SPEC: Lãi/lỗ quản trị (Management P&L)

Trang `/reports/profit-detail`. Code: `lib/management-pnl-core.ts` (hàm thuần, test `tests/management-pnl.test.ts`), `lib/management-pnl.ts` (nạp DB), `lib/reference/kim-pnl-2025.ts` (số kế toán để đối chiếu).

Mục tiêu: ra được báo cáo lãi lỗ theo đúng format "BC chi tiết lợi nhuận" của kế toán mà không phải chờ sổ kế toán, và khi có sổ thì đối chiếu được từng dòng.

## 1. Nguồn từng dòng

| Dòng | Nguồn | Ghi chú |
|---|---|---|
| 1.1 Doanh thu gồm VAT | `revenue_reconciliations.total_receivable_this_time` theo `reconciliation_date` | Gồm thưởng nóng CĐT. Kế toán xác nhận nguyên tắc dồn tích theo ngày đối chiếu (27/07/2026) |
| 1.2 Không VAT | 1.1 / 1,1 | |
| 1.3, 1.4 Thưởng CĐT | cột `cdt_bonus_sale`, `cdt_bonus_manager` | |
| 2.1 đến 2.8 Giá vốn | `cost_reconciliations.amount_payable_this_time` theo `cost_type` + `year_end_accruals` (trích trước 31/12) − hoàn nhập | Map: sale_commission→2.1, customer_support→2.2, cdt_bonus_sale→2.3, cdt_bonus_manager→2.4, bonus_manager→2.5, kpi_tpkd→2.6, kpi_admin→2.7, kpi_ceo→2.8. `bonus_sale` là thưởng doanh số, không vào giá vốn |
| 4.1 đến 4.5 Chi phí cố định | `accounting_journal` (sổ NKC) đã phân loại 32 nhóm + `year_end_other_accruals` | Chỉ có khi kế toán giao sổ. 2026 chưa có |
| 6.1 Thuế TNDN | NKC, TK 8211 | |

### Hoàn nhập trích trước
Căn đã trích trước ở kỳ trước, kỳ này chi thật thì phần chi được trừ đi tối đa bằng số đã trích, tính từng căn và từng loại chi phí. Mã căn so khớp sau khi đưa về dạng `A-05-07` (bỏ dấu chấm, dấu cách). Ví dụ 2026: HH sale đối chiếu 3,12 tỷ, hoàn nhập 752tr (trích 842tr năm 2025, đã chi 752tr), giá vốn 2026 là 2,37 tỷ.

## 2. Kết quả đối chiếu năm 2025 với báo cáo kế toán (rà 11/09/2026)

| Dòng | App | Kế toán | Lệch | Nguyên nhân |
|---|---|---|---|---|
| 1.1 Doanh thu gồm VAT | 4.759.775.969 | 4.681.373.087 | +78.402.882 | (a) DXMD tạm ứng 800.528.873 ngày 10/12/2025 cho 6 căn A&T Saigon Riverside. Bảng kê của app là 880.581.759 gồm VAT, tức tạm ứng chưa gồm VAT. Kế toán coi 800,5tr đã gồm VAT nên ghi doanh thu 727,8tr, chênh +80.052.886 gross. (b) Kế toán có HĐ 19 thưởng booking ATR 1,5tr không gắn căn, chênh −1.650.000 |
| 2.1 Hoa hồng | 1.794.473.526 | 1.794.473.527 | −1 | Khớp |
| 2.2 Hỗ trợ khách | 83.539.516 | 83.539.517 | −1 | Khớp |
| 2.3, 2.4, 2.5, 2.8 | | | 0 | Khớp |
| 2.6 KPI TPKD | 50.195.594 | 52.473.023 | −2.277.429 | Kế toán gồm 2.277.429 căn B.26.20 ghi nhầm đã chi 19/11/2025, đã tự xóa trên Drive 09/2026 |
| 2.7 Admin | 7.958.739 | 7.958.743 | −4 | Làm tròn |
| 4 Chi phí cố định | 1.400.658.993 | 1.382.433.657 | +18.225.336 | Kế toán gõ tay 4.1 đến 4.4, dòng 4.5 là phần dư. Lệch từng dòng: 4.1 +9,1tr, 4.2 −13,1tr, 4.3 +29,9tr, 4.4 −13,2tr, 4.5 +5,6tr. Chưa có giải thích, cần hỏi kế toán cách gộp |

Kết luận: giá vốn tính từ đối chiếu CRM + trích trước khớp kế toán tới từng đồng. Doanh thu lệch một khoản có nguyên nhân rõ. Chi phí cố định lệch 1,3% ở mức tổng.

## 3. Vấn đề dữ liệu phát hiện khi đối chiếu (chưa sửa, chờ Admin và kế toán)

1. **Thu tiền 6 căn ATSR DXMD ghi 880.581.759, bank chỉ nhận 800.528.873** (10/12/2025). `payments_in` của 6 đối chiếu ngày 09/12/2025 ghi đủ số phải thu gồm VAT, trong khi DXMD mới tạm ứng phần chưa VAT. Còn 80.052.886 VAT chưa thu, sẽ thu khi xuất hóa đơn. Cần Admin sửa số đã thu trên Excel/app.
2. **Hóa đơn số 30 ngày 09/12/2025 gắn cho căn B-15-01 (ATSR)** trùng số với hóa đơn 30 ngày 19/11/2025 của BAMLAND. DXMD chưa xuất hóa đơn, khoản này là bảng kê tạm ứng số 01. Cần Admin bỏ liên kết hóa đơn.
3. **HĐ 19 thưởng booking ATR 1.500.000** (17/09/2025) kế toán ghi doanh thu, app không có vì không gắn căn nào.
4. Kế toán chưa giao sổ NKC 2026 nên mục 4 năm 2026 trống.

## 4. Chưa làm
- Chi phí cố định 2026 từ nguồn khác sổ NKC (bảng lương Drive, sao kê đã duyệt phân loại, hóa đơn mua vào). Làm sau khi chốt 2025.
- Xuất Excel báo cáo.
