/**
 * Generate SO QUAN TRI 2025.xlsx — trusted source cho view quản trị.
 * Merge 3 sources: sao kê Techcombank + chi cá nhân Bách + chi cá nhân Triết.
 * Auto-tag: Loại / Nhóm / Dự án / Kênh / Nguồn tiền dựa vào description + partner.
 *
 * Rules (chuẩn):
 * - 1 khoản = 1 dòng, không xóa row
 * - Dropdown validation cho các cột lookup
 * - Sheet "Data": rows chi tiết
 * - Sheet "Lookup": danh mục dropdown
 * - Sheet "Tổng hợp": pivot theo Nhóm × Tháng
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import ExcelJS from "exceljs";

const sql = postgres(process.env.DATABASE_URL!);

// ═══════════════════════════════════════════════════════════════
// DANH MỤC CHUẨN (chuẩn dropdown validation)
// ═══════════════════════════════════════════════════════════════
const CHIEU = ["Chi", "Thu"];
const LOAI = ["OPEX", "CAPEX", "Doanh thu", "Passthrough", "Chi hộ khách", "Chi hộ nội bộ", "Vốn góp"];
const NHOM = [
  "Sale team NVKD",
  "Lương admin",
  "Lương HR/CTV nội bộ",
  "Thuê VP",
  "Tiện ích VP (điện/nước/internet)",
  "Phí quản lý mặt bằng",
  "Marketing",
  "Sự kiện / Team building",
  "Thiết bị (máy tính/gimbal)",
  "Vận chuyển / Ship",
  "Ăn uống / Cúng thần tài",
  "Đồ dùng VP",
  "Dịch vụ ngoài (kế toán/pháp luật)",
  "Thuế (GTGT/TNDN/Môn bài)",
  "BHXH cty đóng",
  "TNCN nộp thay NLĐ",
  "Chi hộ booking KH",
  "Hoàn booking/YCTV",
  "Hỗ trợ/CK khách",
  "Owner rút vốn/hoàn",
  "Khác",
];
const DU_AN = [
  "AVIO (TT AVIO)",
  "Sky Garden (PDSG)",
  "Sky One (PDSO)",
  "Fenica",
  "ATSR (AT Saigon Riverside)",
  "Bcons Sapphire",
  "Bcons Green Emerald (BGE)",
  "Bcons City (Green Emerald)",
  "Fiato",
  "Mallet (Mallet Land)",
  "Chung — VP",
  "Chung — Toàn cty",
];
const KENH = ["BDS.com.vn", "PropertyGuru", "Facebook", "Google Ads", "Sự kiện", "PR", "Referral", "Direct", "—"];
const NGUON_TIEN = ["Bank cty (Techcombank)", "Bách chi hộ", "Triết chi hộ", "Cash", "Thẻ tín dụng"];
const NGUOI_DUYET = ["Triết (CEO)", "Bách (TPKD)", "Kim (Kế toán ngoài)", "Tường Vi (Admin)"];
const HOA_DON = ["Có", "Không"];

// ═══════════════════════════════════════════════════════════════
// AUTO-TAG LOGIC
// ═══════════════════════════════════════════════════════════════

type Row = {
  date: string;
  chieu: string;
  amount: number;
  description: string;
  recipient: string;
  loai: string;
  nhom: string;
  duAn: string;
  kenh: string;
  nguonTien: string;
  nguoiDuyet: string;
  hoaDon: string;
  ghiChu: string;
};

function normStr(s: string | null | undefined): string {
  return (s ?? "").toUpperCase();
}

// Tag Dự án dựa vào description keywords
function tagDuAn(desc: string): string {
  const d = normStr(desc);
  if (/AVIO/.test(d)) return "AVIO (TT AVIO)";
  if (/PDSG|SKY GARDEN/.test(d)) return "Sky Garden (PDSG)";
  if (/PDSO|SKY ONE/.test(d)) return "Sky One (PDSO)";
  if (/FENICA/.test(d)) return "Fenica";
  if (/ATSR|SAIGON RIVERSIDE|SG RIVERSIDE/.test(d)) return "ATSR (AT Saigon Riverside)";
  if (/BCONS SAPPHIRE|SAPPHIRE/.test(d)) return "Bcons Sapphire";
  if (/BGE|GREEN EMERALD|GREEN EMERALD/.test(d)) return "Bcons Green Emerald (BGE)";
  if (/BCONS CITY/.test(d)) return "Bcons City (Green Emerald)";
  if (/FIATO/.test(d)) return "Fiato";
  if (/MALLET/.test(d)) return "Mallet (Mallet Land)";
  if (/THUE.*VP|VAN PHONG|THUE VAN|DIEN|INTERNET|PHI QUAN LY|WIFI/.test(d)) return "Chung — VP";
  return "Chung — Toàn cty";
}

// Tag Kênh (chỉ dùng cho Marketing)
function tagKenh(desc: string): string {
  const d = normStr(desc);
  if (/BATDONGSAN|BDS\.COM/.test(d)) return "BDS.com.vn";
  if (/PROPERTYGURU/.test(d)) return "PropertyGuru";
  if (/FACEBOOK|FB\s|META/.test(d)) return "Facebook";
  if (/GOOGLE|GG ADS/.test(d)) return "Google Ads";
  if (/SU KIEN|EVENT|TEAM BUILDING|TIEC/.test(d)) return "Sự kiện";
  if (/PR |PR\.|BAO CHI|BÁO CHÍ/.test(d)) return "PR";
  if (/REFERRAL|GIOI THIEU|GIỚI THIỆU/.test(d)) return "Referral";
  return "—";
}

// Tag Loại (Nature)
function tagLoai(desc: string, partner: string, amount: number, isCredit: boolean): string {
  const d = normStr(desc);
  const p = normStr(partner);
  if (isCredit) return "Doanh thu";
  if (/GIU CHO.*KHACH|NOP THAY|CHUYEN TIEN GIU/i.test(d)) return "Chi hộ khách";
  if (/HOAN\s+(BOOKING|COC|TIEN)|HOAN.*YCTV|REFUND/i.test(d)) return "Passthrough";
  if (/MAY TINH|GIMBAL|MAY QUAY|DJI|MÁY IN|PRINTER|COMPUTER|CAMERA|MAY ANH/i.test(d) && amount >= 5_000_000) return "CAPEX";
  if (/BO MAY TINH|MAY IN LASER|WIFI|MAY LOC NUOC/i.test(d) && amount >= 3_000_000) return "CAPEX";
  if (/RUT VON|HOAN VON|NAP TIEN/i.test(d) && /TRIET|NGUYEN MINH/i.test(p)) return "Vốn góp";
  return "OPEX";
}

// Tag Nhóm (Category)
function tagNhom(desc: string, partner: string, loai: string): string {
  const d = normStr(desc);
  const p = normStr(partner);

  if (loai === "Chi hộ khách") return "Chi hộ booking KH";
  if (loai === "Passthrough") return "Hoàn booking/YCTV";
  if (loai === "CAPEX") return "Thiết bị (máy tính/gimbal)";
  if (loai === "Vốn góp") return "Owner rút vốn/hoàn";
  if (loai === "Doanh thu") return "—";

  // OPEX classification
  if (/HOAN\s+(BOOKING|COC|TIEN)|HOÀN\s+(BOOKING|CỌC|TIỀN)|HOAN.*YCTV|REFUND/i.test(d)) return "Hoàn booking/YCTV";
  if (/HO TRO|HỖ TRỢ|CHIET KHAU|QUY DOI.*VANG/i.test(d)) return "Hỗ trợ/CK khách";
  if (/THUE.*VP|THUÊ.*VP|THUE VAN PHONG|TIEN THUE NHA|TIEN THUE T\d|THUE T\d/i.test(d)) return "Thuê VP";
  if (/NGUYEN DANG KHIET|PHAM NGOC THANH TAM/.test(p)) return "Thuê VP";
  if (/TIEN DIEN|TIỀN ĐIỆN|TIEN NUOC|ĐIỆN NƯỚC|INTERNET|WIFI/i.test(d)) return "Tiện ích VP (điện/nước/internet)";
  if (/PHI QUAN LY|PHÍ QUẢN LÝ MẶT BẰNG|PHI QL/i.test(d)) return "Phí quản lý mặt bằng";
  if (/QUANG CAO|MARKETING|BATDONGSAN|PROPERTYGURU|GOOGLE ADS|FB ADS/i.test(d)) return "Marketing";
  if (/SU KIEN|TIEC|TEAM BUILDING|TET DUONG LICH|TRUNG THU/i.test(d)) return "Sự kiện / Team building";
  if (/JETCAR|VAN CHUYEN|SHIP|GRAB.*HOP DONG|BOOK GRAB/i.test(d)) return "Vận chuyển / Ship";
  if (/CUNG THAN TAI|THAN TAI|MAM CUNG|HOA.*TRAI CAY|TRAI CAY|BANH CUNG|HEO QUAY/i.test(d)) return "Ăn uống / Cúng thần tài";
  if (/BO TU|GIAY|VAN PHONG PHAM|BUT|SO|MAY TINH BAM/i.test(d)) return "Đồ dùng VP";
  if (/DICH VU KE TOAN|PHI DICH VU|PHAP LUAT|LEGAL|THU VIEN PHAP LUAT/i.test(d)) return "Dịch vụ ngoài (kế toán/pháp luật)";
  if (/HO THI LAN KIM/.test(p)) return "Dịch vụ ngoài (kế toán/pháp luật)";
  if (/THUE.*GTGT|THUE.*TNDN|THUE MON BAI|NTDT|THUE\.KB|KBNN/i.test(d)) return "Thuế (GTGT/TNDN/Môn bài)";
  if (/KHO BAC|KBNN/.test(p)) return "Thuế (GTGT/TNDN/Môn bài)";
  if (/BHXH|BAO HIEM/i.test(d)) return "BHXH cty đóng";
  if (/BAO HIEM XA HOI/.test(p)) return "BHXH cty đóng";
  if (/TNCN.*NOP THAY/i.test(d)) return "TNCN nộp thay NLĐ";
  // Sale team NVKD
  const nvkdList = ["DOAN LE BACH", "HO NGUYEN CONG THANH", "TRAN MINH NHAT", "TRAN THI KHANH LINH", "LE THI CAM GIANG", "LE TRINH THANH THUY", "VU DUC THINH", "DOAN NGOC HA SANG", "HUYNH DUY ANH", "NGUYEN THI HONG NHUNG", "BUI THI HA UYEN", "NGUYEN QUY TAI", "VO THI THU THAO", "TONG THI NHUNG", "TONG THI HONG THAM", "VU THI NGOC DUYEN", "PHAM VAN QUYET", "BUI XUAN DAT"];
  if (nvkdList.some(n => p.includes(n))) return "Sale team NVKD";
  if (/LUONG|LƯƠNG|PHU CAP|THUONG DOANH SO|THU LAO|THÙ LAO|HOA HONG/i.test(d)) return "Sale team NVKD";
  // Admin/HR
  if (/DANH HOANG THI TUONG VI|LUONG THI NGA/.test(p)) return "Lương HR/CTV nội bộ";
  if (/PHAM QUANG TUNG/.test(p)) return "Lương admin";
  return "Khác";
}

// Nguồn tiền dựa vào source
function tagNguonTien(source: string): string {
  if (source === "bank") return "Bank cty (Techcombank)";
  if (source === "merged-Bách") return "Bách chi hộ";
  if (source === "merged-Triết") return "Triết chi hộ";
  return "Cash";
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log("═══ Query 3 sources 2025 ═══");

  // 1) Sao kê Techcombank cty
  const bank = await sql`
    SELECT transaction_date::text as d, description, partner_name,
      COALESCE(debit_amount, 0)::float8 as debit,
      COALESCE(credit_amount, 0)::float8 as credit
    FROM bank_transactions
    WHERE substr(transaction_date::text, 1, 4) = '2025'
    ORDER BY transaction_date`;
  console.log(`  Sao kê Techcombank: ${bank.length} giao dịch`);

  // 2) Chi cá nhân Bách (financial_transactions source=merged-Bách)
  const bach = await sql`
    SELECT transaction_date::text as d, description, recipient, amount::float8 as amt
    FROM financial_transactions
    WHERE source_file = 'merged-Bách'
      AND substr(transaction_date::text, 1, 4) = '2025'
      AND direction = 'out'
    ORDER BY transaction_date`;
  console.log(`  Chi CN Bách: ${bach.length} khoản`);

  // 3) Chi cá nhân Triết
  const triet = await sql`
    SELECT transaction_date::text as d, description, recipient, amount::float8 as amt
    FROM financial_transactions
    WHERE source_file = 'merged-Triết'
      AND substr(transaction_date::text, 1, 4) = '2025'
      AND direction = 'out'
    ORDER BY transaction_date`;
  console.log(`  Chi CN Triết: ${triet.length} khoản`);

  // ═══ Merge + auto-tag ═══
  const rows: Row[] = [];

  for (const b of bank) {
    const isCredit = Number(b.credit) > 0;
    const amount = isCredit ? Number(b.credit) : Math.abs(Number(b.debit));
    if (amount === 0) continue;
    const desc = String(b.description ?? "");
    const partner = String(b.partner_name ?? "");
    const loai = tagLoai(desc, partner, amount, isCredit);
    const nhom = tagNhom(desc, partner, loai);
    rows.push({
      date: b.d,
      chieu: isCredit ? "Thu" : "Chi",
      amount,
      description: desc,
      recipient: partner,
      loai,
      nhom,
      duAn: tagDuAn(desc),
      kenh: nhom === "Marketing" ? tagKenh(desc) : "—",
      nguonTien: tagNguonTien("bank"),
      nguoiDuyet: "Kim (Kế toán ngoài)", // Default cho sao kê (Kim check TT)
      hoaDon: "",
      ghiChu: "",
    });
  }

  for (const item of bach) {
    const desc = String(item.description ?? "");
    const rec = String(item.recipient ?? "");
    const amount = Number(item.amt);
    const loai = tagLoai(desc, rec, amount, false);
    const nhom = tagNhom(desc, rec, loai);
    rows.push({
      date: item.d,
      chieu: "Chi",
      amount,
      description: desc,
      recipient: rec,
      loai,
      nhom,
      duAn: tagDuAn(desc),
      kenh: nhom === "Marketing" ? tagKenh(desc) : "—",
      nguonTien: "Bách chi hộ",
      nguoiDuyet: "Bách (TPKD)",
      hoaDon: "",
      ghiChu: "",
    });
  }

  for (const item of triet) {
    const desc = String(item.description ?? "");
    const rec = String(item.recipient ?? "");
    const amount = Number(item.amt);
    const loai = tagLoai(desc, rec, amount, false);
    const nhom = tagNhom(desc, rec, loai);
    rows.push({
      date: item.d,
      chieu: "Chi",
      amount,
      description: desc,
      recipient: rec,
      loai,
      nhom,
      duAn: tagDuAn(desc),
      kenh: nhom === "Marketing" ? tagKenh(desc) : "—",
      nguonTien: "Triết chi hộ",
      nguoiDuyet: "Triết (CEO)",
      hoaDon: "",
      ghiChu: "",
    });
  }

  // Sort theo ngày
  rows.sort((a, b) => a.date.localeCompare(b.date));

  console.log(`\n═══ Tổng ${rows.length} rows đã tag ═══`);

  // ═══════════════════════════════════════════════════════════════
  // Build Excel
  // ═══════════════════════════════════════════════════════════════
  const wb = new ExcelJS.Workbook();
  wb.creator = "BRE CRM";
  wb.created = new Date("2026-08-05T00:00:00Z");

  // ─── SHEET 1: Data ───
  const dataSheet = wb.addWorksheet("Data", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  dataSheet.columns = [
    { header: "Ngày", key: "date", width: 12 },
    { header: "Chiều", key: "chieu", width: 8 },
    { header: "Số tiền (VND)", key: "amount", width: 15 },
    { header: "Nội dung", key: "description", width: 55 },
    { header: "Người nhận / trả", key: "recipient", width: 30 },
    { header: "Loại", key: "loai", width: 15 },
    { header: "Nhóm", key: "nhom", width: 30 },
    { header: "Dự án", key: "duAn", width: 22 },
    { header: "Kênh (chỉ Marketing)", key: "kenh", width: 15 },
    { header: "Nguồn tiền", key: "nguonTien", width: 22 },
    { header: "Người duyệt", key: "nguoiDuyet", width: 18 },
    { header: "Có hóa đơn?", key: "hoaDon", width: 12 },
    { header: "Ghi chú", key: "ghiChu", width: 30 },
  ];
  // Header style
  dataSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  dataSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  dataSheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  dataSheet.getRow(1).height = 30;

  // Add rows
  for (const r of rows) {
    dataSheet.addRow(r);
  }

  // Format amount as VND
  dataSheet.getColumn("amount").numFmt = "#,##0";
  dataSheet.getColumn("amount").alignment = { horizontal: "right" };

  // Alternating row color
  for (let i = 2; i <= rows.length + 1; i++) {
    if (i % 2 === 0) {
      dataSheet.getRow(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
    }
  }

  // ─── SHEET 2: Lookup (danh mục dropdown) ───
  const lookupSheet = wb.addWorksheet("Lookup");
  lookupSheet.columns = [
    { header: "Chiều", key: "chieu", width: 20 },
    { header: "Loại", key: "loai", width: 20 },
    { header: "Nhóm", key: "nhom", width: 35 },
    { header: "Dự án", key: "duAn", width: 30 },
    { header: "Kênh", key: "kenh", width: 20 },
    { header: "Nguồn tiền", key: "nguonTien", width: 25 },
    { header: "Người duyệt", key: "nguoiDuyet", width: 22 },
    { header: "Có hóa đơn", key: "hoaDon", width: 15 },
  ];
  lookupSheet.getRow(1).font = { bold: true };
  const maxLookup = Math.max(CHIEU.length, LOAI.length, NHOM.length, DU_AN.length, KENH.length, NGUON_TIEN.length, NGUOI_DUYET.length);
  for (let i = 0; i < maxLookup; i++) {
    lookupSheet.addRow({
      chieu: CHIEU[i] ?? "",
      loai: LOAI[i] ?? "",
      nhom: NHOM[i] ?? "",
      duAn: DU_AN[i] ?? "",
      kenh: KENH[i] ?? "",
      nguonTien: NGUON_TIEN[i] ?? "",
      nguoiDuyet: NGUOI_DUYET[i] ?? "",
      hoaDon: HOA_DON[i] ?? "",
    });
  }

  // ─── Data validation (dropdown) on Data sheet ───
  const lastRow = rows.length + 100; // buffer cho user thêm dòng
  const addDropdown = (col: string, source: string[]) => {
    for (let i = 2; i <= lastRow; i++) {
      dataSheet.getCell(`${col}${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${source.join(",")}"`],
        showErrorMessage: true,
        errorTitle: "Giá trị không hợp lệ",
        error: "Chọn từ danh sách dropdown.",
      };
    }
  };
  addDropdown("B", CHIEU);
  addDropdown("F", LOAI);
  addDropdown("G", NHOM);
  addDropdown("H", DU_AN);
  addDropdown("I", KENH);
  addDropdown("J", NGUON_TIEN);
  addDropdown("K", NGUOI_DUYET);
  addDropdown("L", HOA_DON);

  // ─── SHEET 3: Tổng hợp (pivot Nhóm × Tháng) ───
  const summarySheet = wb.addWorksheet("Tổng hợp");
  const months = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);
  summarySheet.columns = [
    { header: "Nhóm", key: "nhom", width: 35 },
    ...months.map((m) => ({ header: m, key: m, width: 12 })),
    { header: "Tổng năm", key: "total", width: 15 },
  ];
  summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summarySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };

  const pivot = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (r.chieu !== "Chi") continue;
    if (!pivot.has(r.nhom)) pivot.set(r.nhom, new Map());
    const month = Number(r.date.slice(5, 7));
    const cur = pivot.get(r.nhom)!;
    cur.set(month, (cur.get(month) ?? 0) + r.amount);
  }
  const sortedNhoms = [...pivot.entries()]
    .map(([nhom, m]) => ({ nhom, total: [...m.values()].reduce((s, v) => s + v, 0), m }))
    .sort((a, b) => b.total - a.total);

  for (const { nhom, total, m } of sortedNhoms) {
    const row: any = { nhom, total };
    for (let i = 1; i <= 12; i++) row[`T${i}`] = m.get(i) ?? 0;
    summarySheet.addRow(row);
  }
  summarySheet.getColumn("total").numFmt = "#,##0";
  for (let i = 1; i <= 12; i++) summarySheet.getColumn(`T${i}`).numFmt = "#,##0";

  // Tổng hàng cuối
  const totalRow: any = { nhom: "TỔNG" };
  for (let i = 1; i <= 12; i++) {
    totalRow[`T${i}`] = sortedNhoms.reduce((s, x) => s + (x.m.get(i) ?? 0), 0);
  }
  totalRow.total = sortedNhoms.reduce((s, x) => s + x.total, 0);
  const totalRowIdx = summarySheet.rowCount + 1;
  summarySheet.addRow(totalRow);
  summarySheet.getRow(totalRowIdx).font = { bold: true };
  summarySheet.getRow(totalRowIdx).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF3" } };

  // ─── SHEET 4: Hướng dẫn ───
  const guideSheet = wb.addWorksheet("Hướng dẫn");
  guideSheet.columns = [{ header: "Nội dung", key: "content", width: 100 }];
  guideSheet.getRow(1).font = { bold: true, size: 14 };
  const guide = [
    "═══════════════════════════════════════════════════════════════",
    "SỔ QUẢN TRỊ 2025 — Hướng dẫn admin/kế toán nội bộ",
    "═══════════════════════════════════════════════════════════════",
    "",
    "MỤC ĐÍCH:",
    "  File này = trusted source cho VIEW QUẢN TRỊ (CEO/BoD nhìn báo cáo).",
    "  KHÁC với Sổ NKC của Kim (TT200, kế toán) — 2 file song song, không đụng nhau.",
    "",
    "AI NHẬP:",
    "  Admin (Tường Vi) hoặc HR nhập MỖI KHOẢN CHI/THU TRONG NGÀY.",
    "  1 khoản = 1 dòng. Không xóa dòng cũ, không sửa dòng đã qua tháng.",
    "",
    "CÁC CỘT PHẢI ĐIỀN ĐẦY ĐỦ:",
    "  1. Ngày (dd/mm/yyyy)",
    "  2. Chiều: Chi / Thu (dropdown)",
    "  3. Số tiền (VND, số dương)",
    "  4. Nội dung: mô tả ngắn (VD: Thuê VP T8/2025)",
    "  5. Người nhận/trả: tên đối tác/NVKD/NCC",
    "  6. Loại: OPEX / CAPEX / Doanh thu / Passthrough / Chi hộ khách / Chi hộ nội bộ / Vốn góp (dropdown)",
    "  7. Nhóm: chi tiết loại (dropdown ~20 nhóm)",
    "  8. Dự án: gán dự án nếu chi liên quan (VD AVIO, Sky Garden) hoặc \"Chung — VP\" cho chi phí VP",
    "  9. Kênh: CHỈ điền khi Nhóm=Marketing (VD BDS.com.vn / Facebook / Google Ads / Sự kiện)",
    "  10. Nguồn tiền: Bank cty / Bách chi hộ / Triết chi hộ / Cash / Thẻ tín dụng (dropdown)",
    "  11. Người duyệt: Triết / Bách / Kim / Tường Vi (dropdown)",
    "  12. Có hóa đơn?: Có / Không (dropdown)",
    "  13. Link chứng từ (Google Drive URL)",
    "  14. Ghi chú (nếu cần)",
    "",
    "RULES BẮT BUỘC:",
    "  - Không xóa row. Sai → thêm row \"điều chỉnh\" (Chi âm nếu cần).",
    "  - Không sửa row đã qua tháng.",
    "  - 1 khoản = 1 dòng, KHÔNG gộp nhiều mục vào 1 dòng.",
    "  - Nếu Bách/Triết chi hộ: vẫn nhập vào file này với Nguồn tiền = \"Bách chi hộ\" hoặc \"Triết chi hộ\".",
    "  - Cuối tuần: review lại + gán đủ tag Dự án + Kênh.",
    "  - Cuối tháng: đối chiếu tổng với 3 nguồn (sao kê Techcombank + sổ Bách + sổ Triết). Chênh < 100k OK.",
    "",
    "SHEET \"Tổng hợp\":",
    "  Auto pivot theo Nhóm × Tháng. Tự update khi thêm row ở sheet Data.",
    "  (Nếu không tự update, chọn menu Data → Refresh)",
    "",
    "DATA HIỆN TẠI:",
    `  ${rows.length} rows từ 3 nguồn 2025 (sao kê + Bách + Triết) đã auto-tag.`,
    "  Admin cần review + sửa các tag chưa chuẩn (Dự án, Kênh, Người duyệt, Có hóa đơn).",
    "",
    "SYNC VỚI CRM:",
    "  Cuối tháng, gửi file này cho Triết. Triết sync → CRM tự import.",
    "  Report management từ CRM: /reports/cash-flow, /reports/management.",
  ];
  for (const line of guide) guideSheet.addRow({ content: line });

  // Move Hướng dẫn to first sheet (workbook.orderNoCase / order property)
  // ExcelJS: dùng orderNoCase hoặc sort spliceIn. Đơn giản: set order property.
  const sheets = wb.worksheets;
  // orderNoCase = index 0-based
  guideSheet.orderNo = 0;
  dataSheet.orderNo = 1;
  const summary = wb.getWorksheet("Tổng hợp")!;
  summary.orderNo = 2;
  lookupSheet.orderNo = 3;

  const outPath = "data-excel/SO QUAN TRI 2025.xlsx";
  await wb.xlsx.writeFile(outPath);
  console.log(`\n✅ Đã tạo file: ${outPath}`);
  console.log(`   Rows: ${rows.length}`);
  console.log(`   Sheets: Hướng dẫn / Data / Tổng hợp / Lookup`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
