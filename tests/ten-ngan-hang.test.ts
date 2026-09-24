import { describe, test, expect } from "vitest";
import { tenNganHangGon } from "@/lib/ten-ngan-hang";

/** Chuỗi thật lấy từ cột partner_bank của 924 dòng sao kê. */
describe("tenNganHangGon", () => {
  const that: [string, string][] = [
    ["A CHAU (ACB)", "ACB"],
    ["Ngan hang a chau       IBT SMARLINK   VNM", "ACB"],
    ["NH TMCP A Chau CN Sai Gon", "ACB"],
    ["NH TMCP a Chau CN Ha Noi", "ACB"],
    ["CONG THUONG VN (VIETINBANK)", "VIETINBANK"],
    ["VietinBank                            VNM", "VIETINBANK"],
    ["DAU TU VA PHAT TRIEN VN ( BIDV)", "BIDV"],
    ["IBT BIDV                 HANOI        VNM", "BIDV"],
    ["NH TMCP ĐT&amp;PT CN Truong Son", "BIDV"],
    ["VIETCOMBANK            Hanoi          VNM", "VIETCOMBANK"],
    ["NHTMCP Ngoai Thuong Viet Nam", "VIETCOMBANK"],
    ["HANG HAI (MARITIMEBANK-MSB)", "MSB"],
    ["Maritime Bank          IBanking       VNM", "MSB"],
    ["NONG NGHIEP VA PTNT VN (AGRIBANK)", "AGRIBANK"],
    ["IBT-MB                 HANOI          VNM", "MB"],
    ["IBT VPB EBANKING         HANOI        VNM", "VPBANK"],
    ["VIET NAM THINH VUONG (VPBANK)", "VPBANK"],
    ["IBT TIENPHONGBANK      HANOI          VNM", "TPBANK"],
    ["TIEN PHONG (TPBANK)", "TPBANK"],
    ["PHUONG DONG (OCB)", "OCB"],
    ["OCB EBANKING           TP HCM         VNM", "OCB"],
    ["SAI GON - HA NOI (SHB)", "SHB"],
    ["PHAT TRIEN TP HCM (HDBANK)", "HDBANK"],
    ["HDBank                 Ebanking       VNM", "HDBANK"],
    ["SAI GON THUONG TIN (SACOMBANK)", "SACOMBANK"],
    ["SAI GON TAI LOC (SACOMBANK)", "SACOMBANK"],
    ["NH TMCP Quoc te Viet Nam Hoi so chi nh", "VIB"],
    ["IBT EIB                  HCMC         VNM", "EXIMBANK"],
    ["PVCB NAPAS               HANOI        VNM", "PVCOMBANK"],
    ["DAI CHUNG VN (PVCOMBANK)", "PVCOMBANK"],
    ["SHINHAN VIET NAM", "SHINHAN"],
    ["WOORI BANK VIETNAM     750            704", "WOORI"],
    ["NGAN HANG TMCP ABBANK                 VNM", "ABBANK"],
    ["NH BAN VIET            412 NTMK       VNM", "BVBANK"],
    ["VIKKIBANK       Ebanking              704", "VIKKIBANK"],
  ];
  for (const [raw, mong] of that) {
    test(`${raw.trim().slice(0, 34)} → ${mong}`, () => expect(tenNganHangGon(raw)).toBe(mong));
  }

  test("ô trống trả null", () => {
    expect(tenNganHangGon("")).toBeNull();
    expect(tenNganHangGon(null)).toBeNull();
  });

  // Không nhận ra thì dọn đuôi rác rồi giữ lại, đừng nuốt mất thông tin.
  test("ngân hàng lạ thì giữ tên, chỉ bỏ đuôi chi nhánh và mã nước", () => {
    expect(tenNganHangGon("NGAN HANG XYZ          HANOI          VNM")).toBe("XYZ");
  });
});
