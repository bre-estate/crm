/**
 * Phân loại sổ chi cá nhân của founder (Drive 0.2.6-Chi phí cá nhân - Vốn góp.xlsx) thành nhóm chi phí.
 * Thuần, không chạm DB, test ở tests/founder-spending.test.ts.
 *
 * Hai câu hỏi tách rời nhau:
 *  - Có tính là tiền công ty đã tiêu không (dùng cho báo cáo lãi lỗ): xem `isCompanySpend`.
 *  - Có tính là vốn góp không (dùng cho bảng tỷ lệ sở hữu): đọc cột "Tính vốn góp" trong file.
 * Tiền nộp vào tài khoản công ty KHÔNG phải chi phí, vì sao kê đã ghi lệnh chi thật sau đó.
 */
import type { CategoryKey } from "./transaction-classifier";

export interface FounderSpendRow {
  month: string;          // YYYY-MM
  date: string | null;    // YYYY-MM-DD nếu đọc được
  person: string;         // Triết | Bách
  title: string;          // Hạng mục
  detail: string;         // Chi tiết
  payee: string;          // Người nhận / NCC
  amount: number;
  capital: string;        // cột "Tính vốn góp": "Có" hoặc "Không (...)"
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toUpperCase();

/** Nộp tiền vào tài khoản công ty: sao kê đã có, không được cộng lại vào chi phí. */
export function isDeposit(r: Pick<FounderSpendRow, "title">): boolean {
  return /TOPUP|NOP TIEN VAO TAI KHOAN|KI QUY|KY QUY/.test(strip(r.title));
}

/**
 * Có phải tiền công ty đã tiêu không.
 * Loại: nộp tiền vào tài khoản (sao kê có rồi), khoản công ty đã trả bằng tài khoản công ty (sao kê có rồi),
 * và khoản chi từ doanh thu thứ cấp Bách giữ (không phải chi phí của công ty).
 */
export function isCompanySpend(r: FounderSpendRow): boolean {
  if (isDeposit(r)) return false;
  if (/công ty đã trả/i.test(r.capital)) return false;
  if (/thứ cấp/i.test(r.capital)) return false;
  return true;
}

/** Từ khóa xếp trước thì thắng. Đọc trên "hạng mục + chi tiết" đã bỏ dấu. */
const RULES: [RegExp, CategoryKey][] = [
  // Lương, thưởng cho người của công ty
  [/^LUONG|TRA LUONG|LUONG CAMERA|THU LAO/, "luong_admin"],
  [/THUONG TET|THUONG TRUNG THU|HO TRO TET|LI XI|LIXI/, "luong_admin"],
  // Mặt bằng, tiện ích, dịch vụ toà nhà
  [/MAT BANG|THUE VAN PHONG|COC THUE|TIEN DIEN|HOA DIEN|PHI QUAN LY|PHI DICH VU|INTERNET|WIFI|NUOC/, "thue_vp"],
  [/VE SINH|QUET DON|BTASKEE|DON DEP|DON VP/, "thue_vp"],
  // Quảng cáo, tuyển dụng, nhận diện thương hiệu
  [/QUANG CAO|\bADS\b|FACEBOOK|GOOGLE ADS|CHO TOT|CHOTOT|DANG TIN|TUYEN DUNG/, "marketing"],
  [/\bLOGO\b|STANDEE|BANNER|POSTER|TO ROI|TO GAP|BI THU|FOLDER|BANG TEN|BANG HIEU|IN AN/, "marketing"],
  // Dịch vụ mua ngoài
  [/TEN MIEN|DOMAIN|\bSSL\b|HOSTING|HOSTINGER|SERVER|WEBSITE|\bWEB\b|WORKSPACE|CAPCUT|EXTENTION|EXTENSION/, "dich_vu_ngoai"],
  [/THANH LAP CONG TY|CON DAU|CHUNG CHI MOI GIOI|CONG CHUNG|LUAT SU/, "dich_vu_ngoai"],
  // Đi lại, giao nhận giấy tờ
  [/GIAO |SHIP|GRAB|\bBE\b|GUI XE|THE XE|THE TU|XANG|TRAM THU PHI|VAN CHUYEN|GUI TO ROI|GUI HS/, "di_lai"],
  // Tiếp khách và đối tác
  [/DOI TAC|TIEP KHACH|HOA CHUC MUNG|HOA KHAI TRUONG TANG/, "tiep_khach"],
  // Nội bộ, lễ nghi, phúc lợi nhân viên
  [/CUNG|THAN TAI|ONG DIA|KHAI TRUONG|MUA LAN|HEO QUAY|NHANG|BIA CUNG|BANH CUNG|VANG/, "opex_khac"],
  [/TAT NIEN|LIEN HOAN|DU LICH|HOMESTAY|BBQ|TIEC|KARAOKE|NHAU|SINH NHAT|BOC THAM|MC TAT NIEN|CUP THUONG/, "opex_khac"],
  [/TRA BANH|NUOC NGOT|GIAY AN|HOA|TRAI CAY|BANH KEM/, "opex_khac"],
  // Đồ dùng, thiết bị văn phòng
  [/THIET BI|SETUP|BAN GHE|BAN THO|\bTU\b|\bKE\b|MAY |O DIEN|O CAM|REM|CAY |THUNG RAC|TUI RAC|BAO RAC|DEP|GIAY|MUC IN|VAN PHONG PHAM|NOI THAT|DIEU HOA|\bCAM\b|PIN|DAN CACH NHIET|IN THE|KHAY|GHIM|CHOI|KEO|VOI XIT|RUA|LAU|CHEN|\bTO\b|DU\b/, "do_dung_vp"],
];

export function classifyFounderSpend(r: Pick<FounderSpendRow, "title" | "detail">): CategoryKey {
  const s = strip(`${r.title} ${r.detail}`);
  for (const [re, cat] of RULES) if (re.test(s)) return cat;
  return "opex_khac";
}
