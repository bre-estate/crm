---
name: doi-chieu-excel
description: Dùng khi cần đối chiếu số liệu trong app với file Excel của kế toán (Bao Cao Doanh Thu.xlsx), khi người dùng hỏi app và Excel có lệch không, khi kế toán vừa cập nhật file mới, hoặc khi cần truy một khoản chênh lệch giá vốn hay doanh thu về nguyên nhân.
---

# Đối chiếu app với Excel của kế toán

## Chạy trước, đọc kết quả sau

```bash
npx tsx --env-file=.env.local scripts/doi-chieu-gia-von.ts
```

Script chỉ đọc, không ghi. Đọc kỹ phần đầu file script: nó ghi sẵn cách lấy số
từ từng cột và những chênh lệch đã tra ra nguyên nhân.

## Cấu trúc file Excel

File: `data-excel/Bao Cao Doanh Thu.xlsx`. Sheet giá vốn: `2.3_Gia von`, tiêu
đề ở **dòng 4**, dữ liệu từ dòng 5.

Khóa nối với app là cột **D `Ma_SP`**, khớp `products.product_code`. Không phải
cột E `Ma_can`. Nhầm hai cột này thì mọi mã đều báo "không có trong Excel".

| Cột | Tiêu đề | Ánh xạ |
|---|---|---|
| V | PMG phai tra dot nay (gross) | `sale_commission` |
| X | Chi hỗ trợ cho khách | `customer_support` |
| Y | CĐT thuong sale (trừ VAT) | `cdt_bonus_sale` |
| Z | CĐT thuong QL san | `cdt_bonus_manager` |
| AA | CTY thuong sale | `bonus_sale` |
| AB | CTY thuong quan ly | `bonus_manager` |
| AD, AE, AF | KPI CEO: lũy kế, đã TT, còn TT đợt này | `kpi_ceo` |
| AH, AI, AJ | KPI TPKD: lũy kế, đã TT, còn TT đợt này | `kpi_tpkd` |
| AL | Thuong Admin (VND) | `kpi_admin` |
| AM | Tong phai tra dot nay | tổng cả dòng |
| AO | Số tiền thanh toán | tiền thật chi |

## Bốn cái bẫy

**1. KPI CEO và KPI TPKD lấy tổng các đợt, không lấy lũy kế.** Tiền chi theo
đợt nên số đối chiếu cũng theo đợt. Đếm trên toàn bộ dữ liệu: app khớp cách
này ở 37/37 mã KPI CEO và 40/41 mã KPI TPKD, không mã KPI CEO nào chỉ khớp
lũy kế.

**2. Cột AM không tách được theo loại chi phí.** 72 dòng chứa từ hai loại trở
lên, AM gộp chung. Chỉ dùng AM cho dòng có đúng một loại, và chỉ ở ba dòng đã
khai trong `GHI_DE_AM` của script.

**3. Dòng điều chỉnh có thể chỉ ghi vào AM.** Dòng 445 ghi -400.000 vào AM và
bỏ trống AJ, trong khi dòng 443 ghi -5.500.000 vào cả V lẫn AM. Không nhất
quán, phải soi từng dòng.

**4. Chênh lệch có thể đã được giải thích rồi.** Xem `DA_GIAI_THICH` trong
script trước khi đi truy lại.

## Khi gặp chênh lệch mới

1. In đủ mọi cột có số của dòng đó, kèm tiêu đề gốc. Đừng chỉ nhìn cột đang đọc.
2. So AM với tổng các cột khoản trên cùng dòng.
3. So AM với AO. Bằng nhau thì AM là số thật sự chi.
4. Tính trần bằng `computeLuyKe()` để biết số nào nằm trong trần.
5. Dò sao kê theo **số tiền**, không dò theo ngày. Ngày trong Excel hay là
   ngày dự kiến chứ chưa xảy ra.

## Tuyệt đối không

- Không tự suy ra nguyên nhân rồi báo là đã giải thích. Chỉ nêu dữ kiện, còn
  đúng sai là việc của Sale Admin và kế toán.
- Không sửa dữ liệu trong app cho khớp Excel. Báo số, chờ người quyết.
