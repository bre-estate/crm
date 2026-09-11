/**
 * Số tham chiếu: "BC chi tiết lợi nhuận 2025", kế toán Hồ Thị Lan Kim lập 05/04/2026,
 * cột "Gồm thưởng của CĐT". File gốc: Drive 4-Kế Toán/6.2-Sổ kế toán/25CN/260405_BC chi tiết lợi nhuận 2025.xlsx
 *
 * Ghi chú lệch được rà 11/09/2026 (docs/SPEC_PNL_QUAN_TRI.md có chi tiết cách đối chiếu).
 */
import type { PnlReference } from "../management-pnl-core";

export const KIM_PNL_2025: PnlReference = {
  label: "BC chi tiết lợi nhuận 2025 (kế toán lập 05/04/2026)",
  period: { start: "2025-01-01", end: "2025-12-31" },
  values: {
    "1": 4_681_373_087,
    "1.1": 4_681_373_087,
    "1.2": 4_255_793_715,
    "1.3": 635_590_909,
    "1.4": 22_000_000,
    "1.5": 3_657_983_798,
    "2": 2_827_358_598,
    "2.1": 1_794_473_527,
    "2.2": 83_539_517,
    "2.3": 578_636_363,
    "2.4": 20_000_000,
    "2.5": 165_000_000,
    "2.6": 52_473_023,
    "2.7": 7_958_743,
    "2.8": 125_277_426,
    "3": 1_428_435_117,
    "4": 1_382_433_657,
    "4.1": 345_221_721,
    "4.2": 83_981_270,
    "4.3": 348_473_123,
    "4.4": 192_330_000,
    "4.5": 412_427_543,
    "4.5a": 168_374_074,
    "5": 4_209_792_255,
    "6": 46_001_460,
  },
  notes: {
    "1.1": "Lệch 78,4tr gồm 2 khoản. (a) A&T Saigon Riverside, DXMD tạm ứng 800.528.873 ngày 10/12/2025: kế toán coi số này đã gồm VAT nên ghi doanh thu 727,8tr; bảng kê 6 căn của app là 880,6tr gồm VAT, tức tạm ứng chưa gồm VAT, chênh +80,05tr. (b) Kế toán có hóa đơn 19 thưởng booking ATR 1,5tr không gắn căn, app không có, chênh −1,65tr.",
    "1.2": "Theo 1.1.",
    "1.5": "Theo 1.1.",
    "2": "Theo 2.6.",
    "2.6": "Kế toán gồm 2.277.429 căn B.26.20 ghi nhầm đã chi ngày 19/11/2025 (sổ giá vốn ô AO38). Kế toán đã tự xóa trên Drive 09/2026, app không có khoản này.",
    "2.7": "Làm tròn 4 đồng.",
    "3": "Theo 1.1 và 2.6.",
    "4": "Kế toán gõ tay 4.1 đến 4.4, dòng 4.5 là phần dư (tổng chi phí trừ các dòng trên). Không có công thức dẫn về sổ nên chỉ đối chiếu được ở mức tổng. App gom từ sổ NKC theo tài khoản và diễn giải.",
    "4.4": "Kế toán gõ tay 170.830.000 + 21.500.000. App lấy các dòng NKC 6417 quảng cáo, tờ rơi, phân bổ Batdongsan và tay cầm chống rung.",
    "4.5": "Dòng dư của kế toán, gồm cả phân bổ thiết bị 59,9tr (TK 6423) và chi không hóa đơn 105,2tr (TK 811).",
    "4.5a": "Kế toán: 13tr × 12 tháng + 12.374.074 thuế đóng thay chủ nhà. App gồm thêm 3tr thuê trụ sở Nguyễn Xí và 909k internet trả trước.",
    "5": "Theo các dòng trên.",
    "6": "Kế toán ghi chú trong file: hai cách tính lệch nhau chưa tìm ra nguyên nhân.",
  },
};
