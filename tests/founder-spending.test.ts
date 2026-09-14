import { describe, test, expect } from "vitest";
import { classifyFounderSpend, isCompanySpend, isDeposit, type FounderSpendRow } from "@/lib/founder-spending-core";

const row = (title: string, detail = "", capital = "Có"): FounderSpendRow =>
  ({ month: "2025-08", date: "2025-08-01", person: "Bách", title, detail, payee: "", amount: 1, capital });

describe("isDeposit và isCompanySpend", () => {
  test("nộp tiền vào tài khoản công ty không phải chi phí, vì sao kê đã ghi lệnh chi sau đó", () => {
    expect(isDeposit(row("Topup"))).toBe(true);
    expect(isDeposit(row("Nộp tiền vào tài khoản để chi lương"))).toBe(true);
    expect(isDeposit(row("Kí quỹ A&T Sài Gòn Riverside"))).toBe(true);
    expect(isDeposit(row("Tiền điện"))).toBe(false);
    expect(isCompanySpend(row("Topup"))).toBe(false);
  });
  test("khoản công ty đã trả và khoản từ doanh thu thứ cấp đều không tính vào chi phí", () => {
    expect(isCompanySpend(row("Máy Gimbal", "", "Không (công ty đã trả)"))).toBe(false);
    expect(isCompanySpend(row("HH quản lý sang nhượng", "", "Không (thứ cấp)"))).toBe(false);
    expect(isCompanySpend(row("Tiền điện"))).toBe(true);
  });
});

describe("classifyFounderSpend", () => {
  test("mặt bằng, tiện ích, dịch vụ toà nhà", () => {
    for (const t of ["Mặt bằng", "Tiền điện", "Phí quản lý mặt bằng", "Cọc thuê văn phòng căn SH03", "Book Btaskee dọn VP"])
      expect(classifyFounderSpend(row(t))).toBe("thue_vp");
  });
  test("quảng cáo và tuyển dụng", () => {
    for (const t of ["Tiền CP quảng cáo FB Ads", "Nạp Tiền Google Ads", "Đăng tin tuyển dụng Chợ Tốt", "Tờ rơi AT Saigon Riverside"])
      expect(classifyFounderSpend(row(t))).toBe("marketing");
  });
  test("dịch vụ mua ngoài", () => {
    for (const t of ["Thành lập công ty", "Mua tên miền", "Google Workspace", "Chi phí nâng cấp hosting web bre"])
      expect(classifyFounderSpend(row(t))).toBe("dich_vu_ngoai");
  });
  test("lương thưởng cho người của công ty", () => {
    expect(classifyFounderSpend(row("Lương", "Hồ Gia (Marketing)"))).toBe("luong_admin");
    expect(classifyFounderSpend(row("Thưởng Tết"))).toBe("luong_admin");
  });
  test("lễ nghi và phúc lợi nội bộ vào chi khác, tiếp đối tác vào tiếp khách", () => {
    expect(classifyFounderSpend(row("Cúng thần tài thổ địa"))).toBe("opex_khac");
    expect(classifyFounderSpend(row("Tất niên công ty"))).toBe("opex_khac");
    expect(classifyFounderSpend(row("Đi ăn với đối tác"))).toBe("tiep_khach");
  });
  test("đồ dùng thiết bị, và giao nhận giấy tờ", () => {
    expect(classifyFounderSpend(row("Thiết bị", "Máy in Laser"))).toBe("do_dung_vp");
    expect(classifyFounderSpend(row("Giao Giấy Tờ Cho KH"))).toBe("di_lai");
  });
  test("không khớp luật nào thì về chi khác", () => {
    expect(classifyFounderSpend(row("Khoản lạ chưa từng gặp"))).toBe("opex_khac");
  });
});
