/**
 * Phân loại giao dịch (bank_transactions + general_expenses) vào 32 bucket.
 * Dùng chung cho auto-classify sao kê bank + suggest bucket khi user nhập tay.
 *
 * Map 1:1 với Kim BC "BC chi tiết lợi nhuận" 2.1-2.8 + 4.1-4.5 để P&L khớp Kim.
 */

export type CategoryKey =
  // Dòng tiền vào (5)
  | "dt_hh_so_cap" | "dt_thu_cap" | "von_gop" | "vay_nhan" | "khac_thu"
  // Giá vốn (Kim BC 2.1-2.8) (8)
  | "hh_sale" | "ho_tro_khach"
  | "cdt_thuong_nvkd" | "cdt_thuong_ql"
  | "cty_thuong_ql" | "cty_thuong_tpkd" | "cty_thuong_admin" | "cty_thuong_ceo"
  // OPEX chính (Kim BC 4.1-4.4) (4)
  | "luong_nvkd" | "thuong_ds_sale" | "luong_admin" | "marketing"
  // OPEX khác tách từ Kim BC 4.5 (7)
  | "thue_vp" | "do_dung_vp" | "di_lai" | "tiep_khach"
  | "dich_vu_ngoai" | "thue_phi_le_phi" | "opex_khac"
  // Không tính P&L, chỉ Cash flow (7)
  | "thue_tncn" | "thue_tndn" | "thue_vat"
  | "tra_no_goc" | "chuyen_noi_bo" | "rut_von" | "hoan_khach"
  // Chưa xác định (1)
  | "chua_phan_loai";

export type CategoryGroup = "inflow" | "cogs" | "opex" | "non_pnl" | "unknown";

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  group: CategoryGroup;
  kimBc?: string;
}

export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  dt_hh_so_cap:     { key: "dt_hh_so_cap",     label: "Doanh thu HH sơ cấp",              group: "inflow" },
  dt_thu_cap:       { key: "dt_thu_cap",       label: "Doanh thu thứ cấp",                group: "inflow" },
  von_gop:          { key: "von_gop",          label: "Vốn góp founder",                  group: "inflow" },
  vay_nhan:         { key: "vay_nhan",         label: "Vay nhận",                         group: "inflow" },
  khac_thu:         { key: "khac_thu",         label: "Thu khác",                         group: "inflow" },

  hh_sale:          { key: "hh_sale",          label: "Chi phí hoa hồng",                 group: "cogs", kimBc: "2.1" },
  ho_tro_khach:     { key: "ho_tro_khach",     label: "Hỗ trợ khách mua",                 group: "cogs", kimBc: "2.2" },
  cdt_thuong_nvkd:  { key: "cdt_thuong_nvkd",  label: "CĐT thưởng NVKD",                  group: "cogs", kimBc: "2.3" },
  cdt_thuong_ql:    { key: "cdt_thuong_ql",    label: "CĐT thưởng quản lý sàn",           group: "cogs", kimBc: "2.4" },
  cty_thuong_ql:    { key: "cty_thuong_ql",    label: "Cty thưởng quản lý sàn",           group: "cogs", kimBc: "2.5" },
  cty_thuong_tpkd:  { key: "cty_thuong_tpkd",  label: "Cty thưởng TPKD",                  group: "cogs", kimBc: "2.6" },
  cty_thuong_admin: { key: "cty_thuong_admin", label: "Cty thưởng Admin",                 group: "cogs", kimBc: "2.7" },
  cty_thuong_ceo:   { key: "cty_thuong_ceo",   label: "Cty thưởng CEO",                   group: "cogs", kimBc: "2.8" },

  luong_nvkd:       { key: "luong_nvkd",       label: "Lương NVKD + BHXH cty",            group: "opex", kimBc: "4.1" },
  thuong_ds_sale:   { key: "thuong_ds_sale",   label: "Thưởng doanh số + khác sale",      group: "opex", kimBc: "4.2" },
  luong_admin:      { key: "luong_admin",      label: "Lương QL/Admin + BHXH cty",        group: "opex", kimBc: "4.3" },
  marketing:        { key: "marketing",        label: "Chi phí quảng cáo",                group: "opex", kimBc: "4.4" },

  thue_vp:          { key: "thue_vp",          label: "Thuê VP + điện nước internet",     group: "opex", kimBc: "4.5" },
  do_dung_vp:       { key: "do_dung_vp",       label: "Đồ dùng + thiết bị VP",            group: "opex", kimBc: "4.5" },
  di_lai:           { key: "di_lai",           label: "Đi lại + xăng xe",                 group: "opex", kimBc: "4.5" },
  tiep_khach:       { key: "tiep_khach",       label: "Tiếp khách",                       group: "opex", kimBc: "4.5" },
  dich_vu_ngoai:    { key: "dich_vu_ngoai",    label: "Dịch vụ mua ngoài",                group: "opex", kimBc: "4.5" },
  thue_phi_le_phi:  { key: "thue_phi_le_phi",  label: "Thuế phí lệ phí (không TNCN/TNDN)",group: "opex", kimBc: "4.5" },
  opex_khac:        { key: "opex_khac",        label: "OPEX khác",                        group: "opex", kimBc: "4.5" },

  thue_tncn:        { key: "thue_tncn",        label: "Nộp TNCN",                         group: "non_pnl" },
  thue_tndn:        { key: "thue_tndn",        label: "Nộp TNDN",                         group: "non_pnl" },
  thue_vat:         { key: "thue_vat",         label: "Nộp VAT",                          group: "non_pnl" },
  tra_no_goc:       { key: "tra_no_goc",       label: "Trả nợ gốc vay",                   group: "non_pnl" },
  chuyen_noi_bo:    { key: "chuyen_noi_bo",    label: "Chuyển giữa TK nội bộ",            group: "non_pnl" },
  rut_von:          { key: "rut_von",          label: "Rút vốn founder",                  group: "non_pnl" },
  hoan_khach:       { key: "hoan_khach",       label: "Hoàn tiền khách",                  group: "non_pnl" },

  chua_phan_loai:   { key: "chua_phan_loai",   label: "Chưa phân loại",                   group: "unknown" },
};

// Employees theo phòng — dùng để classify lương/thưởng theo partner_name.
// Sync từ /employees; khi thêm NV mới thì update list này hoặc load DB.
const NVKD_NAMES = new Set([
  "DOAN LE BACH", "HO NGUYEN CONG THANH", "TRAN MINH NHAT",
  "TRAN THI KHANH LINH", "LE THI CAM GIANG", "LE TRINH THANH THUY",
  "VU DUC THINH", "DOAN NGOC HA SANG", "HUYNH DUY ANH",
  "NGUYEN THI HONG NHUNG", "BUI THI HA UYEN", "NGUYEN QUY TAI",
  "VO THI THU THAO", "TONG THI NHUNG", "TONG THI HONG THAM",
  "VU THI NGOC DUYEN", "PHAM VAN QUYET", "BUI XUAN DAT",
]);
const ADMIN_NAMES = new Set([
  "DANH HOANG THI TUONG VI", "PHAM QUANG TUNG", "LUONG THI NGA",
  "HO THI LAN KIM", // Kế toán thuê ngoài
]);
const MARKETING_NAMES = new Set([
  "LE THANH TUNG",
]);
const OWNER_NAMES = new Set([
  "NGUYEN MINH TRIET", "MINH TRIET",
]);

interface Rule {
  category: CategoryKey;
  patterns: RegExp[];
  priority: number;    // Số nhỏ chạy trước; specific rule cao priority (số bé)
  confidence: number;  // 0-100
  requireInflow?: boolean;
  requireOutflow?: boolean;
  requirePartner?: "nvkd" | "admin" | "marketing" | "owner";
}

// Rules được sort theo priority. Specific → generic.
// Confidence: 90+ = pattern chắc; 70-80 = có thể; <70 = fallback.
const RULES: Rule[] = [
  // ═══ INFLOW (dòng tiền vào — có creditAmount) ═══
  { category: "von_gop", priority: 10, confidence: 95, requireInflow: true,
    patterns: [/vốn góp/i, /von gop/i, /triết góp/i, /triet gop/i, /bách góp/i, /bach gop/i, /founder góp/i] },

  { category: "vay_nhan", priority: 10, confidence: 90, requireInflow: true,
    patterns: [/nhận vay/i, /nhan vay/i, /giải ngân/i, /giai ngan/i, /vay ngắn hạn/i] },

  { category: "dt_thu_cap", priority: 15, confidence: 90, requireInflow: true,
    patterns: [/thứ cấp/i, /thu cap/i, /f2 resale/i, /chuyển nhượng căn/i, /chuyen nhuong can/i] },

  // Passthrough inflow: khách chuyển tiền booking/đặt cọc/DKTV qua sàn — sàn giữ hộ cho CĐT
  { category: "chuyen_noi_bo", priority: 16, confidence: 88, requireInflow: true,
    patterns: [
      /\bDKTV\b/i, /đăng ký tham gia/i,
      /\bbooking\b/i,
      /\bdat coc\b/i, /đặt cọc/i,
      /\bdat cho\b/i, /giữ chỗ/i,
      /at saigon riverside/i, /at sài gòn/i,
      /the emerald garden view/i, /phu dong sky garden/i,
      /chuyen khoan.*dat cho.*du an/i,
      /nop tien.*vao tai khoan/i, /NOP TIEN$/i,
    ] },

  // DT HH sơ cấp — CĐT/đối tác chuyển phí môi giới về cho sàn
  { category: "dt_hh_so_cap", priority: 18, confidence: 92, requireInflow: true,
    patterns: [
      /phí môi giới/i, /phi moi gioi/i, /\bpmg\b/i,
      /thưởng nóng du an/i, /thuong nong du an/i, /thưởng nóng dự án/i,
      /thanh toan.*phi moi gioi/i, /tt.*pmg/i,
      /hoa hong.*(căn|can|dot|đợt|dự án|du an)/i, /(căn|can|dot).*hoa hong/i,
      /TT.*(AVIO|Fiato|Bcon|Bcons|Phú Đông|Phu Dong|Aria|Emerald|Sapphire|EGD|EGV|Fenica|ATR|Sky Garden)/i,
      /chuyển hoa hồng/i, /chuyen hoa hong/i,
      /(DATALOCA|DATA LOCA|DXMD|DKRS|VXS|DANH KHOI).*(thanh toan|tt|chuyen|hd)/i,
    ] },

  // DT HH sơ cấp fallback: giao dịch vào có tên CĐT quen thuộc
  { category: "dt_hh_so_cap", priority: 22, confidence: 78, requireInflow: true,
    patterns: [
      /DATALOCA|DATA LOCA/i, /DXMDVietnam|DXMD Vietnam/i, /\bDKRS\b/i, /\bVXS\b/i,
    ] },

  // ═══ OUTFLOW CHUYỂN NỘI BỘ / FUND MOVEMENTS — HIGH PRIORITY (không phải OPEX) ═══

  // Chuyển tiền dự án (giữ hộ, tạm ứng, ký quỹ) — CĐT/khách, không phải chi phí
  { category: "chuyen_noi_bo", priority: 22, confidence: 92, requireOutflow: true,
    patterns: [
      /chuyen tien.*(dang ky|đăng ký).*du an/i,
      /chuyen tien.*yctv/i, /YCTV du an/i,
      /chuyen tien.*ki quy/i, /chuyen tien.*ký quỹ/i,
      /chuyen tien.*giu cho.*khach/i, /giữ chỗ.*khách/i,
      /Open term deposit/i, /gửi tiết kiệm/i, /gui tiet kiem/i,
      /Bang ke.*BKCT|BKHT/i,
      /Don vi BRE chuyen tien/i,
      // Nộp thay khách (passthrough qua CĐT): "Nop thay [tên] [số] [căn] TT AVIO"
      /\bnop thay\b/i, /nộp thay/i,
      // Khách chuyển tiền qua sàn để đặt cọc/mua căn
      /khach hang.*chuyen tien.*(dat coc|dat mua|đặt cọc|đặt mua)/i,
    ] },

  // Hoàn tiền YCTV / booking — trả lại tiền tạm ứng
  { category: "hoan_khach", priority: 22, confidence: 92, requireOutflow: true,
    patterns: [
      /hoan tien.*yctv/i, /hoàn tiền.*yctv/i,
      /hoan tien.*du an/i, /hoàn tiền.*dự án/i,
      /trả lại.*đặt cọc/i, /tra lai.*dat coc/i,
      /booking.*hủy/i, /booking.*huy/i,
      /hoan tien.*khach/i, /hoàn.*khách/i,
    ] },

  // ═══ OUTFLOW COGS (Kim BC 2.x) ═══

  // Thuế qua kho bạc — TKNS code cực chuẩn
  { category: "thue_tncn", priority: 25, confidence: 98, requireOutflow: true,
    patterns: [/TKNS:?\s*7111/i, /thuế tncn/i, /thue tncn/i, /nộp thuế tncn/i, /tncn tháng/i, /tncn thang/i, /L Thu Nhap Ca Nhan/i, /Thu Nhap Ca Nhan/i] },

  { category: "thue_tndn", priority: 25, confidence: 98, requireOutflow: true,
    patterns: [/TKNS:?\s*1052/i, /thuế tndn/i, /thue tndn/i, /nộp thuế tndn/i, /tndn quý/i, /tndn quy/i, /Thu Nhap Doanh Nghiep/i] },

  { category: "thue_vat", priority: 25, confidence: 98, requireOutflow: true,
    patterns: [/TKNS:?\s*1701/i, /thuế vat/i, /thuế gtgt/i, /thue gtgt/i, /nộp vat/i, /nop vat/i, /nop gtgt/i, /Gia Tri Gia Tang/i] },

  // Fallback: NTDT KBNN chưa detect được sub-type
  { category: "thue_phi_le_phi", priority: 27, confidence: 75, requireOutflow: true,
    patterns: [/NTDT.*KBNN/i, /Kho bac nha nuoc/i, /kho bạc nhà nước/i] },

  // Marketing — check trước hoa hồng (batdongsan có thể là platform ads)
  { category: "marketing", priority: 30, confidence: 90, requireOutflow: true,
    patterns: [/quảng cáo/i, /quang cao/i, /marketing/i, /batdongsan/i,
      /facebook ads/i, /google ads/i, /tiktok ads/i, /zalo ads/i,
      /PROPERTYGURU/i, /BDSVN/i, /nap tien cho BDS/i,
      /dji/i, /máy ảnh/i, /may anh/i, /tay cầm chống rung/i, /tay cam chong rung/i,
      /in tờ rơi/i, /in to roi/i, /pr event/i, /sự kiện/i, /su kien/i] },

  // Thưởng doanh số (Kim 4.2) — check trước hoa hồng
  { category: "thuong_ds_sale", priority: 35, confidence: 85, requireOutflow: true,
    patterns: [/thưởng doanh số/i, /thuong doanh so/i, /thưởng ds ctv/i, /thuong ds ctv/i,
      /thưởng ds sale/i, /thuong ds sale/i] },

  // Thưởng CEO — trước thưởng chung
  { category: "cty_thuong_ceo", priority: 38, confidence: 90, requireOutflow: true,
    patterns: [/thưởng ceo/i, /thuong ceo/i, /thưởng giám đốc/i, /thuong giam doc/i, /kpi ceo/i] },

  // Thưởng Admin
  { category: "cty_thuong_admin", priority: 38, confidence: 85, requireOutflow: true,
    patterns: [/thưởng hành chính/i, /thuong hanh chinh/i, /thưởng admin/i, /kpi admin/i] },

  // Thưởng TPKD (KPI TPKD)
  { category: "cty_thuong_tpkd", priority: 38, confidence: 85, requireOutflow: true,
    patterns: [/thưởng tpkd/i, /thuong tpkd/i, /kpi tpkd/i, /thưởng trưởng phòng/i, /thuong truong phong/i,
      /trích trước thưởng kpi/i, /trich truoc thuong kpi/i, /thưởng kpi/i, /thuong kpi/i] },

  // Cty thưởng QL sàn (nóng)
  { category: "cty_thuong_ql", priority: 40, confidence: 85, requireOutflow: true,
    patterns: [/thưởng nóng/i, /thuong nong/i,
      /thưởng ql sàn/i, /thuong ql san/i, /thưởng quản lý sàn/i, /thuong quan ly san/i] },

  // Hỗ trợ khách
  { category: "ho_tro_khach", priority: 45, confidence: 90, requireOutflow: true,
    patterns: [/hỗ trợ khách/i, /ho tro khach/i, /hỗ trợ ctv/i, /ho tro ctv/i,
      /chiết khấu khách/i, /chiet khau khach/i, /hỗ trợ mua/i, /ho tro mua/i,
      /hỗ trợ can/i, /ho tro can/i] },

  // HH sale — sau các thưởng specific ở trên
  { category: "hh_sale", priority: 50, confidence: 80, requireOutflow: true,
    patterns: [/hoa hồng/i, /hoa hong/i, /\bhh\b/i, /commission/i,
      /trích trước.*hoa hong/i, /trich truoc.*hoa hong/i] },

  // ═══ OUTFLOW OPEX (Kim BC 4.x) ═══

  // Lương QL/Admin — check trước lương chung
  { category: "luong_admin", priority: 55, confidence: 85, requireOutflow: true,
    patterns: [/lương.*admin/i, /luong.*admin/i, /lương.*kế toán/i, /luong.*ke toan/i,
      /lương.*hành chính/i, /luong.*hanh chinh/i, /lương ql/i, /luong ql/i,
      /lương quản lý/i, /luong quan ly/i, /lương tpkd/i, /luong tpkd/i,
      /lương ceo/i, /luong ceo/i, /lương giám đốc/i, /luong giam doc/i] },

  // Lương NVKD (fallback lương) — bao gồm lương + phụ cấp + thưởng + thu nhập khác + BHXH
  { category: "luong_nvkd", priority: 58, confidence: 75, requireOutflow: true,
    patterns: [/lương t\d/i, /luong t\d/i, /lương tháng/i, /luong thang/i,
      /trả lương/i, /tra luong/i, /lương nv/i, /luong nv/i,
      /lương nvkd/i, /luong nvkd/i,
      /LUONG.*PHU CAP/i, /LUONG.*THUONG T\d/i,
      /THU NHAP KHAC T\d/i, /Thu nhap khac T\d/i,
      /BHXH/i, /bảo hiểm xã hội/i,
      /Thuong T\d/i, /Thưởng T\d/i,
      /phụ cấp/i, /phu cap/i] },

  // Thù lao CTV → HH sale
  { category: "hh_sale", priority: 48, confidence: 90, requireOutflow: true,
    patterns: [/thu lao ctv/i, /thù lao ctv/i, /thu lao cong tac vien/i, /pay ctv/i] },

  // Thuê VP + điện nước
  { category: "thue_vp", priority: 60, confidence: 90, requireOutflow: true,
    patterns: [/thuê văn phòng/i, /thue van phong/i, /thuê vp/i, /thue vp/i,
      /tiền điện/i, /tien dien/i, /tiền nước/i, /tien nuoc/i, /internet/i, /wifi/i,
      /phí quản lý.*tòa/i, /phi quan ly.*toa/i] },

  // Đồ dùng VP + thiết bị
  { category: "do_dung_vp", priority: 65, confidence: 80, requireOutflow: true,
    patterns: [/đồ dùng vp/i, /do dung vp/i, /văn phòng phẩm/i, /van phong pham/i,
      /máy in/i, /may in/i, /máy tính/i, /may tinh/i, /laptop/i,
      /bàn ghế/i, /ban ghe/i, /thiết bị vp/i, /thiet bi vp/i] },

  // Tiếp khách
  { category: "tiep_khach", priority: 68, confidence: 90, requireOutflow: true,
    patterns: [/tiếp khách/i, /tiep khach/i, /ăn uống công tác/i, /an uong cong tac/i] },

  // Đi lại
  { category: "di_lai", priority: 70, confidence: 85, requireOutflow: true,
    patterns: [/xăng xe/i, /xang xe/i, /đi lại/i, /di lai/i, /công tác/i, /cong tac/i,
      /taxi/i, /grab/i, /vé máy bay/i, /ve may bay/i, /khách sạn/i, /khach san/i] },

  // Dịch vụ ngoài
  { category: "dich_vu_ngoai", priority: 72, confidence: 85, requireOutflow: true,
    patterns: [/kế toán thuê/i, /ke toan thue/i, /luật sư/i, /luat su/i,
      /tư vấn/i, /tu van/i, /dịch vụ pháp lý/i, /dich vu phap ly/i,
      /công chứng/i, /cong chung/i, /tra cứu.*pháp luật/i, /tra cuu.*phap luat/i] },

  // Thuế phí (không TNCN/TNDN/VAT)
  { category: "thue_phi_le_phi", priority: 75, confidence: 85, requireOutflow: true,
    patterns: [/thuế môn bài/i, /thue mon bai/i, /lệ phí/i, /le phi/i, /phí công chứng/i] },

  // Rút vốn
  { category: "rut_von", priority: 80, confidence: 90, requireOutflow: true,
    patterns: [/rút vốn/i, /rut von/i, /chia lợi nhuận/i, /chia loi nhuan/i,
      /triết rút/i, /triet rut/i, /bách rút/i, /bach rut/i] },

  // Trả nợ gốc
  { category: "tra_no_goc", priority: 82, confidence: 85, requireOutflow: true,
    patterns: [/trả nợ gốc/i, /tra no goc/i, /trả vay/i, /tra vay/i, /gốc vay/i, /goc vay/i] },

  // Hoàn khách
  { category: "hoan_khach", priority: 85, confidence: 90, requireOutflow: true,
    patterns: [/hoàn.*khách/i, /hoan.*khach/i, /hoàn cọc/i, /hoan coc/i,
      /trả lại đặt cọc/i, /tra lai dat coc/i, /booking.*hủy/i, /booking.*huy/i] },

  // Chuyển nội bộ
  { category: "chuyen_noi_bo", priority: 88, confidence: 80,
    patterns: [/chuyển nội bộ/i, /chuyen noi bo/i, /giữa tài khoản/i, /giua tai khoan/i,
      /Techcombank sang/i, /transfer internal/i] },
];

RULES.sort((a, b) => a.priority - b.priority);

export interface ClassifyInput {
  description: string;
  debitAmount?: number | null;   // Tiền ra khỏi TK cty (outflow)
  creditAmount?: number | null;  // Tiền vào TK cty (inflow)
  partnerName?: string | null;   // Nếu có → giúp phân biệt lương NVKD vs Admin
}

function partnerCategory(partnerName: string | null | undefined): "nvkd" | "admin" | "marketing" | "owner" | null {
  const p = (partnerName ?? "").toUpperCase().trim();
  if (!p) return null;
  if (OWNER_NAMES.has(p)) return "owner";
  if (NVKD_NAMES.has(p)) return "nvkd";
  if (ADMIN_NAMES.has(p)) return "admin";
  if (MARKETING_NAMES.has(p)) return "marketing";
  // Prefix match (VD "NGUYEN MINH TRIET ID: ..." → owner)
  for (const n of OWNER_NAMES) if (p.startsWith(n)) return "owner";
  for (const n of NVKD_NAMES) if (p.startsWith(n)) return "nvkd";
  for (const n of ADMIN_NAMES) if (p.startsWith(n)) return "admin";
  for (const n of MARKETING_NAMES) if (p.startsWith(n)) return "marketing";
  return null;
}

export interface ClassifyResult {
  category: CategoryKey;
  confidence: number;
  matchedPattern?: string;
}

/**
 * Classify NKC row (accounting_journal) — dùng cho P&L dồn tích khớp Kim BC.
 * Khác classify() cho bank: NKC không có partner_name, nhưng có debit_account
 * → TK code là gợi ý mạnh (6411 → luong_nvkd, 6421 → luong_admin...).
 */
export function classifyNkc(input: {
  debitAccount: string;
  creditAccount: string;
  description: string;
  amount: number;
}): ClassifyResult {
  const desc = input.description ?? "";
  const debit = input.debitAccount;
  const credit = input.creditAccount;

  // Rows kết chuyển cuối kỳ (credit=911) → không tính P&L
  if (credit === "911" || debit === "911") {
    return { category: "chuyen_noi_bo", confidence: 100, matchedPattern: "911_ket_chuyen" };
  }

  // ═══ Debit KHÔNG PHẢI expense (balance sheet accounts) → chuyen_noi_bo ═══
  // TT200: 1xx tiền/phải thu/hàng tồn kho, 2xx TSCĐ, 3xx phải trả, 4xx vốn
  // Chỉ classify P&L khi debit là 6xx (chi phí), 5xx (DT), 7xx (thu khác), 8xx
  const debitCode = parseInt(debit) || 0;
  // TT200: TK 100-499 (3 chữ số) hoặc 1000-4999 (4 chữ số) đều là balance sheet
  // 100-199 tiền, 200-299 TSCĐ, 300-399 phải trả, 400-499 vốn
  const isBalanceSheet =
    (debitCode >= 100 && debitCode < 500) ||
    (debitCode >= 1000 && debitCode < 5000);
  const isRevenue = (debitCode >= 500 && debitCode < 600) || (debitCode >= 5000 && debitCode < 6000) || debitCode === 711;
  if (isBalanceSheet) {
    // Debit 3xx = tăng phải trả (VD 3341 khi trích lương) — thực ra phần chi phí đã ghi ở TK 6xxx bên credit
    // Debit 1xx = tăng tiền (VD nhận thanh toán)
    // Đây không phải chi phí P&L, đây là balance sheet movement
    return { category: "chuyen_noi_bo", confidence: 90, matchedPattern: `tk:${debit}_balance_sheet` };
  }
  if (isRevenue) {
    return { category: "dt_hh_so_cap", confidence: 90, matchedPattern: `tk:${debit}_revenue` };
  }

  // ═══ Debit TK cứng — TT200 mapping ═══
  // 6421 = Chi phí nhân viên QLDN (Kim BC 4.3) — LUÔN là lương QL/Admin
  if (debit === "6421") {
    return { category: "luong_admin", confidence: 95, matchedPattern: "tk:6421" };
  }
  // 6423 = Đồ dùng VP (Kim BC 4.5 sub)
  if (debit === "6423") {
    return { category: "do_dung_vp", confidence: 95, matchedPattern: "tk:6423" };
  }
  // 6425 = Thuế phí lệ phí (Kim BC 4.5 sub)
  if (debit === "6425") {
    return { category: "thue_phi_le_phi", confidence: 95, matchedPattern: "tk:6425" };
  }
  // 6427 = Dịch vụ mua ngoài QLDN — Kim BC coi là thuê VP (Kim gộp thuê VP + dịch vụ)
  if (debit === "6427") {
    // Sub-check: nếu có "thuê" → thue_vp, còn không → dich_vu_ngoai
    if (/thuê|thue|internet|điện|dien|nước|nuoc|wifi/i.test(desc)) {
      return { category: "thue_vp", confidence: 90, matchedPattern: "tk:6427+text" };
    }
    return { category: "dich_vu_ngoai", confidence: 85, matchedPattern: "tk:6427" };
  }
  // 811 = Chi phí khác (Kim BC 4.5 sub)
  if (debit === "811") {
    return { category: "opex_khac", confidence: 90, matchedPattern: "tk:811" };
  }
  // 635 = Chi phí tài chính (Kim BC 4.5 sub — lãi vay, chênh lệch tỷ giá)
  if (debit === "635") {
    return { category: "opex_khac", confidence: 90, matchedPattern: "tk:635" };
  }
  // 821 = Chi phí thuế TNDN — không tính P&L trước thuế
  if (debit === "821" || debit === "8211") {
    return { category: "thue_tndn", confidence: 100, matchedPattern: "tk:821" };
  }

  // ═══ 6411 = Chi phí NV bán hàng (bao gồm CTV support) ═══
  // Từ T9/2025 Kim hạch toán vào đây. Kim BC 4.1 = 6411 + rows "hỗ trợ CTV" của 6417.
  if (debit === "6411") {
    return { category: "luong_nvkd", confidence: 95, matchedPattern: "tk:6411" };
  }

  // ═══ 6417 = Chi phí dịch vụ mua ngoài BH — CẦN CLASSIFY PER DESCRIPTION ═══
  // Bucket đa dạng: hoa hồng, hỗ trợ CTV (=lương NVKD trước T9), thưởng, marketing...
  if (debit === "6417") {
    // Hỗ trợ CTV = lương NVKD nghĩa rộng (Kim BC 4.1)
    if (/hỗ trợ ctv|ho tro ctv|hỗ trợ NV|ho tro nv|ho tro.*kt/i.test(desc)) {
      return { category: "luong_nvkd", confidence: 90, matchedPattern: "6417+ho_tro_ctv" };
    }
    // Marketing
    if (/quảng cáo|quang cao|marketing|batdongsan|dji|máy ảnh|may anh|tay cầm chống rung|in tờ rơi|in to roi|propertyguru|bdsvn|sự kiện|su kien/i.test(desc)) {
      return { category: "marketing", confidence: 90, matchedPattern: "6417+marketing" };
    }
    // Thuế TNCN đi kèm chi HH (CT/CTV_Hoa hong)
    if (/thuế tncn|thue tncn/i.test(desc)) {
      return { category: "thue_tncn", confidence: 95, matchedPattern: "6417+tncn" };
    }
    // Tiếp khách
    if (/tiếp khách|tiep khach/i.test(desc)) {
      return { category: "tiep_khach", confidence: 92, matchedPattern: "6417+tiep_khach" };
    }
    // Vận chuyển / đi lại
    if (/vận chuyển|van chuyen/i.test(desc)) {
      return { category: "di_lai", confidence: 85, matchedPattern: "6417+van_chuyen" };
    }
    // Thưởng doanh số CTV (Kim BC 4.2)
    if (/thưởng doanh số|thuong doanh so|thưởng ds ctv|thuong ds ctv/i.test(desc)) {
      return { category: "thuong_ds_sale", confidence: 90, matchedPattern: "6417+thuong_ds" };
    }
    // Thưởng CEO
    if (/thưởng ceo|thuong ceo|thưởng giám đốc|thuong giam doc|kpi ceo/i.test(desc)) {
      return { category: "cty_thuong_ceo", confidence: 92, matchedPattern: "6417+ceo" };
    }
    // Thưởng hành chính (Admin)
    if (/thưởng hành chính|thuong hanh chinh|thưởng admin|kpi admin/i.test(desc)) {
      return { category: "cty_thuong_admin", confidence: 92, matchedPattern: "6417+admin" };
    }
    // Thưởng KPI TPKD
    if (/thưởng kpi|thuong kpi|kpi tpkd|kpi ql/i.test(desc)) {
      return { category: "cty_thuong_tpkd", confidence: 90, matchedPattern: "6417+kpi_tpkd" };
    }
    // Thưởng QL sàn (nóng)
    if (/thưởng nóng|thuong nong|thưởng ql sàn|thuong ql san|thưởng quản lý sàn|thuong quan ly san/i.test(desc)) {
      return { category: "cty_thuong_ql", confidence: 88, matchedPattern: "6417+ql_san" };
    }
    // Hỗ trợ khách mua BĐS (2.2) — chỉ khi có "khách" rõ ràng
    if (/hỗ trợ khách|ho tro khach|chiết khấu khách|chiet khau khach/i.test(desc)) {
      return { category: "ho_tro_khach", confidence: 92, matchedPattern: "6417+ho_tro_khach" };
    }
    // Default 6417: HH sale (Kim BC 2.1) — phần lớn 6417 là hoa hồng bán
    return { category: "hh_sale", confidence: 75, matchedPattern: "6417+default" };
  }

  // Fallback
  return { category: "opex_khac", confidence: 30, matchedPattern: "default" };
}

export function classify(input: ClassifyInput): ClassifyResult {
  const desc = input.description ?? "";
  // Techcombank convention: debit_amount là số âm cho outflow, credit_amount là số dương cho inflow.
  const isOutflow = Math.abs(input.debitAmount ?? 0) > 0;
  const isInflow = Math.abs(input.creditAmount ?? 0) > 0;
  const partnerCat = partnerCategory(input.partnerName);

  // FAST PATH: partner_name owner → chuyen_noi_bo (nạp/rút vốn) hoặc rut_von
  if (partnerCat === "owner" && isOutflow) {
    return { category: "rut_von", confidence: 92, matchedPattern: "partner:owner" };
  }
  if (partnerCat === "owner" && isInflow) {
    return { category: "chuyen_noi_bo", confidence: 88, matchedPattern: "partner:owner" };
  }

  for (const rule of RULES) {
    if (rule.requireInflow && !isInflow) continue;
    if (rule.requireOutflow && !isOutflow) continue;
    if (rule.requirePartner && rule.requirePartner !== partnerCat) continue;
    for (const pat of rule.patterns) {
      if (pat.test(desc)) {
        return {
          category: rule.category,
          confidence: rule.confidence,
          matchedPattern: pat.source,
        };
      }
    }
  }

  // FALLBACK theo partner_name (khi rules text không match)
  if (isOutflow && partnerCat === "admin") {
    return { category: "luong_admin", confidence: 70, matchedPattern: "partner:admin" };
  }
  if (isOutflow && partnerCat === "marketing") {
    return { category: "luong_admin", confidence: 65, matchedPattern: "partner:marketing" };
  }
  if (isOutflow && partnerCat === "nvkd") {
    // NVKD nhận tiền → default HH sale (không rõ lương hay HH)
    // Rule text đã catch được "luong t..." → luong_nvkd, còn lại là HH sale
    return { category: "hh_sale", confidence: 60, matchedPattern: "partner:nvkd" };
  }

  if (isInflow) return { category: "khac_thu", confidence: 30 };
  if (isOutflow) return { category: "opex_khac", confidence: 20 };
  return { category: "chua_phan_loai", confidence: 0 };
}
