---
name: kiem-chung-so-lieu
description: Dùng mỗi khi sắp khẳng định một con số đúng hay sai, giải thích vì sao một khoản lệch, hay kết luận nguyên nhân của một sai sót dữ liệu trong CRM. Cũng dùng khi người dùng hỏi "chắc chưa", "sao biết", hoặc khi định sửa dữ liệu thật dựa trên một suy luận.
---

# Không khẳng định khi chưa có phép thử

Luật gốc: **mỗi khẳng định về số liệu phải gắn với một phép thử chạy được.**
Không có phép thử thì nói là chưa rõ, đừng nói là sai.

Đã có tiền lệ xấu trong dự án này:

- Migration 0058 nâng %PMG vì tưởng cấu hình thiếu 0,5%, thực ra khoản đó
  nằm ở cột khác và đang được cộng. Phải hoàn tác.
- Báo "còn chi dư 15.052.711" bằng cách nhân tỷ lệ vào số cũ, mà số cũ vốn
  đã tính trên nền sai. Con số đúng tính theo lũy kế 85% là khác hẳn.
- Báo dòng 6137 sai tỷ lệ, trong khi loại chi phí đó là khoản cố định,
  công thức không dùng tỷ lệ.
- Đề nghị dựng bảng ánh xạ tài khoản để chữa "phân loại sai", trong khi
  phân loại đang đúng theo thiết kế và chỉ bảng in ra là thiếu.

Điểm chung: suy từ một dấu hiệu rồi kết luận, không mở dữ liệu ra kiểm.

## Đừng viết lại công thức app đã có

Lỗi tốn thời gian nhất không phải tính sai, mà là **tự viết công thức mới
trong khi app đã có sẵn**. Viết lại lần hai thì sai lần hai, và hai nơi lệch
nhau âm thầm.

Đã xảy ra: trang Soát dữ liệu tự tính doanh thu kỳ vọng bằng %PMG mốc cuối
hợp đồng, trong khi form nhập dùng %PMG ghi trên từng đợt. %PMG tăng dần
theo mốc nên mọi căn chưa tới mốc chót bị báo thiếu oan. Hai căn B.23.24 và
A2-06-17 gắn nhãn sai, thực tế lệch đúng 0.

**Trước khi viết bất kỳ phép tính tiền nào, tìm xem app đã có chưa:**

| Việc | Gọi hàm |
|---|---|
| Doanh thu lũy kế, số tiền từng đợt | `lib/doanh-thu-core.ts` |
| Trần giá vốn theo loại chi phí | `computeLuyKe()` ở `lib/costCalc.ts` |
| Chốt chặn khi lưu | `lib/actions/cap-guards.ts` |

Thấy hai chỗ cùng tính một thứ thì gộp lại một hàm chung rồi mới dùng, đừng
để song song. Gộp xong ghim bằng test trong `tests/`.

## Ba mức chắc chắn, phải nói rõ đang ở mức nào

| Mức | Nghĩa | Cách nói |
|---|---|---|
| Dữ kiện | đọc được từ database, file, hoặc log | "dòng 6117 ghi 10.000.000" |
| Trích lời | ai đó nói, có nguồn | "Admin nói trong tin nhắn 06/10 lúc 10:59" |
| Suy luận | mình tự ghép | "công thức này **mình suy ra**, chưa ai xác nhận" |

Không bao giờ trộn ba mức vào một câu khẳng định. Khi trích lời người khác,
dẫn đúng chỗ và đúng chữ, đừng diễn giải thành con số mà họ không nói.

## Bộ bất biến đã kiểm trên dữ liệu thật

Chạy lại bất cứ lúc nào để biết dữ liệu còn lành không. Mười một dòng đầu
đúng 100% tại ngày 09/10/2026, nên dòng nào gãy là có chuyện thật.

### products

| Phép thử | Ý nghĩa |
|---|---|
| `pmg_base_price > 0` | giá tính PMG phải dương |
| `other_fee_pct = 0` | đã gộp vào `pmg_rate` ở migration 0061, khác 0 là bị hồi sinh |
| `pmg_sale_rate <= pmg_rate` | cơ sở giá vốn không cao hơn cơ sở doanh thu |
| `0 < pmg_rate <= 0.1` | tỷ lệ PMG, không phải phần trăm nhân 100 |
| `sale_commission_rate <= 1` | %HH lưu dạng phân số |

### revenue_reconciliations

| Phép thử | Ý nghĩa |
|---|---|
| `total_receivable_this_time = revenue_this_time + cdt_bonus_sale + cdt_bonus_manager` | tổng phải bằng ba thành phần |
| `0 <= phase_pct_this_time <= 1` | tiến độ là LŨY KẾ, không cộng dồn giữa các đợt |
| `pmg_cumulative_pct <= 0.1` | đây là TỶ LỆ PMG, không phải tiến độ. Nhầm hai cột này đã gây lỗi nhiều lần |
| `SUM(revenue_this_time) <= pmg_base_price × pmg_rate` | trần hoa hồng theo hợp đồng |

### cost_reconciliations

| Phép thử | Ý nghĩa |
|---|---|
| `employee_name` không rỗng | không có tên thì tiền không vào bảng lương ai |
| `payment_progress_pct <= 1` | tiến độ khách đóng không quá 100% |
| `commission_rate <= 1` | %HH dạng phân số |
| `pmg_lk_sale_rate <= products.pmg_sale_rate` | **chỉ áp cho loại tính theo tỷ lệ** |
| `SUM(amount_payable_this_time) <= computeLuyKe(cfg, loai, 1)` | trần theo loại chi phí |

**Năm loại là khoản cố định, công thức KHÔNG dùng `pmg_lk_sale_rate`**, đừng
bắt lỗi tỷ lệ ở đây: `bonus_sale`, `bonus_manager`, `cdt_bonus_sale`,
`cdt_bonus_manager`, `customer_support`.

Ngưỡng bỏ qua 5.000 đồng, dưới mức đó là sai số làm tròn.

## Trước khi sửa dữ liệu thật

1. Chạy phép thử, in ra số trước khi sửa
2. Viết migration đặt **giá trị đích tuyệt đối**, không cộng trừ tương đối,
   để chạy lại nhiều lần vẫn ra một kết quả
3. Chạy lại phép thử, in ra số sau khi sửa
4. Nếu không có phép thử nào phân biệt được đúng sai thì **không sửa**, hỏi
   người phụ trách

Cộng trừ tương đối là cái đã làm hỏng ở migration 0058 và ở ước tính chi dư
FENICA.

## Nguồn sự thật cho từng loại số

| Số | Hỏi ai, đọc đâu |
|---|---|
| %PMG, cấu trúc phí, bậc sản lượng | sheet `1_HOP DONG` của Bao Cao Doanh Thu.xlsx |
| Tỷ lệ và tiến độ từng đợt doanh thu | sheet `2.2_Doanh thu`, cột M và P |
| Cơ sở tính giá vốn | sheet `2.3_Gia von`, cột M |
| Số đã chi từng đợt | sheet `2.3_Gia von`, cột AM |
| Sổ kế toán, cân đối phát sinh | BC BRE 2025.xlsx, BC Bre Q1+2.2026.xlsx |
| Bảng điểm lãi lỗ | BC chi tiết lợi nhuận, do kế toán lập riêng |

Hóa đơn trong app **không phải chứng từ độc lập**: `invoices.total_amount_vat`
là cột dẫn xuất, tự cộng lại từ các dòng đối chiếu gắn với nó. Đừng dùng nó
để chứng minh một dòng đối chiếu là đúng.

## Xưng hô

Kim (kế toán), HR, Admin đều nhỏ tuổi hơn người dùng. Soạn tin nhắn gửi họ
thì gọi "em", không gọi "chị".
