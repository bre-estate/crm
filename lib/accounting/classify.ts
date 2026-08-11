/**
 * Classifier chi phí BRE — theo BCTC Kim (TT200) — sửa 2026-07-27.
 * Trả về (categoryCode, managementGroup, note).
 *
 * Cấu trúc mới:
 *   641 CP bán hàng: 6411 (lương NVKD) + 6417 (HH sale + MKT + thưởng + tiếp khách)
 *   642 CP quản lý:  6421 (lương admin) + 6423 (đồ dùng VP) + 6425 (thuế) + 6427 (dịch vụ)
 *   811 CP khác:     chi không hóa đơn Triết
 *   242 CP trả trước: Gimbal + TSCĐ nhỏ phân bổ dần
 *
 * Rule priority: cao nhất → thấp nhất.
 */

export type ClassifyResult = {
  categoryCode: string;
  managementGroup: string;
  note: string;
};

type Rule = {
  categoryCode: string;
  managementGroup: string;
  keywords: string[];
  note?: string;
};

// Danh sách nhận diện NVKD (dùng để phân biệt lương 6411 vs 6421)
const NVKD_KEYWORDS = [
  "bách", "bach",
  "công thành", "cong thanh", "hồ nguyễn công", "ho nguyen cong",
  "minh nhật", "minh nhat", "trần minh nhật", "tran minh nhat",
  "cẩm giang", "cam giang",
  "ngọc duyên", "ngoc duyen",
  "thanh thúy", "thanh thuy", "lê trịnh", "le trinh",
  "thị hồng", "thi hong",
  "quý tài", "quy tai",
  "hạ uyên", "ha uyen",
  "duy anh", "huỳnh duy",
  "hạ sang", "ha sang", "đoàn ngọc",
  "lan kim", "hồ thị lan",
  "khánh linh", "khanh linh", "trần thị khánh",
  "quang tùng", "quang tung", "phạm quang",
  "cẩm nhung", "cam nhung",
  "thái an", "thai an", "vũ thái",
  "đăng khoa", "dang khoa",
];

const ADMIN_KEYWORDS = [
  "tường vi", "tuong vi", "danh hoàng",
  "kế toán", "ke toan",
];

const RULES: Rule[] = [
  // ═════════════════════════════════════════════════
  //   NHÓM KHÔNG PHẢI CHI PHÍ (loại khỏi BCTC)
  // ═════════════════════════════════════════════════
  {
    categoryCode: "811",
    managementGroup: "10a. Chi phí khác (không hóa đơn)",
    keywords: ["sang nhượng", "sang nhuong"],
    note: "TK 811 — chi không hóa đơn (per BCTC Kim)",
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
      "hoàn tiền yctv", "hoan tien yctv", "yctv",
      "hoàn tiền booking", "hoan tien booking",
      "hoàn tiền yêu cầu tư vấn", "hoan tien yeu cau tu van",
      "hoàn cọc booking", "hoan coc booking",
      "hoàn tiền da", "hoan tien da",
      "hoàn tiền dự án", "hoan tien du an",
    ],
    note: "Không phải chi phí — giảm TK 3411/3388",
  },
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
    note: "Không phải chi phí — tăng TK 131/138 phải thu",
  },
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
    note: "Không phải chi phí OPEX — VAT/TNDN/TNCN pass-through",
  },
  {
    categoryCode: "6425",
    managementGroup: "7. Thuế / Phí NN (OPEX)",
    keywords: [
      "thuế môn bài", "thue mon bai", "lệ phí môn bài", "le phi mon bai",
      "công đoàn", "cong doan",
    ],
  },

  // ═════════════════════════════════════════════════
  //   641 CHI PHÍ BÁN HÀNG
  // ═════════════════════════════════════════════════
  {
    categoryCode: "6417",
    managementGroup: "1b. HH sale + Marketing + Thưởng doanh số",
    keywords: [
      // HH sale + thưởng doanh số (Kim gộp vào 6417)
      "thưởng + thu nhập khác", "thuong + thu nhap khac",
      "bổ sung thưởng + thu nhập khác", "bo sung thuong + thu nhap khac",
      "hoa hồng", "hoa hong", "hh sale", "hh ", "thưởng doanh số",
      "thù lao cộng tác viên", "thu lao cong tac vien",
      "thù lao ctv", "thu lao ctv",
      "phụ cấp cộng tác viên", "phu cap cong tac vien",
      "phụ cấp ctv", "phu cap ctv",
      "hỗ trợ ctv", "ho tro ctv",
      "thưởng kpi quản lý", "thuong kpi quan ly",
      "thưởng kpi ql", "thuong kpi ql",
      "hỗ trợ tăng lô", "ho tro tang lo",
      "thưởng nóng", "thuong nong",
      "hỗ trợ khách mua", "ho tro khach mua",
      "hỗ trợ khách hàng", "ho tro khach hang",
      "thanh toán hỗ trợ khách", "thanh toan ho tro khach",
      "thanh toán thù lao", "thanh toan thu lao",
      "thưởng booking", "thuong booking",
      "thưởng ctv", "thuong ctv",
      "hỗ trợ tăng ca", "ho tro tang ca",
      "trích trước chi phí hoa hồng", "trich truoc chi phi hoa hong",
      "trích trước thưởng", "trich truoc thuong",
      "trích trước chi phí kpi", "trich truoc chi phi kpi",
      "trích trước chi phí hỗ trợ", "trich truoc chi phi ho tro",
      // Marketing / quảng cáo
      "quảng cáo", "quang cao", "qc facebook", "qc fb", "fb ads", "facebook ads",
      "google ads", "batdongsan", "chợ tốt", "cho tot", "chotot",
      "in ấn", "in an", "in thẻ", "in the", "in name card", "in tờ", "in to",
      "tờ rơi", "to roi", "tờ gấp", "to gap", "banner", "standee",
      "tuyển dụng", "tuyen dung",
      "topup ads", "nạp tiền google ads", "nap tien google ads",
      "capcut", "logo", "bdsvn", "bds vn", "batdongsan.vn",
      // Tiếp khách + du lịch + khai trương (chi phí bán hàng khác)
      "tiếp khách", "tiep khach",
      "tất niên", "tat nien", "liên hoan", "lien hoan",
      "du lịch", "du lich", "team building", "homestay", "bbq", "tiệc", "tiec",
      "khai trương", "khai truong",
      "đi ăn", "di an", "nhậu", "nhau ", "karaoke",
      "sinh nhật", "sinh nhat",
      // Website hosting & CP CPB (chi phí trả trước phân bổ hàng tháng)
      "hạch toán cp cpb : phí dịch vụ quảng cáo", "hach toan cp cpb : phi dich vu quang cao",
      "website batdongsan",
    ],
    note: "TK 6417 (BCTC): chi phí bán hàng khác — Kim gộp HH + MKT + thưởng doanh số + tiếp khách",
  },

  // Lương: cần detect NVKD vs Admin để chọn 6411 vs 6421
  // Rule này em xử lý bằng resolveByRecipient bên dưới, nhưng để classifier
  // đơn giản hoạt động, mặc định "lương" → 6421, sau đó reclassify script check recipient.
  {
    categoryCode: "6421",
    managementGroup: "1c. Lương + phụ cấp + BHXH",
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
      "hồ gia (marketing)",
      "quyết editor", "quyet editor",
    ],
    note: "TK 6421 default. Reclassify sau theo recipient → 6411 nếu NVKD.",
  },

  // ═════════════════════════════════════════════════
  //   642 CHI PHÍ QUẢN LÝ (không phải nhân sự)
  // ═════════════════════════════════════════════════
  {
    categoryCode: "6427",
    managementGroup: "2. Thuê VP + tiện ích + dịch vụ",
    keywords: [
      // Thuê văn phòng + tiện ích
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
      // Dịch vụ mua ngoài
      "dịch vụ kế toán", "dich vu ke toan", "phí kế toán", "phi ke toan",
      "phí ngân hàng", "phi ngan hang",
      "token", "chữ ký số", "chu ky so",
      "google workspace", "gsuite",
      "hosting", "server", "vultr", "vps",
      "tên miền", "ten mien", "domain",
      "ssl", "chứng chỉ ssl", "chung chi ssl",
      "houzez", "wordpress", "envato",
      "hóa đơn điện tử", "hoa don dien tu",
      "phần mềm", "phan mem",
      "website bre", "web bre",
      "cp nâng cấp hosting", "cp nang cap hosting",
      "chuẩn hóa sổ", "chuan hoa so",
      "phí dịch vụ", "phi dich vu",
      "cước gọi", "cuoc goi",
      "cước điện thoại", "cuoc dien thoai",
      // Đăng ký / phí hành chính
      "đăng ký ", "dang ky ",
      "công chứng", "cong chuc",
      "phòng cháy chữa cháy", "pccc",
      "nộp hồ sơ", "nop ho so",
      "con dấu", "con dau",
      "công văn", "cong van",
      "phụ lục", "phu luc",
      // Dịch vụ tháo lắp / vận chuyển / dán decal (không phải mua tài sản)
      "tháo lắp", "thao lap",
      "bơm gas", "bom gas",
      "vận chuyển", "van chuyen",
      "dán cách nhiệt", "dan cach nhiet",
      "chi thêm 10%", "chi them 10%",
      "tiền gửi xe", "tien gui xe",
    ],
    note: "TK 6427 (BCTC): dịch vụ mua ngoài — thuê VP, tiện ích, phần mềm, dịch vụ HC",
  },

  // Đồ dùng VP (Kim tách riêng TK 6423)
  {
    categoryCode: "6423",
    managementGroup: "6a. Đồ dùng VP",
    keywords: [
      "văn phòng phẩm", "van phong pham", "vpp",
      "giấy a4", "giay a4", "giấy in", "giay in",
      "mực in", "muc in",
      "vệ sinh", "ve sinh", "btaskee",
      "đồng phục", "dong phuc", "áo dự án", "ao du an",
      "nước lau", "nuoc lau", "giấy ăn", "giay an", "khăn lau", "khan lau",
      "sáp thơm", "sap thom", "nước rửa chén", "nuoc rua chen", "thùng rác", "thung rac",
      "túi rác", "tui rac", "chổi", "choi ",
      "cây lau nhà", "cay lau nha", "bao rác", "bao rac",
      "khay làm nước đá", "khay lam nuoc da",
      "nước rửa tay", "nuoc rua tay",
      "ghim bấm", "ghim bam",
      "sim", "cước sim", "cuoc sim",
      "shoppee", "shopee",
      // Đồ dùng nhỏ (< ngưỡng CCDC 3M): ổ điện, quạt, bóng đèn, đồ cúng bàn thờ
      "ổ điện", "o dien", "ổ cắm", "o cam",
      "quạt điện", "quat dien",
      "bóng đèn", "bong den",
      "gạo, muối", "gao muoi",
      "bia, nước ngọt", "bia nuoc ngot",
    ],
    note: "TK 6423 (BCTC): đồ dùng văn phòng",
  },

  // ═════════════════════════════════════════════════
  //   242 CHI PHÍ TRẢ TRƯỚC (thiết bị phân bổ dần)
  //   Chỉ áp dụng nếu:
  //     - Không có "exclude keyword" (dịch vụ/tiêu dùng)
  //     - Amount ≥ 3M (ngưỡng CCDC). Xử lý trong classify() sau khi match.
  // ═════════════════════════════════════════════════
  {
    categoryCode: "242",
    managementGroup: "5a. TSCĐ phân bổ dần",
    keywords: [
      "thiết bị", "thiet bi",
      "máy in", "may in", "máy lạnh", "may lanh", "máy chấm công", "may cham cong",
      "máy lọc nước", "may loc nuoc",
      "máy quay", "may quay", "gimbal", "dji", "camera",
      "bàn ghế", "ban ghe", "bàn trà", "ban tra",
      "tủ hồ sơ", "tu ho so",
      "biển hiệu", "bien hieu",
      "bàn thờ", "ban tho",
      "bảng hiệu", "bang hieu", "lắp bảng hiệu", "lap bang hieu",
      "kệ treo", "ke treo", "kệ giày", "ke giay", "tủ tài liệu", "tu tai lieu",
      "ghế trưởng phòng", "ghe truong phong",
      "rèm", "rem ",
      "cây văn phòng", "cay van phong",
      "mua ghế", "mua ghe", "mua bàn", "mua ban",
    ],
    note: "TK 242 (BCTC): trả trước, phân bổ vào 6417/6427 hàng tháng",
  },

  // ═════════════════════════════════════════════════
  //   635 CHI PHÍ TÀI CHÍNH
  // ═════════════════════════════════════════════════
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

function containsAny(text: string, keywords: string[]): boolean {
  const n = normMatch(text);
  return keywords.some((k) => n.includes(normMatch(k)));
}

/**
 * @param text description
 * @param recipient tên người nhận (dùng để tách 6411 vs 6421 với lương)
 */
// Ngưỡng CCDC: dưới mức này thì chi thẳng vào 6423 thay vì phân bổ TSCĐ (242)
const CCDC_THRESHOLD = 3_000_000;

export function classify(text: string, recipient?: string, amount?: number): ClassifyResult {
  const norm = normMatch(text);
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      const kwNorm = normMatch(kw);
      if (norm.includes(kwNorm)) {
        let categoryCode = rule.categoryCode;
        let managementGroup = rule.managementGroup;
        let note = rule.note ?? "";

        // Lương: nếu 6421 nhưng NVKD detected (via recipient hoặc description) → chuyển 6411
        if (rule.categoryCode === "6421") {
          const combined = `${text} ${recipient ?? ""}`;
          const hasNVKD = containsAny(combined, NVKD_KEYWORDS);
          const hasAdmin = containsAny(combined, ADMIN_KEYWORDS);
          if (hasNVKD && !hasAdmin) {
            categoryCode = "6411";
            managementGroup = "1a. Lương NVKD";
          }
        }

        // 242 chỉ áp dụng nếu amount ≥ 3M. Dưới ngưỡng → chi thẳng 6423 (đồ dùng VP).
        if (rule.categoryCode === "242" && amount != null && amount < CCDC_THRESHOLD) {
          categoryCode = "6423";
          managementGroup = "6a. Đồ dùng VP";
          note = `Chi thẳng (< ${CCDC_THRESHOLD.toLocaleString("vi-VN")} VND, không phân bổ TSCĐ)`;
        }

        return { categoryCode, managementGroup, note };
      }
    }
  }
  return {
    categoryCode: "unclassified",
    managementGroup: "12. Chưa phân loại",
    note: "Cần dò tay",
  };
}
