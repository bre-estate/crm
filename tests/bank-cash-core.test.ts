import { describe, test, expect } from "vitest";
import { classifyBankRows, classifyFounderCash, type BankRowLite } from "@/lib/bank-cash-core";
import type { EmployeeLite } from "@/lib/employee-pay-core";

const employees: EmployeeLite[] = [
  { id: 3, name: "Hồ Nguyễn Công Thành", position: "tpkd" },
  { id: 19, name: "Danh Hoàng Thị Tường Vi", position: "admin" },
  { id: 34, name: "Hồ Thị Lan Kim", position: "ctv", note: "Kế toán dịch vụ" },
];
const ctx = { employees, policies: [] };
const row = (o: Partial<BankRowLite> & { description: string }): BankRowLite => ({ date: "2026-03-01", partnerName: null, credit: 0, debit: 0, ...o });
const one = (o: Partial<BankRowLite> & { description: string }) => classifyBankRows([row(o)], ctx);

describe("classifyBankRows: các nhóm rõ", () => {
  test("sửa tay được ưu tiên", () => {
    expect(one({ description: "abc", debit: 1, category: "marketing", categorySource: "manual" })[0]).toMatchObject({ category: "marketing", source: "manual" });
  });
  test("nội bộ, thuế kho bạc, BHXH", () => {
    expect(one({ description: "Open term deposit 149", debit: 300 })[0].category).toBe("chuyen_noi_bo");
    expect(one({ description: "NTDT+KB:0120-KBNN Khu vuc II", debit: 5, partnerName: "KHO BAC NHA NUOC" })[0].category).toBe("thue_kbnn");
    expect(one({ description: "+BHXH+103+00+TZE767L", debit: 5, partnerName: "BAO HIEM XA HOI CO SO BINH THANH" })[0].category).toBe("bhxh");
    expect(one({ description: "BHXH+103 hoan", credit: 5, partnerName: "CTY TNHH SAN GIAO DICH BDS BRE" })[0].category).toBe("chuyen_noi_bo");
  });
  test("giữ chỗ, YCTV, hoàn khách, ký quỹ", () => {
    expect(one({ description: "LUU HONG VAN 0144 YCTV DU AN FENICA", credit: 480 })[0].category).toBe("giu_cho_ho_khach");
    expect(one({ description: "Don vi BRE chuyen tien dang ky du an theo bang ke", debit: 60, partnerName: "CTY CO PHAN DXMD VIET NAM" })[0].category).toBe("giu_cho_ho_khach");
    expect(one({ description: "BRE TT Hoan tien YCTV du an FENICA", debit: 30, partnerName: "DANG AI VY" })[0].category).toBe("hoan_khach");
    expect(one({ description: "Don Vi BRE Chuyen tien ki quy du an AT", debit: 200, partnerName: "CONG TY CO PHAN DXMD VIET NAM" })[0].category).toBe("ky_quy");
    expect(one({ description: "DXMDVietnam chi thuong booking DA Fenica theo HD", credit: 62, partnerName: "CTY CO PHAN DXMD VIET NAM" })[0].category).toBe("dt_hh_so_cap");
    expect(one({ description: "DXMDVietnam hoan tien DA Fenica theo Bang ke", credit: 1170, partnerName: "CTY CO PHAN DXMD VIET NAM" })[0].category).toBe("giu_cho_ho_khach");
  });
  test("CĐT trả phí môi giới là doanh thu; CĐT nhận thưởng booking là hoa hồng chi", () => {
    expect(one({ description: "BAMLAND CK PHI MOI GIOI VA TN DA TT AVIO HD SO 39", credit: 279 })[0].category).toBe("dt_hh_so_cap");
    expect(one({ description: "DXMDVietnam TT PDV dot 1 DA Fenica theo HD so 33", credit: 548, partnerName: "CTY CO PHAN DXMD VIET NAM" })[0].category).toBe("dt_hh_so_cap");
    expect(one({ description: "BRE thanh toan thuong booking du an FENICA theo HD so 5", debit: 46, partnerName: "CONG TY TNHH DICH VU BAT DONG SAN TAN VUONG" })[0].category).toBe("hh_sale");
    expect(one({ description: "Hoan tien DA FENICA theo Bang ke so 01 F", debit: 400, partnerName: "CONG TY TNHH DICH VU BAT DONG SAN TAN VUONG" })[0].category).toBe("hoan_khach");
  });
  test("chi phí theo từ khóa", () => {
    expect(one({ description: "BRE TT HO TRO KHACH MUA BDS CAN B2-07-08", debit: 30, partnerName: "PHAM THI SANG" })[0].category).toBe("ho_tro_khach");
    expect(one({ description: "BRE TT Tien Thue VP T06 2026", debit: 13, partnerName: "PHAM NGOC THANH TAM" })[0].category).toBe("thue_vp");
    expect(one({ description: "ABSH003 . Phi dich vu thang 04.2026", debit: 1, partnerName: "CTY CP DICH VU BCONS" })[0].category).toBe("thue_vp");
    expect(one({ description: "BRE TT tien dong phuc con lai", debit: 2, partnerName: "CONG TY CP GLU" })[0].category).toBe("marketing");
    expect(one({ description: "thanh toan", debit: 5, partnerName: "CT TNHH ALPHA BETA VIET NAM" })[0].category).toBe("marketing");
    expect(one({ description: "chuyen khoan", debit: 5, partnerName: "CONG TY XYZ" })[0].category).toBe("chua_phan_loai");
  });
});

describe("classifyBankRows: nhân viên", () => {
  test("lương và thù lao theo khối, hoa hồng, kế toán dịch vụ, hoàn YCTV, ứng chi phí", () => {
    const legs = classifyBankRows([
      row({ date: "2026-01-05", partnerName: "HO NGUYEN CONG THANH", description: "BRE TT luong thang 12 2025", debit: 8_000_000 }),
      row({ date: "2026-02-05", partnerName: "HO NGUYEN CONG THANH", description: "BRE TT Luong thang 1 2026 + Hoa hong can B.11.06", debit: 50_000_000 }),
      row({ date: "2026-02-05", partnerName: "DANH HOANG THI TUONG VI", description: "BRE TT luong thang 1 2026", debit: 6_000_000 }),
      row({ date: "2026-02-06", partnerName: "HO THI LAN KIM", description: "BRE TT PHI DICH VU T01 2026", debit: 3_000_000 }),
      row({ date: "2026-02-07", partnerName: "HO NGUYEN CONG THANH", description: "BRE TT Hoan tien YCTV du an The Emerald Garden View", debit: 20_000_000 }),
      row({ date: "2026-04-11", partnerName: "DANH HOANG THI TUONG VI", description: "BRE TT Ung Chi Phi Thang 4 2026", debit: 5_000_000 }),
      row({ date: "2026-05-05", partnerName: "HO NGUYEN CONG THANH", description: "Ho Nguyen Cong Thanh 8995 DKTV The Emerald", credit: 60_000_000 }),
    ], ctx);
    expect(legs.map((l) => [l.category, l.amount])).toEqual([
      ["luong_nvkd", 8_000_000],
      ["luong_nvkd", 8_000_000], ["hh_sale", 42_000_000],
      ["luong_admin", 6_000_000],
      ["luong_admin", 3_000_000],
      ["hoan_khach", 20_000_000],
      ["chuyen_noi_bo", 5_000_000],
      ["giu_cho_ho_khach", 60_000_000],
    ]);
  });
});

describe("classifyFounderCash", () => {
  test("map nhóm quản trị, bỏ thứ cấp", () => {
    expect(classifyFounderCash({ date: "2026-01-15", description: "Tiền điện", amount: 1, managementGroup: "2. Thuê VP + tiện ích + dịch vụ", direction: "out" })).toBe("thue_vp");
    expect(classifyFounderCash({ date: "2026-01-15", description: "Grab đi gặp khách", amount: 1, managementGroup: "2. Thuê VP + tiện ích + dịch vụ", direction: "out" })).toBe("di_lai");
    expect(classifyFounderCash({ date: "2026-01-15", description: "HH quản lý sang nhượng Hồ Gia", amount: 1, managementGroup: "1b. HH sale + Marketing + Thưởng doanh số", direction: "out" })).toBeNull();
    expect(classifyFounderCash({ date: "2026-01-15", description: "Thưởng doanh số T12", amount: 1, managementGroup: "1b. HH sale + Marketing + Thưởng doanh số", direction: "out" })).toBe("thuong_ds_sale");
    expect(classifyFounderCash({ date: "2026-01-15", description: "x", amount: 1, managementGroup: "10a. Chi phí khác (không hóa đơn)", direction: "out" })).toBe("opex_khac");
    expect(classifyFounderCash({ date: "2026-01-15", description: "x", amount: 1, managementGroup: "10. Thứ cấp (loại)", direction: "out" })).toBeNull();
  });
});

describe("classifyBankRows: giấy nộp thuế, khách hàng trên căn, bảng lương", () => {
  const ctx2 = {
    employees,
    policies: [],
    taxPayments: [{ paidDate: "2026-04-29", taxType: "gtgt", amount: 147_209_248 }, { paidDate: "2026-04-29", taxType: "tncn", amount: 486_329_740 }],
    customerNames: ["Nguyễn Thị Thơm", "Đào Thị Thái Hòa"],
    payroll: new Map([["HO NGUYEN CONG THANH|2025-12", 7_500_000]]),
  };
  test("KBNN khớp ngày và số tiền với giấy nộp thuế thì ra đúng loại, không khớp để chưa tách", () => {
    const legs = classifyBankRows([
      row({ date: "2026-04-29", description: "NTDT+KB:0120-KBNN Khu vuc II", debit: 147_209_248 }),
      row({ date: "2026-04-29", description: "NTDT+KB:0120-KBNN Khu vuc II", debit: 486_329_740 }),
      row({ date: "2026-04-29", description: "NTDT+KB:0120-KBNN Khu vuc II", debit: 57_801 }),
    ], ctx2);
    expect(legs.map((l) => l.category)).toEqual(["thue_vat", "thue_tncn", "thue_kbnn"]);
  });
  test("tiền vào từ khách hàng trên căn là giữ chỗ, kể cả tên viết liền", () => {
    expect(classifyBankRows([row({ description: "MBVCB.1409 ThomNguyen chuyen khoan nhanh qua Zalo", credit: 100_000_000 })], ctx2)[0].category).toBe("giu_cho_ho_khach");
    expect(classifyBankRows([row({ description: "Dao Thi Thai Hoa - 9743", partnerName: "DAO THI THAI HOA", credit: 30_000_000 })], ctx2)[0].category).toBe("giu_cho_ho_khach");
  });
  test("lệnh gộp tách bằng bảng lương tháng ghi trong diễn giải", () => {
    const legs = classifyBankRows([row({ date: "2026-01-05", partnerName: "HO NGUYEN CONG THANH", description: "BRE TT LUONG + PHU CAP + THUONG T12 2025", debit: 87_375_322 })], ctx2);
    expect(legs.map((l) => [l.category, l.amount])).toEqual([["luong_nvkd", 7_500_000], ["hh_sale", 79_875_322]]);
  });
});
