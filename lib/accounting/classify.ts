/**
 * Classifier chi phí BRE — nguồn: scripts/classify-expenses.ts (2026-07-24).
 * Trả về (categoryCode, managementGroup, note) khớp với accounting_categories seed.
 *
 * Import từ:
 *  - Server action (import Excel)
 *  - Inline re-classify (Phase 3)
 *
 * Rule priority: cao nhất → thấp nhất. Thứ cấp/Vốn/Hoàn/Đặt cọc ưu tiên
 * trước để hard-exclude khỏi chi phí BCTC.
 */

export type ClassifyResult = {
  categoryCode: string; // FK accounting_categories.code
  managementGroup: string; // "1. Nhân sự" | ... — cho UI filter
  note: string;
};

type Rule = {
  categoryCode: string;
  managementGroup: string;
  keywords: string[];
  note?: string;
};

const RULES: Rule[] = [
  {
    categoryCode: "secondary",
    managementGroup: "10. Thứ cấp (loại)",
    keywords: ["sang nhượng", "sang nhuong", "thưởng doanh số", "thuong doanh so"],
    note: "LOẠI khỏi chi phí công ty (per framework 2026-07-24)",
  },
  {
    categoryCode: "411",
    managementGroup: "11. Vốn góp / Kí quỹ",
    keywords: [
      "topup", "top up",
      "kí quỹ", "ky quy",
      "nộp tiền vào tài khoản", "nop tien vao tai khoan",
    ],
    note: "Không phải chi phí — hạch toán vốn góp CSH (TK 411)",
  },
  {
    categoryCode: "3411",
    managementGroup: "13. Hoàn booking YCTV",
    keywords: [
      "hoàn tiền yctv", "hoan tien yctv",
      "yctv",
      "hoàn tiền booking", "hoan tien booking",
      "hoàn tiền yêu cầu tư vấn", "hoan tien yeu cau tu van",
      "hoàn cọc booking", "hoan coc booking",
      "hoàn tiền da", "hoan tien da",
      "hoàn tiền dự án", "hoan tien du an",
    ],
    note: "Không phải chi phí — giảm TK 3411/3388 (trả lại nội bộ đã tạm ứng booking)",
  },
  // Cấp tạm ứng cho Admin/HR — không phải chi phí, là chuyển tiền
  // (tăng TK 141 Tạm ứng, giảm TK 111/112). Khi Admin chi ra thực (Nga_HR
  // / Tường Vi_admin sheet) mới là chi phí thực.
  {
    categoryCode: "141",
    managementGroup: "15. Cấp tạm ứng nội bộ",
    keywords: [
      "ứng chi phí tháng", "ung chi phi thang",
      "ứng chi phí t", "ung chi phi t",
      "cấp tạm ứng", "cap tam ung",
    ],
    note: "Không phải chi phí — cấp tạm ứng cho Admin/HR (TK 141)",
  },
  {
    categoryCode: "131",
    managementGroup: "14. Đặt cọc hộ khách",
    keywords: [
      "đặt cọc tt", "dat coc tt",
      "đặt cọc thay", "dat coc thay",
      "cọc hộ khách", "coc ho khach",
    ],
    note: "Không phải chi phí — tăng TK 131/138 phải thu khách (cty cọc thay)",
  },
  {
    categoryCode: "632",
    managementGroup: "9. HH sale / Thù lao sale",
    keywords: [
      // Thưởng doanh số cho sale/NVKD/manager (dựa trên bán được) — không
      // phải lương OPEX. Ưu tiên match trước "thu nhập khác" trong nhóm 1.
      "thưởng + thu nhập khác", "thuong + thu nhap khac",
      "bổ sung thưởng + thu nhập khác", "bo sung thuong + thu nhap khac",
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
  // Thuế pass-through (GTGT + TNDN) — KHÔNG phải chi phí OPEX.
  // - Thuế GTGT: cty thu VAT khách + trả VAT nhà cung cấp, chênh nộp NN.
  //   Không giảm lợi nhuận, chỉ giảm tiền.
  // - Thuế TNDN: nộp SAU khi tính lãi trước thuế. Tính riêng trong P&L.
  // Ưu tiên match trước 6425 để tách rõ.
  // Thuế pass-through: GTGT + TNDN + TNCN (cty nộp thay NV, đã khấu trừ
  // từ lương gross → không tính chi phí lần 2). Không phải OPEX.
  {
    categoryCode: "3331-3334",
    managementGroup: "7b. Thuế pass-through (GTGT/TNDN/TNCN)",
    keywords: [
      "thuế gtgt", "thue gtgt", "gtgt",
      "thuế tndn", "thue tndn", "tndn",
      "thuế tncn", "thue tncn", "tncn",
      "thuế thu nhập cá nhân", "thue thu nhap ca nhan",
      "tạm nộp tndn", "tam nop tndn",
      "hoàn trả tiền thuế tncn", "hoan tra tien thue tncn",
    ],
    note: "Không phải chi phí quản lý — VAT/TNDN/TNCN pass-through",
  },
  // Thuế OPEX thật: môn bài + công đoàn + lệ phí (không TNCN).
  {
    categoryCode: "6425",
    managementGroup: "7. Thuế / Phí NN (OPEX)",
    keywords: [
      "thuế môn bài", "thue mon bai", "lệ phí môn bài", "le phi mon bai",
      "công đoàn", "cong doan",
    ],
  },
  {
    categoryCode: "6421",
    managementGroup: "1. Nhân sự",
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
  {
    categoryCode: "6427-rent",
    managementGroup: "2. Thuê văn phòng",
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
  {
    categoryCode: "6427-svc",
    managementGroup: "3. Dịch vụ mua ngoài",
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
  {
    categoryCode: "6417",
    managementGroup: "4. Marketing / Quảng cáo",
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
  {
    categoryCode: "153-211",
    managementGroup: "5. Thiết bị / TSCĐ",
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
  {
    categoryCode: "6428",
    managementGroup: "6. Vận hành khác",
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
      "be nhận", "be nhan",
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
  {
    categoryCode: "635",
    managementGroup: "8. Chi phí tài chính",
    keywords: ["lãi vay", "lai vay", "phí chuyển khoản", "phi chuyen khoan"],
  },
];

const normMatch = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, " ")
    .replace(/[.,;:'"()+_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function classify(text: string): ClassifyResult {
  const norm = normMatch(text);
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      const kwNorm = normMatch(kw);
      if (norm.includes(kwNorm)) {
        return {
          categoryCode: rule.categoryCode,
          managementGroup: rule.managementGroup,
          note: rule.note ?? "",
        };
      }
    }
  }
  return {
    categoryCode: "unclassified",
    managementGroup: "12. Chưa phân loại",
    note: "Cần dò tay",
  };
}
