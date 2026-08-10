/**
 * Sinh 10 file Excel template cho BRE — tách theo chức năng, giao NV khác nhau điền.
 * Toàn Việt hóa. Đầu ra: data-excel/BRE - Template thu thap du lieu/
 *
 * Usage: cd BRE/App/CRM && npx tsx scripts/gen-data-collection-template.ts
 */
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

const OUT_DIR = path.resolve("data-excel/BRE - Template thu thap du lieu");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ============ HELPERS ============
type Col = { key: string; label: string; width?: number; note?: string };

function makeSheet(wb: ExcelJS.Workbook, name: string, tabColor: string, cols: Col[]) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: tabColor } } });
  ws.columns = cols.map(c => ({ header: c.label, key: c.key, width: c.width ?? 18 }));
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 32;
  cols.forEach((c, i) => {
    if (c.note) row.getCell(i + 1).note = c.note;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

function addDropdown(ws: ExcelJS.Worksheet, colLetter: string, values: string[]) {
  // @ts-expect-error - exceljs types missing dataValidations at runtime it works
  ws.dataValidations.add(`${colLetter}2:${colLetter}500`, {
    type: "list",
    allowBlank: true,
    formulae: [`"${values.join(",")}"`],
    showErrorMessage: true,
    errorTitle: "Giá trị không hợp lệ",
    error: `Chọn 1 trong: ${values.join(", ")}`,
  });
}

function addSampleRow(ws: ExcelJS.Worksheet, sample: any[]) {
  const row = ws.addRow(sample);
  row.font = { italic: true, color: { argb: "FF808080" } };
  row.getCell(1).note = "Dòng ví dụ — xóa hoặc sửa khi điền thật";
}

async function saveFile(wb: ExcelJS.Workbook, filename: string) {
  const filepath = path.join(OUT_DIR, filename);
  await wb.xlsx.writeFile(filepath);
  console.log(`✅ ${filename}`);
}

// ═══════════════════════════════════════════════════════════
// 00. HƯỚNG DẪN CHUNG
// ═══════════════════════════════════════════════════════════
async function genGuide() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BRE";
  const ws = wb.addWorksheet("Hướng dẫn", { properties: { tabColor: { argb: "FFFFC000" } } });
  ws.columns = [{ width: 6 }, { width: 42 }, { width: 30 }, { width: 45 }];

  ws.mergeCells("B2:D2");
  ws.getCell("B2").value = "BRE — BỘ TEMPLATE THU THẬP DỮ LIỆU";
  ws.getCell("B2").font = { size: 20, bold: true, color: { argb: "FF1F4E78" } };
  ws.getCell("B2").alignment = { horizontal: "center" };

  ws.getCell("B4").value = "Ngày ban hành:";
  ws.getCell("B4").font = { bold: true };
  ws.getCell("C4").value = "09/08/2026";

  ws.getCell("B5").value = "Người ban hành:";
  ws.getCell("B5").font = { bold: true };
  ws.getCell("C5").value = "Chủ tịch BRE";

  ws.mergeCells("B7:D7");
  ws.getCell("B7").value = "MỤC ĐÍCH";
  ws.getCell("B7").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  ws.getCell("B7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  ws.getCell("B7").alignment = { horizontal: "center" };
  ws.mergeCells("B8:D8");
  ws.getCell("B8").value = "Chuẩn hóa dữ liệu thu thập khi bán hàng + làm việc với chủ đầu tư + sàn đối tác. Sau khi đủ 1 chu kỳ, sẽ import vào CRM BRE để dùng cho các báo cáo quản trị (Lãi/lỗ, Dòng tiền, Bán hàng, Hoa hồng, Lãi/lỗ theo dự án...).";
  ws.getCell("B8").alignment = { wrapText: true, vertical: "top" };
  ws.getRow(8).height = 45;

  ws.mergeCells("B10:D10");
  ws.getCell("B10").value = "PHÂN CÔNG ĐIỀN FILE";
  ws.getCell("B10").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  ws.getCell("B10").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  ws.getCell("B10").alignment = { horizontal: "center" };

  ws.getRow(11).values = ["", "File", "Người điền", "Khi nào — Tần suất"];
  ws.getRow(11).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(11).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };
  ws.getRow(11).alignment = { horizontal: "center", vertical: "middle" };

  const rows = [
    ["01 - Khách hàng tiềm năng.xlsx", "NV bán + TPKD", "Mỗi khi tiếp cận khách MỚI (dù chưa chốt). Cập nhật hàng ngày."],
    ["02 - Kho căn từ chủ đầu tư.xlsx", "Admin",         "Import bảng giá CĐT khi mở bán dự án mới. Update trạng thái căn hàng tuần."],
    ["03 - Chủ đầu tư.xlsx",           "Admin",         "Khi ký hợp đồng đại lý mới. Update contact/chính sách khi có thay đổi."],
    ["04 - Dự án.xlsx",                "Admin",         "Khi ký hợp đồng phân phối dự án. Update khi CĐT thay tiện ích/giá."],
    ["05 - Điều khoản hoa hồng.xlsx",  "Admin",         "Khi ký/gia hạn hợp đồng đại lý với CĐT. 1 dòng / hợp đồng."],
    ["06 - Sàn đối tác.xlsx",          "Admin",         "Khi bắt đầu hợp tác với sàn khác. Update rating sau mỗi deal."],
  ];
  rows.forEach((r, i) => {
    const row = ws.getRow(12 + i);
    row.getCell(2).value = r[0];
    row.getCell(2).font = { bold: true, color: { argb: "FF1F4E78" } };
    row.getCell(3).value = r[1];
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(4).value = r[2];
    row.getCell(4).alignment = { wrapText: true };
    row.height = 32;
    ["B", "C", "D"].forEach(col => {
      row.getCell(col).border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    });
  });

  const rulesStartRow = 12 + rows.length + 2;
  ws.mergeCells(`B${rulesStartRow}:D${rulesStartRow}`);
  ws.getCell(`B${rulesStartRow}`).value = "GHI CHÚ QUAN TRỌNG";
  ws.getCell(`B${rulesStartRow}`).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  ws.getCell(`B${rulesStartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } };
  ws.getCell(`B${rulesStartRow}`).alignment = { horizontal: "center" };

  const rules = [
    "1. Giao dịch chốt + Cộng tác viên đã được quản lý trong hệ thống BAO CAO DOANH THU (BCDT) — không cần file Excel riêng.",
    "2. Điền TRUNG THỰC — không bịa số. Nếu không biết → để trống, ĐỪNG đoán.",
    "3. Field có dấu (*) là BẮT BUỘC — không được để trống.",
    "4. Cột có dropdown — chỉ chọn giá trị có sẵn, không tự gõ.",
    "5. Không xóa cột / thêm cột. Nếu cần field mới → báo Chủ tịch trước.",
    "6. Số tiền: đơn vị VND, KHÔNG dấu chấm/phẩy (VD điền 5000000, không phải 5,000,000).",
    "7. Ngày tháng: định dạng dd/mm/yyyy.",
    "8. Cuối mỗi tháng: save file + upload lên thư mục chung Drive/Zalo.",
    "9. Không share file cho người ngoài công ty. Dữ liệu KHÁCH HÀNG thuộc bí mật kinh doanh.",
  ];
  rules.forEach((r, i) => {
    const rowNum = rulesStartRow + 1 + i;
    ws.mergeCells(`B${rowNum}:D${rowNum}`);
    ws.getCell(`B${rowNum}`).value = r;
    ws.getCell(`B${rowNum}`).alignment = { wrapText: true };
    ws.getRow(rowNum).height = 20;
  });

  await saveFile(wb, "00 - Hướng dẫn chung.xlsx");
}

// ═══════════════════════════════════════════════════════════
// 01. KHÁCH HÀNG TIỀM NĂNG (chưa chốt)
// ═══════════════════════════════════════════════════════════
async function genKhachTiemNang() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Khách hàng tiềm năng", "FF00B050", [
    { key: "id",         label: "Mã KH (*)",             width: 14, note: "Định dạng: KH-YYYYMM-XXX (VD KH-202608-001)" },
    { key: "date",       label: "Ngày tiếp cận (*)",     width: 12 },
    { key: "name",       label: "Họ tên (*)",            width: 22 },
    { key: "gender",     label: "Giới tính",             width: 10 },
    { key: "birthYear",  label: "Năm sinh",              width: 10 },
    { key: "job",        label: "Nghề nghiệp",           width: 22 },
    { key: "income",     label: "Thu nhập/tháng (VND)",  width: 15 },
    { key: "phone",      label: "SĐT (*)",               width: 15 },
    { key: "zalo",       label: "Zalo",                  width: 15 },
    { key: "email",      label: "Email",                 width: 22 },
    { key: "address",    label: "Địa chỉ hiện tại",      width: 30 },
    { key: "province",   label: "Tỉnh/Thành",            width: 15 },
    { key: "hometown",   label: "Quê quán",              width: 20 },
    { key: "marital",    label: "Tình trạng gia đình",   width: 15 },
    { key: "children",   label: "Số con",                width: 8 },
    { key: "purpose",    label: "Mục đích mua (*)",      width: 12, note: "Để ở / Đầu tư / Cho thuê" },
    { key: "budget",     label: "Ngân sách (VND)",       width: 15 },
    { key: "payment",    label: "Phương thức thanh toán",width: 20 },
    { key: "bedrooms",   label: "Số phòng ngủ mong muốn",width: 12 },
    { key: "area",       label: "Khu vực quan tâm",      width: 20 },
    { key: "priceRange", label: "Tầm giá /m²",           width: 15 },
    { key: "priority",   label: "Ưu tiên (view/hướng/tầng)", width: 30 },
    { key: "source",     label: "Nguồn khách (*)",       width: 15 },
    { key: "assignee",   label: "NV phụ trách (*)",      width: 22 },
    { key: "contacts",   label: "Số lần contact",        width: 10 },
    { key: "visits",     label: "Số lần đi xem dự án",   width: 12 },
    { key: "stage",      label: "Trạng thái (*)",        width: 15 },
    { key: "objection",  label: "Vấn đề khách phân vân", width: 30 },
    { key: "nextAction", label: "Việc cần làm tiếp",     width: 30 },
    { key: "note",       label: "Ghi chú",               width: 30 },
  ]);
  addDropdown(ws, "D", ["Nam", "Nữ", "Khác"]);
  addDropdown(ws, "N", ["Độc thân", "Đã kết hôn", "Ly hôn", "Góa"]);
  addDropdown(ws, "P", ["Để ở", "Đầu tư", "Cho thuê"]);
  addDropdown(ws, "R", ["Tiền mặt 100%", "Vay ngân hàng", "Trả góp CĐT", "Kết hợp"]);
  addDropdown(ws, "W", ["Facebook", "Zalo", "Google", "Giới thiệu", "Đến trực tiếp", "Điện thoại", "Sàn đối tác", "Khác"]);
  addDropdown(ws, "AA", ["Mới tiếp cận", "Đang tư vấn", "Đã đi xem căn", "Đang cân nhắc", "Sắp chốt", "Đã chuyển sang file Giao dịch chốt", "Không chốt"]);
  addSampleRow(ws, [
    "KH-202608-001", new Date("2026-08-01"), "Nguyễn Văn A", "Nam", 1985, "Kỹ sư CNTT",
    35000000, "0901234567", "0901234567", "a@example.com", "Q7 TPHCM", "TPHCM", "Hà Nội",
    "Đã kết hôn", 2, "Để ở", 3500000000, "Vay ngân hàng", 2, "Q2, Q7", "60-80tr/m²",
    "View sông, hướng ĐN, tầng 15-25", "Giới thiệu", "Trần Minh Nhật", 5, 2,
    "Đang tư vấn", "Giá cao hơn dự tính 10%", "Gửi báo giá 3 căn tương tự",
    "Cần hỗ trợ hồ sơ vay Vietcombank"
  ]);
  await saveFile(wb, "01 - Khách hàng tiềm năng.xlsx");
}

/* eslint-disable */
/* prettier-ignore */
// ═══════════════════════════════════════════════════════════
// [BỎ] GIAO DỊCH CHỐT — đã có trong BAO CAO DOANH THU (BCDT)
// ═══════════════════════════════════════════════════════════
async function genGiaoDichChot_UNUSED() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Giao dịch chốt", "FF00B050", [
    { key: "id",            label: "Mã giao dịch (*)",     width: 15, note: "Định dạng: GD-YYYYMM-XXX" },
    { key: "customerId",    label: "Mã KH (*)",            width: 14, note: "Từ file 01 - Khách hàng tiềm năng" },
    { key: "customerName",  label: "Tên khách (*)",        width: 22 },
    { key: "customerPhone", label: "SĐT khách",            width: 15 },
    { key: "customerCccd",  label: "CCCD khách",           width: 15 },
    { key: "unitCode",      label: "Mã căn (*)",           width: 18, note: "Từ file 03 - Kho căn từ CĐT" },
    { key: "project",       label: "Dự án (*)",            width: 22 },
    { key: "partner",       label: "Chủ đầu tư",           width: 20 },
    { key: "unitDetail",    label: "Tòa - Tầng - Loại căn",width: 20 },
    { key: "areaNet",       label: "DT thông thủy (m²)",   width: 12 },
    { key: "bookingDate",   label: "Ngày đặt cọc (*)",     width: 12 },
    { key: "contractDate",  label: "Ngày ký HĐMB",         width: 12 },
    { key: "handoverDate",  label: "Ngày dự kiến bàn giao",width: 14 },
    { key: "priceOriginal", label: "Giá gốc CĐT (VND)",    width: 15 },
    { key: "priceSold",     label: "Giá bán thực (VND) (*)",width: 15 },
    { key: "discount",      label: "Chiết khấu (VND)",     width: 12 },
    { key: "promotion",     label: "Khuyến mãi kèm theo",  width: 25 },
    { key: "phase",         label: "Đợt thanh toán hiện tại", width: 15, note: "VD: 1/5 hoặc 2/5" },
    { key: "amountPaid",    label: "Đã đóng (VND)",        width: 15 },
    { key: "paymentMethod", label: "Phương thức thanh toán",width: 18 },
    { key: "channel",       label: "Kênh bán (*)",         width: 15 },
    { key: "salesPerson",   label: "NV bán chính (*)",     width: 22 },
    { key: "tpkd",          label: "TPKD dẫn dắt",         width: 22 },
    { key: "dept",          label: "Phòng",                width: 12 },
    { key: "status",        label: "Trạng thái (*)",       width: 15 },
    { key: "note",          label: "Ghi chú",              width: 30 },
  ]);
  addDropdown(ws, "T", ["Tiền mặt 100%", "Vay ngân hàng", "Trả góp CĐT", "Kết hợp"]);
  addDropdown(ws, "U", ["BRE nội bộ", "CTV cá nhân", "Sàn đối tác"]);
  addDropdown(ws, "Y", ["Đã đặt cọc", "Đã ký HĐMB", "Đang đóng đợt", "Hoàn tất bàn giao", "Khách hủy"]);
  addSampleRow(ws, [
    "GD-202608-001", "KH-202608-001", "Nguyễn Văn A", "0901234567", "079123456789",
    "AVIO_BAML_B.28.18", "TT AVIO", "BAMLAND", "B - Tầng 28 - Căn hộ", 68.5,
    new Date("2026-08-05"), new Date("2026-08-20"), new Date("2027-06-30"),
    3600000000, 3480000000, 120000000, "Chiết khấu 3% thanh toán sớm",
    "1/5", 350000000, "Vay ngân hàng", "BRE nội bộ",
    "Trần Minh Nhật", "Đoàn Lê Bách", "Hồ Gia", "Đã ký HĐMB", "Khách sẽ đóng đợt 2 sau 30 ngày"
  ]);
  await saveFile(wb, "02 - Giao dịch chốt.xlsx");
}

// ═══════════════════════════════════════════════════════════
// 03. KHO CĂN TỪ CHỦ ĐẦU TƯ
// ═══════════════════════════════════════════════════════════
async function genKhoCan() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Kho căn từ CĐT", "FF0070C0", [
    { key: "code",       label: "Mã căn duy nhất (*)",  width: 22, note: "Định dạng: DUAN_CDT_MACAN (VD AVIO_BAML_B.28.18)" },
    { key: "unitCode",   label: "Số căn (*)",           width: 12 },
    { key: "project",    label: "Dự án (*)",            width: 25 },
    { key: "partner",    label: "Chủ đầu tư",           width: 20 },
    { key: "block",      label: "Tòa/Block",            width: 10 },
    { key: "floor",      label: "Tầng",                 width: 8 },
    { key: "view",       label: "View (nhìn ra)",       width: 15 },
    { key: "direction",  label: "Hướng ban công",       width: 12 },
    { key: "areaNet",    label: "DT thông thủy (m²)",   width: 14 },
    { key: "areaGross",  label: "DT tim tường (m²)",    width: 14 },
    { key: "bedrooms",   label: "Số phòng ngủ",         width: 8 },
    { key: "bathrooms",  label: "Số toilet",            width: 8 },
    { key: "balcony",    label: "Số ban công",          width: 10 },
    { key: "type",       label: "Loại căn (*)",         width: 14 },
    { key: "furniture",  label: "Nội thất",             width: 15 },
    { key: "priceGross", label: "Giá gốc CĐT (VND)",    width: 15 },
    { key: "priceNet",   label: "Giá bán cho khách (VND)",width: 15 },
    { key: "status",     label: "Trạng thái (*)",       width: 15 },
    { key: "openSale",   label: "Ngày mở bán",          width: 12 },
    { key: "handover",   label: "Ngày bàn giao dự kiến",width: 14 },
    { key: "note",       label: "Ghi chú",              width: 25 },
  ]);
  addDropdown(ws, "N", ["Căn hộ", "Duplex", "Penthouse", "Shophouse", "TMDV", "Officetel"]);
  addDropdown(ws, "O", ["Không nội thất", "Nội thất cơ bản", "Full nội thất", "Bàn giao thô"]);
  addDropdown(ws, "R", ["Còn hàng", "Đang giữ chỗ", "Đã đặt cọc", "Đã bán", "Đã chuyển pool"]);
  addSampleRow(ws, [
    "AVIO_BAML_B.28.18", "B.28.18", "TT AVIO", "BAMLAND", "B", 28, "Nhìn sông", "Đông Nam",
    68.5, 75.2, 2, 2, 1, "Căn hộ", "Nội thất cơ bản",
    3600000000, 3480000000, "Còn hàng", new Date("2025-05-01"), new Date("2027-06-30"), ""
  ]);
  await saveFile(wb, "02 - Kho căn từ chủ đầu tư.xlsx");
}

// ═══════════════════════════════════════════════════════════
// 04. CHỦ ĐẦU TƯ
// ═══════════════════════════════════════════════════════════
async function genCDT() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Chủ đầu tư", "FF0070C0", [
    { key: "code",           label: "Mã CĐT (*)",             width: 12 },
    { key: "name",           label: "Tên pháp lý (*)",        width: 32 },
    { key: "brandName",      label: "Tên thương hiệu",        width: 20 },
    { key: "mst",            label: "Mã số thuế (*)",         width: 15 },
    { key: "yearFounded",    label: "Năm thành lập",          width: 10 },
    { key: "capital",        label: "Vốn điều lệ (VND)",      width: 15 },
    { key: "hqAddress",      label: "Địa chỉ trụ sở",         width: 40 },
    { key: "representative", label: "Người đại diện pháp luật",width: 22 },
    { key: "position",       label: "Chức vụ",                width: 18 },
    { key: "repPhone",       label: "SĐT đại diện",           width: 15 },
    { key: "repEmail",       label: "Email đại diện",         width: 25 },
    { key: "breContact",     label: "Người phụ trách BRE (*)",width: 22 },
    { key: "breContactPhone",label: "SĐT liên hệ BRE",        width: 15 },
    { key: "breContactEmail",label: "Email liên hệ BRE",      width: 25 },
    { key: "portfolioCount", label: "Số dự án đã triển khai", width: 12 },
    { key: "portfolioList",  label: "Dự án tiêu biểu",        width: 40 },
    { key: "trustRating",    label: "Đánh giá uy tín (*)",    width: 15 },
    { key: "bankPartner",    label: "Ngân hàng liên kết vay", width: 25 },
    { key: "paymentPolicy",  label: "Chính sách thanh toán khách", width: 35 },
    { key: "startDate",      label: "Ngày bắt đầu hợp tác",   width: 14 },
    { key: "note",           label: "Ghi chú",                width: 30 },
  ]);
  addDropdown(ws, "Q", ["1 sao (kém)", "2 sao", "3 sao (trung bình)", "4 sao (tốt)", "5 sao (rất tốt)"]);
  addSampleRow(ws, [
    "CDT-001", "CÔNG TY CỔ PHẦN BAM LAND", "BamLand", "0123456789", 2015, 500000000000,
    "123 Nguyễn Huệ, Q1, TPHCM", "Nguyễn Văn A", "Tổng Giám Đốc", "0901111111", "a@bamland.vn",
    "Trần Thị B", "0902222222", "b@bamland.vn", 8, "TT AVIO, TT SUNRISE, ...",
    "4 sao (tốt)", "Vietcombank, BIDV", "20% đặt cọc / 30% theo tiến độ / 50% khi nhận nhà",
    new Date("2024-06-01"), "CĐT lớn, thanh toán HH đúng hạn"
  ]);
  await saveFile(wb, "03 - Chủ đầu tư.xlsx");
}

// ═══════════════════════════════════════════════════════════
// 05. DỰ ÁN
// ═══════════════════════════════════════════════════════════
async function genDuAn() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Dự án", "FF0070C0", [
    { key: "code",        label: "Mã dự án (*)",         width: 12 },
    { key: "name",        label: "Tên dự án (*)",        width: 25 },
    { key: "cdtCode",     label: "Mã CĐT (*)",           width: 12, note: "Từ file 04 - Chủ đầu tư" },
    { key: "district",    label: "Quận/Huyện (*)",       width: 15 },
    { key: "ward",        label: "Phường/Xã",            width: 15 },
    { key: "address",     label: "Địa chỉ chi tiết",     width: 40 },
    { key: "lat",         label: "Vĩ độ",                width: 12 },
    { key: "lng",         label: "Kinh độ",              width: 12 },
    { key: "landArea",    label: "DT khu đất (m²)",      width: 14 },
    { key: "density",     label: "Mật độ xây dựng (%)",  width: 12 },
    { key: "towers",      label: "Số tòa",               width: 8 },
    { key: "floors",      label: "Số tầng cao nhất",     width: 12 },
    { key: "totalUnits",  label: "Tổng số căn",          width: 10 },
    { key: "segment",     label: "Phân khúc (*)",        width: 15 },
    { key: "legalStatus", label: "Tình trạng pháp lý (*)",width: 22 },
    { key: "amenities",   label: "Tiện ích chính",       width: 40 },
    { key: "avgPrice",    label: "Giá TB /m² (VND)",     width: 15 },
    { key: "startYear",   label: "Năm khởi công",        width: 10 },
    { key: "finishYear",  label: "Năm dự kiến hoàn thành",width: 12 },
    { key: "competitors", label: "Đối thủ khu vực",      width: 25 },
    { key: "note",        label: "Ghi chú",              width: 25 },
  ]);
  addDropdown(ws, "N", ["Bình dân", "Trung cấp", "Cao cấp", "Hạng sang", "Siêu sang"]);
  addDropdown(ws, "O", ["Sổ đỏ", "Sổ hồng", "Đang xin giấy phép", "Chưa có giấy phép", "Bán trước sổ", "Đủ điều kiện bán"]);
  addSampleRow(ws, [
    "DA-001", "TT AVIO", "CDT-001", "Dĩ An", "Bình Hòa", "Đường Nguyễn Xí, Bình Dương",
    10.9048, 106.7635, 12500, 45, 3, 32, 1200, "Trung cấp", "Đủ điều kiện bán",
    "Hồ bơi, gym, mall, trường mầm non, công viên", 45000000, 2024, 2027,
    "Bcons Green Diamond, Phú Đông Sky Garden", ""
  ]);
  await saveFile(wb, "04 - Dự án.xlsx");
}

// ═══════════════════════════════════════════════════════════
// 06. ĐIỀU KHOẢN HOA HỒNG
// ═══════════════════════════════════════════════════════════
async function genDieuKhoanHH() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Điều khoản HH", "FF7030A0", [
    { key: "contractId",     label: "Mã hợp đồng đại lý (*)",width: 18 },
    { key: "cdtCode",        label: "Mã CĐT (*)",           width: 12 },
    { key: "projectCode",    label: "Mã dự án (*)",         width: 12 },
    { key: "startDate",      label: "Ngày bắt đầu (*)",     width: 12 },
    { key: "endDate",        label: "Ngày kết thúc",        width: 12 },
    { key: "hhSaleBase",     label: "%HH sale cơ bản (*)",  width: 14, note: "HH tính trên giá bán căn" },
    { key: "pmgLkBase",      label: "%PMG_LK công ty (*)",  width: 14, note: "PMG lũy kế công ty nhận" },
    { key: "bonusStructure", label: "Cơ cấu thưởng nóng",   width: 45, note: "VD: 10M/căn nếu bán trong 30 ngày mở bán" },
    { key: "paymentTiming",  label: "Timing thanh toán HH", width: 30, note: "VD: sau 15 ngày làm việc khi khách đủ 30%" },
    { key: "invoiceCondition",label:"Điều kiện xuất HĐ HH", width: 30 },
    { key: "advancePolicy",  label: "Chính sách ứng trước", width: 25 },
    { key: "cancelPolicy",   label: "Chính sách khách hủy", width: 30 },
    { key: "note",           label: "Ghi chú",              width: 30 },
  ]);
  addSampleRow(ws, [
    "HD-BAM-AVIO-2025", "CDT-001", "DA-001", new Date("2025-01-01"), new Date("2026-12-31"),
    "5.25%", "5%", "10M/căn khi bán trong 30 ngày mở bán, 5M nếu chốt trong quý",
    "Sau 15 ngày làm việc từ khi khách đóng ≥30%", "Có HĐ + biên bản đối chiếu",
    "Không ứng trước", "Trừ 100% HH nếu khách hủy trong 60 ngày",
    "Ưu tiên căn view sông"
  ]);
  await saveFile(wb, "05 - Điều khoản hoa hồng.xlsx");
}

// ═══════════════════════════════════════════════════════════
// 07. SÀN ĐỐI TÁC
// ═══════════════════════════════════════════════════════════
async function genSanDoiTac() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Sàn đối tác", "FFE97132", [
    { key: "code",         label: "Mã sàn (*)",           width: 12 },
    { key: "name",         label: "Tên sàn (*)",          width: 30 },
    { key: "mst",          label: "Mã số thuế",           width: 15 },
    { key: "ceo",          label: "CEO / Chủ tịch",       width: 22 },
    { key: "address",      label: "Địa chỉ",              width: 35 },
    { key: "yearFounded",  label: "Năm thành lập",        width: 10 },
    { key: "employees",    label: "Số nhân viên",         width: 10 },
    { key: "contactName",  label: "Người liên hệ chính (*)",width: 20 },
    { key: "contactPhone", label: "SĐT liên hệ",          width: 15 },
    { key: "contactEmail", label: "Email liên hệ",        width: 25 },
    { key: "specialties",  label: "Chuyên phân phối dự án",width: 30 },
    { key: "hhSplit",      label: "%HH chia BRE/họ",      width: 18 },
    { key: "paymentTiming",label: "Timing thanh toán",    width: 22 },
    { key: "penaltyPolicy",label: "Chính sách penalty",   width: 30 },
    { key: "totalDeals",   label: "Số deal đã làm với BRE",width: 14 },
    { key: "trustRating",  label: "Đánh giá uy tín",      width: 15 },
    { key: "startDate",    label: "Ngày bắt đầu hợp tác", width: 14 },
    { key: "note",         label: "Ghi chú",              width: 25 },
  ]);
  addDropdown(ws, "P", ["1 sao (kém)", "2 sao", "3 sao (trung bình)", "4 sao (tốt)", "5 sao (rất tốt)"]);
  addSampleRow(ws, [
    "SAN-001", "CÔNG TY TNHH BẤT ĐỘNG SẢN ABC", "0987654321", "Nguyễn Văn C",
    "45 Lê Lợi, Q1, TPHCM", 2018, 25, "Trần Thị D", "0903333333", "d@abc.vn",
    "Bcons, T&A, Fenica", "50/50 sau khi trừ HH sale cho họ", "T+7 sau khi CĐT trả",
    "Trừ 30% HH nếu khách hủy trong 30 ngày", 12, "4 sao (tốt)", new Date("2024-03-01"),
    "Sàn có traffic online tốt"
  ]);
  await saveFile(wb, "06 - Sàn đối tác.xlsx");
}

// ═══════════════════════════════════════════════════════════
// [BỎ] CỘNG TÁC VIÊN — đã có trong BAO CAO DOANH THU (BCDT)
// ═══════════════════════════════════════════════════════════
async function genCTV_UNUSED() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Cộng tác viên", "FFE97132", [
    { key: "code",       label: "Mã CTV (*)",            width: 12 },
    { key: "name",       label: "Họ tên (*)",            width: 22 },
    { key: "cccd",       label: "CCCD/CMND",             width: 15 },
    { key: "phone",      label: "SĐT (*)",               width: 15 },
    { key: "zalo",       label: "Zalo",                  width: 15 },
    { key: "email",      label: "Email",                 width: 25 },
    { key: "mst",        label: "Mã số thuế cá nhân",    width: 15 },
    { key: "bankAcc",    label: "Số TK ngân hàng (*)",   width: 20 },
    { key: "bankName",   label: "Ngân hàng (*)",         width: 20 },
    { key: "bankBranch", label: "Chi nhánh",             width: 20 },
    { key: "referrer",   label: "Người giới thiệu (NV BRE)", width: 22 },
    { key: "hhAgreed",   label: "%HH thỏa thuận (*)",    width: 15, note: "VD 65% base HH sale" },
    { key: "specialties",label: "Chuyên khu vực/dự án",  width: 25 },
    { key: "totalUnits", label: "Số căn đã bán qua BRE", width: 14 },
    { key: "trustRating",label: "Đánh giá chất lượng KH",width: 15 },
    { key: "startDate",  label: "Ngày tuyển",            width: 12 },
    { key: "note",       label: "Ghi chú",               width: 25 },
  ]);
  addDropdown(ws, "O", ["1 sao (kém)", "2 sao", "3 sao (trung bình)", "4 sao (tốt)", "5 sao (rất tốt)"]);
  addSampleRow(ws, [
    "CTV-001", "Phạm Văn E", "079123456789", "0904444444", "0904444444", "e@gmail.com",
    "8712345678", "0201000123456", "Vietcombank", "CN TPHCM",
    "Trần Minh Nhật", "65%", "Q7, Q2 - Căn hộ cao cấp",
    3, "4 sao (tốt)", new Date("2025-06-15"), "Chuyên khách VIP, close deal chắc"
  ]);
  await saveFile(wb, "08 - Cộng tác viên cá nhân.xlsx");
}

// ═══════════════════════════════════════════════════════════
// [BỎ] PIPELINE — chưa cần theo yêu cầu Chủ tịch
// ═══════════════════════════════════════════════════════════
async function genPipeline_UNUSED() {
  const wb = new ExcelJS.Workbook();
  const ws = makeSheet(wb, "Deal đang chạy", "FFFFC000", [
    { key: "id",            label: "Mã deal (*)",          width: 15 },
    { key: "dateStart",     label: "Ngày tiếp cận (*)",    width: 12 },
    { key: "customerId",    label: "Mã KH (*)",            width: 14, note: "Từ file 01 - Khách hàng tiềm năng" },
    { key: "customerName",  label: "Tên khách",            width: 22 },
    { key: "project",       label: "Dự án (*)",            width: 22 },
    { key: "unitInterest",  label: "Căn khách quan tâm",   width: 20 },
    { key: "budget",        label: "Ngân sách (VND)",      width: 15 },
    { key: "stage",         label: "Giai đoạn (*)",        width: 20 },
    { key: "probability",   label: "% Xác suất chốt (*)",  width: 15 },
    { key: "expectedClose", label: "Ngày dự kiến chốt (*)",width: 14 },
    { key: "owner",         label: "NV chịu trách nhiệm (*)",width: 22 },
    { key: "tpkd",          label: "TPKD dẫn dắt",         width: 22 },
    { key: "blocker",       label: "Vướng mắc (nếu có)",   width: 30 },
    { key: "nextAction",    label: "Việc cần làm tiếp (*)",width: 35 },
    { key: "nextDate",      label: "Ngày làm việc tiếp",   width: 14 },
    { key: "lastUpdate",    label: "Ngày cập nhật cuối (*)",width: 14 },
    { key: "note",          label: "Ghi chú",              width: 30 },
  ]);
  addDropdown(ws, "H", [
    "1. Mới tiếp cận",
    "2. Đang tư vấn",
    "3. Đã gửi báo giá",
    "4. Đang thương lượng",
    "5. Sắp đặt cọc",
    "6. Đã chốt (Won)",
    "0. Không chốt (Lost)",
  ]);
  addDropdown(ws, "I", ["10%", "25%", "50%", "75%", "90%"]);
  addSampleRow(ws, [
    "PL-202608-001", new Date("2026-08-01"), "KH-202608-001", "Nguyễn Văn A", "TT AVIO", "B.28.18",
    3500000000, "3. Đã gửi báo giá", "50%", new Date("2026-08-25"),
    "Trần Minh Nhật", "Đoàn Lê Bách", "Chờ vợ khách đồng ý",
    "Gửi bảng so sánh 3 căn tương tự + demo tài chính vay",
    new Date("2026-08-11"), new Date("2026-08-09"),
    "Khách rất quan tâm hướng ĐN"
  ]);
  await saveFile(wb, "09 - Danh sách deal đang chạy.xlsx");
}

async function main() {
  console.log(`Output: ${OUT_DIR}\n`);
  await genGuide();
  await genKhachTiemNang();
  await genKhoCan();
  await genCDT();
  await genDuAn();
  await genDieuKhoanHH();
  await genSanDoiTac();
  // BỎ: genGiaoDichChot, genCTV — đã có trong BAO CAO DOANH THU
  // BỎ: genPipeline — chưa cần theo yêu cầu Chủ tịch
  console.log(`\n✅ 7 file (1 hướng dẫn + 6 data) đã tạo trong ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
