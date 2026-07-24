/**
 * Phân loại chi phí BRE theo chuẩn kế toán VN.
 *
 * Nguồn:
 *  - So theo doi thanh toan.xlsx (Sheet "1.1-Đề nghị thanh toán"): chi từ TK cty
 *  - Chi Phí - Cá nhân MERGED.xlsx (Triết + Bách): chi trực tiếp founder
 *  - SỔ TẠM ỨNG BRE.xlsx (Nga_HR + Tường Vi_admin): chi từ quỹ tạm ứng (đã de-dup MERGED)
 *
 * 11 nhóm (chốt với user 2026-07-24):
 *  1. Nhân sự (TK 6421)
 *  2. Thuê văn phòng (TK 6427)
 *  3. Dịch vụ mua ngoài (TK 6427)
 *  4. Marketing (TK 6417/6428)
 *  5. Thiết bị / TSCĐ (TK 211/153)
 *  6. Vận hành khác (TK 6428)
 *  7. Thuế / Phí NN (TK 6425)
 *  8. Chi phí tài chính (TK 635)
 *  9. HH sale (TK 632) — flag "đã ở giá vốn CRM, dùng cho P&L merge, không cộng vào chi phí quản lý"
 * 10. Thứ cấp — LOẠI (per framework)
 * 11. Vốn / Kí quỹ (TK 411/244) — không phải chi phí
 *
 * Row không match keyword → "Chưa phân loại".
 *
 * Output: data-excel/Chi phí công ty - BCTC.xlsx
 *  - Sheet "Chi tiết": mọi row + Nhóm + TK + Nguồn
 *  - Sheet "Tổng hợp": pivot Nhóm × Tháng
 *  - Sheet "Chưa phân loại": row cần user dò tay
 */
import * as XLSX from "xlsx";
import * as path from "path";

const dir = path.join(process.cwd(), "data-excel");
const THANH_TOAN = path.join(dir, "Chi phí", "So theo doi thanh toan.xlsx");
const MERGED = path.join(dir, "Chi phí", "Chi Phí - Cá nhân MERGED.xlsx");
const TAM_UNG = path.join(dir, "Chi phí", "SỔ TẠM ỨNG BRE.xlsx");
const OUT = path.join(dir, "Chi phí công ty - BCTC.xlsx");

const clean = (v: unknown) => (v == null ? "" : String(v).trim().replace(/\s+/g, " "));
const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const excelSerialToMonth = (n: number): string => {
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 7);
};
const normNoiDung = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, "")
    .replace(/[.,;:'"()]/g, "");

type Item = {
  thang: string; // YYYY-MM
  ngay: string; // display
  chiTiet: string;
  soTien: number;
  nguoi: string; // Bách / Triết / (rỗng nếu từ TK cty)
  source: string; // "TK cty" / "MERGED-Triết" / "MERGED-Bách" / "TU-Nga" / "TU-Tường Vi"
  nhom: string;
  tk: string;
  note: string;
};

// Priority order: nhóm cao ưu tiên match trước.
type Rule = { nhom: string; tk: string; keywords: string[]; note?: string };
const RULES: Rule[] = [
  // 1. Thứ cấp — ưu tiên nhất (hard exclude)
  {
    nhom: "10. Thứ cấp (loại)",
    tk: "—",
    keywords: ["sang nhượng", "sang nhuong", "thưởng doanh số", "thuong doanh so"],
    note: "LOẠI khỏi chi phí công ty (per framework 2026-07-24)",
  },
  // 11. Vốn góp / Kí quỹ
  {
    nhom: "11. Vốn góp / Kí quỹ",
    tk: "411 / 244",
    keywords: [
      "topup", "top up",
      "kí quỹ", "ky quy",
      "nộp tiền vào tài khoản", "nop tien vao tai khoan",
    ],
    note: "Không phải chi phí — hạch toán vốn góp CSH (TK 411 per user chốt)",
  },
  // 13. Hoàn booking YCTV — cty trả lại nội bộ đã tạm ứng booking khi CĐT hoàn
  {
    nhom: "13. Hoàn booking YCTV",
    tk: "3411 / 3388",
    keywords: [
      "hoàn tiền yctv", "hoan tien yctv",
      "yctv",
      "hoàn tiền booking", "hoan tien booking",
      "hoàn tiền yêu cầu tư vấn", "hoan tien yeu cau tu van",
      "hoàn cọc booking", "hoan coc booking",
    ],
    note: "Không phải chi phí — giảm TK 3411/3388 (trả lại nội bộ đã tạm ứng booking để lấy giỏ hàng tốt)",
  },
  // 14. Đặt cọc hộ khách — cty chi cọc thay khách, khách sẽ hoàn lại
  {
    nhom: "14. Đặt cọc hộ khách",
    tk: "131 / 138",
    keywords: [
      "đặt cọc tt", "dat coc tt",
      "đặt cọc thay", "dat coc thay",
      "cọc hộ khách", "coc ho khach",
    ],
    note: "Không phải chi phí — tăng TK 131/138 phải thu khách (cty cọc hộ, khách sẽ hoàn)",
  },
  // 9. HH sale
  {
    nhom: "9. HH sale / Thù lao sale",
    tk: "632",
    keywords: [
      "hoa hồng", "hoa hong", "hh sale", "hh ", "thưởng doanh số nội bộ",
      "thù lao cộng tác viên", "thu lao cong tac vien",
      "thù lao ctv", "thu lao ctv",
      "phụ cấp cộng tác viên", "phu cap cong tac vien",
      "phụ cấp ctv", "phu cap ctv",
      "hỗ trợ ctv", "ho tro ctv",
      "thưởng kpi quản lý", "thuong kpi quan ly",
      "hỗ trợ tăng lô", "ho tro tang lo",
      "thưởng nóng", "thuong nong",
      "hỗ trợ khách mua", "ho tro khach mua",
      "hỗ trợ khách hàng", "ho tro khach hang",
      "thanh toán hỗ trợ khách", "thanh toan ho tro khach",
      "thanh toán thù lao", "thanh toan thu lao",
      "thưởng booking", "thuong booking",
      "thưởng ctv", "thuong ctv",
      "hỗ trợ tăng ca", "ho tro tang ca",
    ],
    note: "Đã ghi ở CRM giá vốn per căn. Dùng cho P&L merge, KHÔNG cộng vào chi phí quản lý",
  },
  // 7. Thuế / Phí NN
  {
    nhom: "7. Thuế / Phí NN",
    tk: "6425",
    keywords: [
      "thuế môn bài", "thue mon bai", "thuế tndn", "thue tndn",
      "thuế gtgt", "thue gtgt", "gtgt",
      "tndn", "tncn", "thuế thu nhập", "thue thu nhap",
      "công đoàn", "cong doan", "lệ phí", "le phi",
      "tạm nộp", "tam nop", "nộp thuế", "nop thue",
      "đóng thuế", "dong thue",
    ],
  },
  // 1. Nhân sự
  {
    nhom: "1. Nhân sự",
    tk: "6421",
    keywords: [
      "lương", "luong ",
      "bhxh", "bhyt", "bhtn", "bảo hiểm", "bao hiem",
      "thưởng tết", "thuong tet", "thưởng lễ", "thuong le",
      "thưởng nv", "thuong nv", "thưởng nhân viên", "thuong nhan vien",
      "phụ cấp", "phu cap",
      "trợ cấp", "tro cap",
      "chấm công", "cham cong",
      "thu nhập khác", "thu nhap khac",
      "bổ sung thưởng", "bo sung thuong",
      "hỗ trợ tết", "ho tro tet",
      "thưởng tháng", "thuong thang",
      "thưởng kpi ql", "thuong kpi ql",
      "hồ gia (marketing)",
      "quyết editor", "quyet editor",
    ],
  },
  // 2. Thuê văn phòng
  {
    nhom: "2. Thuê văn phòng",
    tk: "6427",
    keywords: [
      "thuê văn phòng", "thue van phong", "thuê trụ sở", "thue tru so",
      "thuê vp", "thue vp", "thuê nhà", "thue nha", "thuê mặt bằng", "thue mat bang",
      "tiền thuê", "tien thue",
      "tiền điện", "tien dien", "hóa đơn điện", "hoa don dien",
      "tiền nước", "tien nuoc",
      "internet", "wifi", "lắp internet", "lap internet",
      "phí quản lý mặt bằng", "phi quan ly mat bang", "phí quản lý bcons", "phi quan ly bcons",
      "phí quản lý t", "phi quan ly t",
      "phí quản lí", "phi quan li",
      "phí ql mặt bằng", "phi ql mat bang",
      "hóa điện", "hoa dien",
      "cọc thuê", "coc thue",
      "cọc mặt bằng", "coc mat bang",
      "mặt bằng", "mat bang",
    ],
  },
  // 3. Dịch vụ mua ngoài
  {
    nhom: "3. Dịch vụ mua ngoài",
    tk: "6427",
    keywords: [
      "dịch vụ kế toán", "dich vu ke toan", "phí kế toán", "phi ke toan",
      "phí ngân hàng", "phi ngan hang",
      "token", "chữ ký số", "chu ky so",
      "google workspace", "gsuite",
      "hosting", "server", "vultr", "vps",
      "tên miền", "ten mien", "domain",
      "ssl", "chứng chỉ ssl", "chung chi ssl",
      "houzez", "wordpress", "envato",
      "capcut",
      "hóa đơn điện tử", "hoa don dien tu",
      "phần mềm", "phan mem",
      "website bre", "web bre",
      "cp nâng cấp hosting", "cp nang cap hosting",
      "chuẩn hóa sổ", "chuan hoa so",
      "phí dịch vụ", "phi dich vu",
      "cước gọi", "cuoc goi",
      "cước điện thoại", "cuoc dien thoai",
    ],
  },
  // 4. Marketing / Quảng cáo
  {
    nhom: "4. Marketing / Quảng cáo",
    tk: "6417",
    keywords: [
      "quảng cáo", "quang cao", "qc facebook", "qc fb", "fb ads", "facebook ads",
      "google ads", "batdongsan", "chợ tốt", "cho tot", "chotot",
      "in ấn", "in an", "in thẻ", "in the", "in name card", "in tờ", "in to",
      "tờ rơi", "to roi", "tờ gấp", "to gap", "banner", "standee",
      "tuyển dụng", "tuyen dung",
      "topup ads", "nạp tiền google ads", "nap tien google ads",
      "capcut pro",
      "logo",
      "bdsvn", "bds vn", "batdongsan.vn",
    ],
  },
  // 5. Thiết bị / TSCĐ
  {
    nhom: "5. Thiết bị / TSCĐ",
    tk: "153/211",
    keywords: [
      "thiết bị", "thiet bi",
      "máy in", "may in", "máy lạnh", "may lanh", "máy chấm công", "may cham cong",
      "máy lọc nước", "may loc nuoc",
      "máy quay", "may quay", "gimbal", "dji", "camera",
      "bàn ghế", "ban ghe", "bàn trà", "ban tra",
      "tủ hồ sơ", "tu ho so",
      "biển hiệu", "bien hieu",
      "bàn thờ", "ban tho",
      "ổ cắm", "o cam", "ổ điện", "o dien",
      "quạt điện", "quat dien",
      "bảng hiệu", "bang hieu", "lắp bảng hiệu", "lap bang hieu",
      "kệ treo", "ke treo", "kệ giày", "ke giay", "tủ tài liệu", "tu tai lieu",
      "ghế trưởng phòng", "ghe truong phong",
      "rèm", "rem ",
      "dán cách nhiệt", "dan cach nhiet",
      "cây văn phòng", "cay van phong",
      "mua ghế", "mua ghe", "mua bàn", "mua ban",
    ],
  },
  // 6. Vận hành khác
  {
    nhom: "6. Vận hành khác",
    tk: "6428",
    keywords: [
      "văn phòng phẩm", "van phong pham", "vpp",
      "ship", "giao ", "book be", "book grab", "grab",
      "tiếp khách", "tiep khach", "liên hoan", "lien hoan", "tất niên", "tat nien",
      "cúng", "cung ", "thần tài", "than tai", "hoa cúng", "hoa cung", "trái cây cúng", "trai cay cung",
      "khai trương", "khai truong",
      "đào tạo", "dao tao",
      "đồng phục", "dong phuc", "áo dự án", "ao du an",
      "nước lau", "nuoc lau", "giấy ăn", "giay an", "khăn lau", "khan lau",
      "hoa quả", "hoa qua", "trái cây", "trai cay",
      "múa lân", "mua lan",
      "học chứng chỉ", "hoc chung chi",
      "phòng cháy chữa cháy", "pccc",
      "thẻ xe", "the xe", "thẻ từ", "the tu", "chìa khoá", "chia khoa",
      "văn bản", "van ban", "công chứng", "cong chuc",
      "bánh cúng", "banh cung", "bánh trái", "banh trai",
      "sáp thơm", "sap thom", "nước rửa chén", "nuoc rua chen", "thùng rác", "thung rac",
      "vệ sinh", "ve sinh", "btaskee",
      "mực in", "muc in",
      "grab", "be nhận", "be nhan",
      "hỗ trợ tết", "ho tro tet",
      "trả ship", "tra ship",
      "nước hoa xịt thơm", "nuoc hoa xit thom",
      "pin thay", "pin ", "chân đèn", "chan den", "sạc", "sac",
      "vệ sinh thảm", "ve sinh tham", "thảm", "tham ",
      "vật tư", "vat tu", "ổ khoá", "o khoa",
      "nhang", "hương", "huong",
      "đăng ký ", "dang ky ", "đăng ký thẻ", "dang ky the",
      "con dấu", "con dau",
      "nộp hồ sơ", "nop ho so", "giao hồ sơ", "giao ho so",
      "hoa và trái cây", "hoa va trai cay", "hoa + trái cây", "hoa+trai cay",
      "trà bánh", "tra banh",
      "karaoke",
      "thành lập", "thanh lap",
      "du lịch", "du lich", "team building", "homestay", "bbq", "tiệc", "tiec",
      "đi ăn", "di an",
      "folder bre", "bì thư", "bi thu",
      "lì xì", "li xi",
      "nhậu", "nhau ",
      "hoa chúc mừng", "hoa chuc mung",
      "khởi công", "khoi cong",
      "tháo lắp cam", "thao lap cam",
      "setup", "bộ bình cốc", "bo binh coc", "tranh tạo động lực", "tranh tao dong luc",
      "cây lau nhà", "cay lau nha", "bao rác", "bao rac", "kéo", "keo ",
      "cây xúc rác", "cay xuc rac", "chổi", "choi ",
      "túi rác", "tui rac", "khay làm nước đá", "khay lam nuoc da",
      "tô ", "to ", "dù", "du ", "dép", "dep ",
      "quét dọn", "quet don",
      "bánh kem", "banh kem",
      "nước ngọt", "nuoc ngot",
      "thuốc xịt cây", "thuoc xit cay",
      "cây để bàn", "cay de ban",
      "cây để", "cay de",
      "hoa", "hoa + bánh", "hoa + banh",
      "giấy", "giay",
      "xịt thơm", "xit thom",
      "dây vòi xịt", "day voi xit",
      "book dọn", "book don", "book dọn dẹp", "book don dep",
      "giúp việc", "giup viec",
      "tiền vàng", "tien vang", "rượu", "ruou ",
      "gửi ", "gui ",
      "phụ lục", "phu luc",
      "trạm y tế", "tram y te",
      "huy hiệu", "huy hieu", "cup ",
      "poster",
      "ghim bấm", "ghim bam",
      "sinh nhật", "sinh nhat",
      "nước rửa tay", "nuoc rua tay",
      "book",
      "giấy a4", "giay a4",
      "ứng chi phí", "ung chi phi",
      "tạm ứng hr", "tam ung hr",
      "sim", "cước sim", "cuoc sim",
      "shoppee", "shopee",
      "vàng + rượu",
    ],
  },
  // 8. Chi phí tài chính
  {
    nhom: "8. Chi phí tài chính",
    tk: "635",
    keywords: ["lãi vay", "lai vay", "phí chuyển khoản", "phi chuyen khoan"],
  },
];

// Normalize cả text lẫn keyword giống nhau (strip accents + space + punctuation)
// để match được các trường hợp user gõ không dấu hoặc space bất thường.
const normMatch = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, " ")
    .replace(/[.,;:'"()+_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function classify(text: string): { nhom: string; tk: string; note: string } {
  const norm = normMatch(text);
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      const kwNorm = normMatch(kw);
      if (norm.includes(kwNorm)) {
        return { nhom: rule.nhom, tk: rule.tk, note: rule.note ?? "" };
      }
    }
  }
  return { nhom: "12. Chưa phân loại", tk: "?", note: "Cần dò tay" };
}

// ============================================================
// Readers
// ============================================================

function readThanhToan(): Item[] {
  const wb = XLSX.readFile(THANH_TOAN);
  const ws = wb.Sheets["1.1-Đề nghị thanh toán"];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  const out: Item[] = [];
  // Data từ row 11 (header ở row 8-9-10).
  for (let i = 11; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const stt = r[0];
    if (stt == null || stt === "") continue;
    const chiTiet = clean(r[4]);
    const soTien = toNum(r[5]);
    if (soTien === 0) continue;
    // Ngày ĐNTT (col 1) hoặc ngày thanh toán thực (col 19) — chọn ngày thanh toán
    // thực nếu có, else ngày ĐNTT.
    const ngayRaw = r[19] ?? r[1];
    let thang = "";
    let ngay = "";
    if (typeof ngayRaw === "number") {
      thang = excelSerialToMonth(ngayRaw);
      const iso = new Date((ngayRaw - 25569) * 86400 * 1000).toISOString().slice(0, 10);
      ngay = iso;
    } else if (typeof ngayRaw === "string" && ngayRaw) {
      const m = ngayRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        thang = `${m[3]}-${m[2].padStart(2, "0")}`;
        ngay = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
    }
    const bp = clean(r[3]);
    const nguoiNhan = clean(r[10]);
    const clsInput = `${chiTiet} ${clean(r[9])} ${nguoiNhan}`;
    const c = classify(clsInput);
    out.push({
      thang,
      ngay,
      chiTiet,
      soTien,
      nguoi: "",
      source: `TK cty · ${bp}${nguoiNhan ? ` → ${nguoiNhan}` : ""}`,
      nhom: c.nhom,
      tk: c.tk,
      note: c.note,
    });
  }
  return out;
}

function readMerged(): Item[] {
  const wb = XLSX.readFile(MERGED);
  const out: Item[] = [];
  for (const nguoi of ["Triết", "Bách"]) {
    const ws = wb.Sheets[nguoi];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const hangMuc = clean(r[1]);
      if (hangMuc === "TỔNG") break;
      const chiTiet = clean(r[2]);
      const soTien = toNum(r[4]);
      const thang = clean(r[0]);
      if (!thang || soTien === 0) continue;
      const clsInput = `${hangMuc} ${chiTiet} ${clean(r[3])}`;
      const c = classify(clsInput);
      out.push({
        thang,
        ngay: clean(r[7]),
        chiTiet: `${hangMuc}${chiTiet ? " — " + chiTiet : ""}`,
        soTien,
        nguoi,
        source: `MERGED-${nguoi}`,
        nhom: c.nhom,
        tk: c.tk,
        note: c.note,
      });
    }
  }
  return out;
}

function readTamUng(mergedKeys: Set<string>): Item[] {
  const wb = XLSX.readFile(TAM_UNG);
  const out: Item[] = [];
  for (const sheetName of ["Nga_HR", "Tường Vi_admin"]) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    for (let i = 7; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const chi = toNum(r[3]);
      if (chi === 0) continue;
      const ngayRaw = r[0];
      const month = typeof ngayRaw === "number" ? excelSerialToMonth(ngayRaw) : "";
      if (!month) continue;
      const noiDung = clean(r[1]);
      const key = `${chi}|${normNoiDung(noiDung)}`;
      if (mergedKeys.has(key)) continue; // đã có ở MERGED — dedup
      const c = classify(noiDung);
      out.push({
        thang: month,
        ngay: new Date((ngayRaw - 25569) * 86400 * 1000).toISOString().slice(0, 10),
        chiTiet: noiDung,
        soTien: chi,
        nguoi: "Bách",
        source: `TU-${sheetName.replace("_", " ")}`,
        nhom: c.nhom,
        tk: c.tk,
        note: c.note,
      });
    }
  }
  return out;
}

// ============================================================
// Main
// ============================================================

function main() {
  const merged = readMerged();
  const mergedKeys = new Set<string>();
  for (const m of merged) {
    mergedKeys.add(`${m.soTien}|${normNoiDung(m.chiTiet)}`);
  }
  const tkCty = readThanhToan();
  const tu = readTamUng(mergedKeys);
  const all: Item[] = [...tkCty, ...merged, ...tu];

  // Sort theo tháng rồi nguồn rồi ngày
  all.sort((a, b) => {
    const t = (a.thang || "9999").localeCompare(b.thang || "9999");
    if (t !== 0) return t;
    return (a.ngay || "9999").localeCompare(b.ngay || "9999");
  });

  console.log(`TK cty: ${tkCty.length} rows`);
  console.log(`MERGED (Triết + Bách): ${merged.length} rows`);
  console.log(`Tạm Ứng (chỉ rows chưa có trong MERGED): ${tu.length} rows`);
  console.log(`TOTAL: ${all.length} rows\n`);

  // Sheet Chi tiết
  const HEADERS = ["Tháng", "Ngày", "Chi tiết", "Số tiền", "Nhóm", "TK kế toán", "Nguồn", "Người", "Ghi chú"];
  const detailAoA: any[][] = [HEADERS];
  for (const i of all) {
    detailAoA.push([
      i.thang,
      i.ngay,
      i.chiTiet,
      i.soTien,
      i.nhom,
      i.tk,
      i.source,
      i.nguoi,
      i.note,
    ]);
  }
  const totalAll = all.reduce((s, i) => s + i.soTien, 0);
  detailAoA.push([]);
  detailAoA.push(["", "", "TỔNG", totalAll, "", "", "", "", ""]);

  // Sheet Tổng hợp: Nhóm × Tháng pivot
  const nhomSet = new Set<string>();
  const thangSet = new Set<string>();
  const byNT = new Map<string, Map<string, number>>();
  for (const i of all) {
    nhomSet.add(i.nhom);
    if (!i.thang) continue;
    thangSet.add(i.thang);
    if (!byNT.has(i.nhom)) byNT.set(i.nhom, new Map());
    const m = byNT.get(i.nhom)!;
    m.set(i.thang, (m.get(i.thang) ?? 0) + i.soTien);
  }
  const nhomList = [...nhomSet].sort();
  const thangList = [...thangSet].sort();
  const pivotAoA: any[][] = [["Nhóm", ...thangList, "TỔNG"]];
  const monthTotals = new Map<string, number>();
  for (const n of nhomList) {
    const row: any[] = [n];
    let rowTotal = 0;
    for (const t of thangList) {
      const v = byNT.get(n)?.get(t) ?? 0;
      row.push(v || null);
      rowTotal += v;
      monthTotals.set(t, (monthTotals.get(t) ?? 0) + v);
    }
    row.push(rowTotal);
    pivotAoA.push(row);
  }
  pivotAoA.push([]);
  pivotAoA.push([
    "TỔNG",
    ...thangList.map((t) => monthTotals.get(t) ?? 0),
    totalAll,
  ]);

  // Sheet BCTC: tổng chi phí quản lý = tất cả trừ nhóm 9/10/11 + Chưa phân loại (chờ dò)
  const IS_COST_MGMT = (n: string) =>
    !n.startsWith("9.") &&
    !n.startsWith("10.") &&
    !n.startsWith("11.") &&
    !n.startsWith("12.") &&
    !n.startsWith("13.") &&
    !n.startsWith("14.");
  const costMgmt = all.filter((i) => IS_COST_MGMT(i.nhom));
  const costMgmtSum = costMgmt.reduce((s, i) => s + i.soTien, 0);
  const secondarySum = all.filter((i) => i.nhom.startsWith("10.")).reduce((s, i) => s + i.soTien, 0);
  const capitalSum = all.filter((i) => i.nhom.startsWith("11.")).reduce((s, i) => s + i.soTien, 0);
  const hhSaleSum = all.filter((i) => i.nhom.startsWith("9.")).reduce((s, i) => s + i.soTien, 0);
  const unclSum = all.filter((i) => i.nhom.startsWith("12.")).reduce((s, i) => s + i.soTien, 0);
  const refundSum = all.filter((i) => i.nhom.startsWith("13.")).reduce((s, i) => s + i.soTien, 0);
  const cocKhachSum = all.filter((i) => i.nhom.startsWith("14.")).reduce((s, i) => s + i.soTien, 0);

  const bctcAoA: any[][] = [
    ["Chỉ số", "Số tiền (VND)", "Ghi chú"],
    ["Chi phí quản lý (nhóm 1-8)", costMgmtSum, "Chi phí công ty BCTC (chưa loại HĐ không hợp lệ)"],
    ["HH sale (nhóm 9)", hhSaleSum, "Đã có ở CRM giá vốn — dùng cho P&L merge, không cộng vào CP quản lý"],
    ["Vốn góp / Kí quỹ (nhóm 11)", capitalSum, "Hạch toán TK 411 / 244, không phải chi phí"],
    ["Thứ cấp bị loại (nhóm 10)", secondarySum, "Chi ngoài phục vụ hoạt động thứ cấp"],
    ["Hoàn booking YCTV (13)", refundSum, "Không phải chi phí — giảm TK 3411/3388 (trả lại nội bộ tạm ứng booking)"],
    ["Đặt cọc hộ khách (14)", cocKhachSum, "Không phải chi phí — tăng TK 131/138 (cty cọc thay, khách sẽ hoàn)"],
    ["Chưa phân loại (nhóm 12)", unclSum, "Cần user dò tay — xem sheet Chưa phân loại"],
    [],
    ["TỔNG THÔ", totalAll, ""],
  ];

  // Sheet "Chưa phân loại"
  const uncl = all.filter((i) => i.nhom.startsWith("12."));
  const unclAoA: any[][] = [HEADERS];
  for (const i of uncl) {
    unclAoA.push([i.thang, i.ngay, i.chiTiet, i.soTien, i.nhom, i.tk, i.source, i.nguoi, i.note]);
  }

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(bctcAoA), "Tóm tắt BCTC");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(pivotAoA), "Nhóm × Tháng");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(detailAoA), "Chi tiết");
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(unclAoA), "Chưa phân loại");

  XLSX.writeFile(wbOut, OUT);

  const fmt = (n: number) => n.toLocaleString("vi-VN").padStart(16);
  console.log("== TÓM TẮT ==");
  console.log(`Chi phí quản lý (1-8)  : ${fmt(costMgmtSum)} VND  ← CHI PHÍ BCTC`);
  console.log(`HH sale (nhóm 9)       : ${fmt(hhSaleSum)} VND  (đã ở CRM giá vốn)`);
  console.log(`Vốn góp / Kí quỹ (11)  : ${fmt(capitalSum)} VND  (TK 411/244)`);
  console.log(`Thứ cấp bị loại (10)   : ${fmt(secondarySum)} VND`);
  console.log(`Hoàn booking YCTV (13) : ${fmt(refundSum)} VND  (giảm TK 3411/3388)`);
  console.log(`Đặt cọc hộ khách (14)  : ${fmt(cocKhachSum)} VND  (tăng TK 131/138)`);
  console.log(`Chưa phân loại (12)    : ${fmt(unclSum)} VND  ← cần dò`);
  console.log(`─────────────────────────────────────────`);
  console.log(`TỔNG THÔ               : ${fmt(totalAll)} VND\n`);
  console.log(`\n✅ ${OUT}`);
}

main();
