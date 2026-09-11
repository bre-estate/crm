/**
 * Báo cáo quản trị theo DÒNG TIỀN (cash basis). Hàm thuần.
 *
 * Đầu vào là các "chân tiền" (cash leg): mỗi lần tiền vào hoặc ra khỏi bank / két tiền mặt,
 * kèm tài khoản đối ứng và diễn giải. Nguồn 2025: sổ NKC của kế toán (TK 11211 và 1111).
 * Nguồn các năm chưa có sổ: sao kê + sổ chi tiền mặt (lib/cash-pnl.ts nạp).
 *
 * Nguyên tắc: chỉ tính tiền THẬT SỰ vào/ra. Không trích trước, không phân bổ, không phải thu/phải trả.
 */
import { classifyNkc, type CategoryKey } from "./transaction-classifier";

export interface CashLeg {
  date: string;                 // YYYY-MM-DD
  channel: "bank" | "cash";
  direction: "in" | "out";
  amount: number;               // luôn dương
  counterAccount: string;       // TK đối ứng theo TT200 (131, 3388, 6417, ...) hoặc "" nếu không biết
  description: string;
  category?: CategoryKey;       // đã có sẵn (sao kê đã duyệt) thì dùng, không thì tự phân loại
}

export interface Period { start: string; end: string }

const T = (re: RegExp, s: string) => re.test(s);

/**
 * Phân loại một chân tiền. Ưu tiên tài khoản đối ứng (kế toán đã mã hóa), sau đó mới tới diễn giải.
 */
export function classifyCashLeg(leg: CashLeg): CategoryKey {
  if (leg.category) return leg.category;
  const acc = leg.counterAccount;
  const d = leg.description ?? "";
  const first = acc.charAt(0);

  // Chuyển giữa két tiền mặt và bank
  if (acc === "1111" || acc === "11211" || acc === "111" || acc === "112") return "chuyen_noi_bo";

  if (leg.direction === "in") {
    if (acc === "131") return "dt_hh_so_cap";
    if (acc === "3388" || acc === "1388" || acc === "138") return T(/hoan|hoàn/i, d) ? "giu_cho_ho_khach" : "giu_cho_ho_khach";
    if (acc === "411" || acc === "41111") return "von_gop";
    if (acc === "3411" || acc === "341") return "vay_nhan";
    if (acc === "515" || first === "7") return "khac_thu";
    if (acc === "244") return "ky_quy";
    if (first === "6" || first === "8") return classifyNkc({ debitAccount: acc, creditAccount: "11211", description: d, amount: leg.amount }).category; // hoàn chi phí
    return T(/yctv|dktv|giu cho|giữ chỗ|booking|dat coc|đặt cọc/i, d) ? "giu_cho_ho_khach" : "khac_thu";
  }

  // direction out
  if (acc === "3388" || acc === "1388" || acc === "138" || acc === "141") {
    return T(/hoan tien|hoàn tiền|hoan\s+coc|hoàn cọc|refund/i, d) ? "hoan_khach" : "giu_cho_ho_khach";
  }
  if (acc === "244") return "ky_quy";
  if (acc === "411" || acc === "41111") return "rut_von";
  if (acc === "3411" || acc === "341") return "tra_no_goc";
  if (acc === "33311" || acc === "3331") return "thue_vat";
  if (acc === "3334") return "thue_tndn";
  if (acc === "3335") return "thue_tncn";
  if (acc === "3383" || acc === "3384" || acc === "3386" || acc === "338") return "luong_nvkd"; // BHXH, gom vào dòng lương
  if (acc === "335") return T(/ho tro khach|hỗ trợ khách/i, d) ? "ho_tro_khach" : "hh_sale";
  if (acc === "3341" || acc === "334") {
    if (T(/hoa hong|hoa hồng/i, d)) return "hh_sale";
    if (T(/thuong doanh so|thưởng doanh số/i, d)) return "thuong_ds_sale";
    return "luong_nvkd"; // lương, thù lao CTV, tạm ứng lương: gom một dòng lương
  }
  if (acc === "331" || acc === "3311") return classifySupplierPayment(d);
  if (acc === "1331" || acc === "133") return "opex_khac"; // VAT phí ngân hàng, lẻ
  if (first === "6" || first === "8") {
    return classifyNkc({ debitAccount: acc, creditAccount: "11211", description: d, amount: leg.amount }).category;
  }
  return "chua_phan_loai";
}

/** Trả nhà cung cấp (TK 331): kế toán không nói mua gì, phải đọc diễn giải. */
function classifySupplierPayment(d: string): CategoryKey {
  if (T(/thue nha|thuê nhà|thue van phong|thuê văn phòng|thue vp|thuê vp|tien thue|tiền thuê|thu van phong|dat coc thue|đặt cọc thuê|KBNN|NTDT/i, d)) return "thue_vp";
  if (T(/vien thong|viễn thông|internet|wifi|cuoc dich vu|cước dịch vụ|tien dien|tiền điện|tien nuoc|tiền nước/i, d)) return "thue_vp";
  if (T(/quang cao|quảng cáo|BDS\d|BDSVN|PROPERTYGURU|nap tien cho BDS|to roi|tờ rơi|gimbal|DJI|su kien|sự kiện|tiec|tiệc/i, d)) return "marketing";
  if (T(/thu lao|thù lao|phu cap|phụ cấp|ho tro T\d|hỗ trợ T\d|luong|lương/i, d)) return "luong_nvkd";
  if (T(/phi dich vu thang|phí dịch vụ tháng|dich vu ke toan|dịch vụ kế toán/i, d)) return "luong_admin"; // kế toán dịch vụ, kế toán gộp vào 4.3
  if (T(/tiep khach|tiếp khách|VTMH/i, d)) return "tiep_khach";
  if (T(/cong tac|công tác|van chuyen|vận chuyển|taxi|grab|may bay|máy bay/i, d)) return "di_lai";
  if (T(/may tinh|máy tính|hoc tu|hộc tủ|do dung|đồ dùng|huy hieu|huy hiệu|thiet bi|thiết bị|ban ghe|bàn ghế|may in|máy in/i, d)) return "do_dung_vp";
  if (T(/thu vien phap luat|thư viện pháp luật|chu ky so|chữ ký số|luat su|luật sư|cong chung|công chứng|tu van|tư vấn/i, d)) return "dich_vu_ngoai";
  return "dich_vu_ngoai";
}

// ───────────────────────── Gom thành báo cáo ─────────────────────────

export type CashLineKey =
  | "thu_hh" | "thu_khac"
  | "chi_hh_sale" | "chi_ho_tro_khach" | "chi_thuong_ql"
  | "chi_luong" | "chi_thuong_ds" | "chi_marketing" | "chi_thue_vp" | "chi_do_dung" | "chi_di_lai" | "chi_tiep_khach" | "chi_dich_vu" | "chi_thue_phi" | "chi_khac"
  | "thue_vat" | "thue_tndn" | "thue_tncn"
  | "von_gop" | "rut_von" | "vay" | "ky_quy" | "giu_cho" | "hoan_khach" | "chuyen_noi_bo" | "chua_phan_loai";

/** category → dòng báo cáo dòng tiền. Tiền vào ở dòng chi phí là hoàn lại chi phí (trừ). */
export const CATEGORY_TO_CASH_LINE: Record<CategoryKey, CashLineKey> = {
  dt_hh_so_cap: "thu_hh", dt_thu_cap: "thu_hh", khac_thu: "thu_khac", von_gop: "von_gop", vay_nhan: "vay",
  hh_sale: "chi_hh_sale", cdt_thuong_nvkd: "chi_hh_sale",
  ho_tro_khach: "chi_ho_tro_khach",
  cdt_thuong_ql: "chi_thuong_ql", cty_thuong_ql: "chi_thuong_ql", cty_thuong_tpkd: "chi_thuong_ql", cty_thuong_admin: "chi_thuong_ql", cty_thuong_ceo: "chi_thuong_ql",
  luong_nvkd: "chi_luong", luong_admin: "chi_luong", thuong_ds_sale: "chi_thuong_ds", marketing: "chi_marketing",
  thue_vp: "chi_thue_vp", do_dung_vp: "chi_do_dung", di_lai: "chi_di_lai", tiep_khach: "chi_tiep_khach", dich_vu_ngoai: "chi_dich_vu",
  thue_phi_le_phi: "chi_thue_phi", opex_khac: "chi_khac",
  thue_tncn: "thue_tncn", thue_tndn: "thue_tndn", thue_vat: "thue_vat",
  tra_no_goc: "vay", chuyen_noi_bo: "chuyen_noi_bo", rut_von: "rut_von", hoan_khach: "hoan_khach",
  ky_quy: "ky_quy", giu_cho_ho_khach: "giu_cho",
  chua_phan_loai: "chua_phan_loai",
};

export interface CashLine {
  code: string;
  key?: CashLineKey;
  label: string;
  value: number;          // dấu theo bản chất: thu dương, chi dương (đã là số chi), tổng theo công thức
  kind: "section" | "item" | "sub";
  note?: string;
}

export interface CashPnl {
  period: Period;
  available: boolean;
  byLine: Record<CashLineKey, number>;   // thu: +, chi: + (số tiền chi), non-op: net (vào − ra)
  lines: CashLine[];
  memo: CashLine[];
  totals: {
    thu: number; chiGiaVon: number; chenhGop: number; chiCoDinh: number; hoatDongTruocThue: number;
    thue: number; hoatDongRong: number; ngoaiHoatDong: number; thayDoiTien: number;
    bankIn: number; bankOut: number; cashIn: number; cashOut: number;
  };
  unclassified: CashLeg[];
}

const NON_OP: CashLineKey[] = ["von_gop", "rut_von", "vay", "ky_quy", "giu_cho", "hoan_khach", "chuyen_noi_bo", "chua_phan_loai"];
const THU: CashLineKey[] = ["thu_hh", "thu_khac"];
const GIA_VON: CashLineKey[] = ["chi_hh_sale", "chi_ho_tro_khach", "chi_thuong_ql"];
const CO_DINH: CashLineKey[] = ["chi_luong", "chi_thuong_ds", "chi_marketing", "chi_thue_vp", "chi_do_dung", "chi_di_lai", "chi_tiep_khach", "chi_dich_vu", "chi_thue_phi", "chi_khac"];
const THUE: CashLineKey[] = ["thue_vat", "thue_tndn", "thue_tncn"];

const LABEL: Record<CashLineKey, string> = {
  thu_hh: "Tiền thu phí môi giới và thưởng từ CĐT, đối tác",
  thu_khac: "Thu khác (lãi tiền gửi, hoàn phí)",
  chi_hh_sale: "Hoa hồng và thưởng nóng đã chi cho sale",
  chi_ho_tro_khach: "Hỗ trợ khách mua BĐS đã chi",
  chi_thuong_ql: "Thưởng quản lý sàn, TPKD, Admin, CEO đã chi",
  chi_luong: "Lương, thù lao CTV, BHXH đã trả",
  chi_thuong_ds: "Thưởng doanh số đã chi",
  chi_marketing: "Quảng cáo, sự kiện",
  chi_thue_vp: "Thuê văn phòng, điện nước, internet",
  chi_do_dung: "Đồ dùng, thiết bị văn phòng",
  chi_di_lai: "Đi lại, vận chuyển, công tác",
  chi_tiep_khach: "Tiếp khách",
  chi_dich_vu: "Dịch vụ mua ngoài (chữ ký số, pháp lý, khác)",
  chi_thue_phi: "Thuế phí lệ phí (môn bài)",
  chi_khac: "Chi khác, không hóa đơn",
  thue_vat: "Thuế GTGT đã nộp",
  thue_tndn: "Thuế TNDN đã nộp",
  thue_tncn: "Thuế TNCN đã nộp (khấu trừ hộ nhân viên)",
  von_gop: "Vốn góp nhận từ founder",
  rut_von: "Hoàn, rút vốn founder",
  vay: "Vay nhận trừ trả nợ gốc",
  ky_quy: "Ký quỹ, đặt cọc dự án, cọc thuê VP (ròng)",
  giu_cho: "Giữ chỗ, YCTV, nộp thay khách (thu hộ trừ chi hộ)",
  hoan_khach: "Hoàn tiền khách",
  chuyen_noi_bo: "Chuyển giữa két tiền mặt và bank (ròng)",
  chua_phan_loai: "Chưa phân loại",
};

export function buildCashPnl(legs: CashLeg[], period: Period, available = true): CashPnl {
  const byLine = Object.fromEntries(Object.keys(LABEL).map((k) => [k, 0])) as Record<CashLineKey, number>;
  const unclassified: CashLeg[] = [];
  let bankIn = 0, bankOut = 0, cashIn = 0, cashOut = 0;

  for (const leg of legs) {
    if (leg.date < period.start || leg.date > period.end) continue;
    if (leg.channel === "bank") { if (leg.direction === "in") bankIn += leg.amount; else bankOut += leg.amount; }
    else { if (leg.direction === "in") cashIn += leg.amount; else cashOut += leg.amount; }

    const cat = classifyCashLeg(leg);
    const line = CATEGORY_TO_CASH_LINE[cat];
    if (line === "chua_phan_loai") unclassified.push(leg);
    const signedIn = leg.direction === "in" ? leg.amount : -leg.amount;
    if (THU.includes(line) || NON_OP.includes(line)) byLine[line] += signedIn;           // thu và ngoài hoạt động: vào − ra
    else byLine[line] += -signedIn;                                                        // chi: ra − vào (hoàn chi phí làm giảm)
  }
  for (const k of Object.keys(byLine) as CashLineKey[]) byLine[k] = Math.round(byLine[k]);

  const sum = (keys: CashLineKey[]) => keys.reduce((s, k) => s + byLine[k], 0);
  const thu = sum(THU);
  const chiGiaVon = sum(GIA_VON);
  const chenhGop = thu - chiGiaVon;
  const chiCoDinh = sum(CO_DINH);
  const hoatDongTruocThue = chenhGop - chiCoDinh;
  const thue = sum(THUE);
  const hoatDongRong = hoatDongTruocThue - thue;
  const ngoaiHoatDong = sum(NON_OP);
  const thayDoiTien = hoatDongRong + ngoaiHoatDong;

  const item = (code: string, key: CashLineKey): CashLine => ({ code, key, label: LABEL[key], value: byLine[key], kind: "item" });
  const lines: CashLine[] = [
    { code: "1", label: "TIỀN THU TỪ HOẠT ĐỘNG", value: thu, kind: "section" },
    item("1.1", "thu_hh"), item("1.2", "thu_khac"),
    { code: "2", label: "TIỀN CHI GIÁ VỐN", value: chiGiaVon, kind: "section" },
    item("2.1", "chi_hh_sale"), item("2.2", "chi_ho_tro_khach"), item("2.3", "chi_thuong_ql"),
    { code: "3", label: "CHÊNH LỆCH GỘP BẰNG TIỀN", value: chenhGop, kind: "section" },
    { code: "4", label: "TIỀN CHI CỐ ĐỊNH", value: chiCoDinh, kind: "section" },
    ...CO_DINH.map((k, i) => item(`4.${i + 1}`, k)),
    { code: "5", label: "DÒNG TIỀN HOẠT ĐỘNG TRƯỚC THUẾ", value: hoatDongTruocThue, kind: "section" },
    { code: "6", label: "THUẾ ĐÃ NỘP", value: thue, kind: "section" },
    ...THUE.map((k, i) => item(`6.${i + 1}`, k)),
    { code: "7", label: "DÒNG TIỀN HOẠT ĐỘNG RÒNG", value: hoatDongRong, kind: "section" },
  ];
  const memo: CashLine[] = [
    { code: "8", label: "NGOÀI HOẠT ĐỘNG (vào trừ ra)", value: ngoaiHoatDong, kind: "section" },
    ...NON_OP.map((k, i) => item(`8.${i + 1}`, k)),
    { code: "9", label: "THAY ĐỔI TIỀN TRONG KỲ (7 + 8)", value: thayDoiTien, kind: "section" },
  ];

  return {
    period, available, byLine, lines, memo, unclassified,
    totals: { thu, chiGiaVon, chenhGop, chiCoDinh, hoatDongTruocThue, thue, hoatDongRong, ngoaiHoatDong, thayDoiTien, bankIn, bankOut, cashIn, cashOut },
  };
}
