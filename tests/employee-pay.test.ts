import { describe, test, expect } from "vitest";
import { classifyPayDescription, groupOf, matchEmployee, summarizeEmployeePay, type EmployeeLite, type PayRow } from "@/lib/employee-pay-core";
import type { CommissionPolicy } from "@/lib/commission-policy";

const emps: EmployeeLite[] = [
  { id: 1, name: "Đoàn Lê Bách", position: "ceo" },
  { id: 3, name: "Hồ Nguyễn Công Thành", position: "tpkd" },
  { id: 10, name: "Trần Minh Nhật", position: "nvkd" },
  { id: 19, name: "Danh Hoàng Thị Tường Vi", position: "admin" },
  { id: 34, name: "Hồ Thị Lan Kim", position: "ctv", note: "Kế toán dịch vụ ngoài" },
  { id: 46, name: "Trần Bình Trọng", position: "ctv" },
  { id: 16, name: "Võ Thị Thu Thảo", position: "nvkd" },
];
const policies: CommissionPolicy[] = [
  { id: 1, role: "tpkd", effectiveFrom: "2025-04-01", effectiveTo: null, cycleMonths: 2, baseRate: 0, tiers: null, baseSalary: 8_000_000, probationSalary: null, apprenticeSalary: null, bonusFloor: null, bonusStep: null, bonusStepAmount: null, bonusCycleMultiplier: null, bonusCapPerCycle: null, managerBonusTiers: null, managerSalaryTiers: null, managerProbationSalary: 8_000_000 },
];

describe("matchEmployee và groupOf", () => {
  test("khớp tên không dấu, kể cả sao kê có đuôi; kế toán dịch vụ vào khối quản lý dù position ctv", () => {
    expect(matchEmployee("TRAN MINH NHAT", emps)!.id).toBe(10);
    expect(matchEmployee("DOAN LE BACH ID: 123", emps)!.id).toBe(1);
    expect(matchEmployee("NGUYEN MINH TRIET", emps)).toBeNull();
    expect(groupOf(emps[4])).toBe("quan_ly");
    expect(groupOf(emps[5])).toBe("kinh_doanh");
    expect(groupOf(emps[0])).toBe("quan_ly");
  });
});

describe("classifyPayDescription", () => {
  test("đọc diễn giải sao kê thật", () => {
    expect(classifyPayDescription("Cong ty BRE thanh toan luong T12")).toBe("luong_cung");
    expect(classifyPayDescription("BRE thanh toan thu lao va phu cap thang 1.2025")).toBe("thu_lao_phu_cap");
    expect(classifyPayDescription("Bre thanh toan hoa hong sale dot 1 can B.06.07 TT AVIO")).toBe("hoa_hong");
    expect(classifyPayDescription("Thuong nong nhan vien kinh doanh")).toBe("hoa_hong");
    expect(classifyPayDescription("BRE TT thuong doanh so CTVKD thang 9+10")).toBe("thuong_doanh_so");
    expect(classifyPayDescription("BRE thuong Tet duong lich")).toBe("thuong_khac");
    expect(classifyPayDescription("BRE TT Luong thang 10 2025 + Hoa hong can B.11.06 TT AVIO")).toBe("luong_va_hh");
    expect(classifyPayDescription("BRE thanh toan phi dich vu thang 12.2024")).toBe("dich_vu_ke_toan");
    expect(classifyPayDescription("BRE TT Hoan tien YCTV du an FENICA")).toBe("khong_tinh");
    expect(classifyPayDescription("BRE TT Ung Chi Phi Thang 4 2026")).toBe("khong_tinh");
    expect(classifyPayDescription("BRE thanh toan HH 26-06")).toBe("hoa_hong");
    expect(classifyPayDescription("BRE TT LUONG + PHU CAP + THUONG T12 2025")).toBe("luong_va_hh");
    expect(classifyPayDescription("BRE TT Thuong + Thu nhap khac T01 2026")).toBe("hoa_hong");
    expect(classifyPayDescription("BRE TT THU LAO CTV + HO TRO + THUONG CTV T12 2025")).toBe("luong_va_hh");
    expect(classifyPayDescription("BRE TT Thuong thang 5")).toBe("thuong_khac");
    expect(classifyPayDescription("BRE TT THUONG DOANH SO T11+T12 2025")).toBe("thuong_doanh_so");
  });
});

describe("summarizeEmployeePay", () => {
  const rows: PayRow[] = [
    { date: "2025-10-06", partnerName: "HO NGUYEN CONG THANH", amount: 8_000_000, description: "BRE thanh toan luong thang 9 2025" },
    { date: "2025-11-05", partnerName: "HO NGUYEN CONG THANH", amount: 129_853_495, description: "BRE TT Luong thang 10 2025 + Hoa hong can B.11.06 TT AVIO" },
    { date: "2025-11-05", partnerName: "DOAN LE BACH", amount: 43_425_000, description: "BRE TT luong thang 10 2025 + Thuong nong QL can B.11.06" }, // chưa có lương trước đó, CEO không có chính sách
    { date: "2025-02-10", partnerName: "TRAN MINH NHAT", amount: 2_708_095, description: "BRE thanh toan thu lao va phu cap thang 1.2025" },
    { date: "2025-05-13", partnerName: "TRAN MINH NHAT", amount: 29_678_454, description: "BRE thanh toan Hoa hong sale dot 1 can AVO-A.23.25" },
    { date: "2025-01-14", partnerName: "HO THI LAN KIM", amount: 3_000_000, description: "BRE thanh toan phi dich vu thang 12.2024" },
    { date: "2026-07-16", partnerName: "VO THI THU THAO", amount: 150_000_000, description: "BRE TT Hoan tien YCTV du an FENICA" },
    { date: "2025-11-24", partnerName: "NGUYEN DANG KHIET", amount: 13_000_000, description: "thue nha" },
  ];
  const s = summarizeEmployeePay(rows, emps, policies);

  test("lệnh gộp tách bằng lương tháng gần nhất của người đó", () => {
    const thanh = s.people.find((p) => p.employee.id === 3)!;
    expect(thanh.byKind.luong_cung).toBe(16_000_000);
    expect(thanh.byKind.hoa_hong).toBe(121_853_495);
    expect(thanh.lumpSplits[0]).toMatchObject({ luong: 8_000_000, hoaHong: 121_853_495, basis: "lương tháng gần nhất" });
  });
  test("chưa có lương trước và không có chính sách thì không tách, ghi rõ", () => {
    const bach = s.people.find((p) => p.employee.id === 1)!;
    expect(bach.lumpSplits[0].basis).toBe("không tách được");
    expect(bach.byKind.hoa_hong).toBe(43_425_000);
  });
  test("tổng theo khối; phí kế toán vào khối quản lý; không tính hoàn YCTV; người ngoài danh sách tách riêng", () => {
    expect(s.salaryByGroup.kinh_doanh).toBe(16_000_000 + 2_708_095);
    expect(s.salaryByGroup.quan_ly).toBe(3_000_000);
    expect(s.groups.kinh_doanh.hoa_hong).toBe(121_853_495 + 29_678_454);
    expect(s.people.find((p) => p.employee.id === 10)!.total).toBe(2_708_095 + 29_678_454);
    expect(s.unmatched.map((u) => u.partnerName)).toEqual(["NGUYEN DANG KHIET"]);
  });
});

describe("payrollMonthOf và buildPayrollIndex", () => {
  test("đọc tháng lương trong diễn giải, không có thì lấy tháng trước", async () => {
    const { payrollMonthOf, buildPayrollIndex } = await import("@/lib/employee-pay-core");
    expect(payrollMonthOf("BRE TT LUONG + PHU CAP + THUONG T12 2025", "2026-01-05")).toBe("2025-12");
    expect(payrollMonthOf("BRE TT Thuong + Thu nhap khac T01 2026", "2026-02-05")).toBe("2026-01");
    expect(payrollMonthOf("BRE TT Luong thang 10 2025 + Hoa hong", "2025-11-05")).toBe("2025-10");
    expect(payrollMonthOf("BRE thanh toan hoa hong", "2026-03-06")).toBe("2026-02");
    const idx = buildPayrollIndex([{ month: "2025-12", name: "Trần Minh Nhật", baseSalary: 5_500_000, allowances: 1_000_000 }]);
    expect(idx.get("TRAN MINH NHAT|2025-12")).toBe(6_500_000);
  });
});
