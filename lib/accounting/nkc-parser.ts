/**
 * Đọc sheet NKC (sổ nhật ký chung) của kế toán.
 *
 * Trước đây script nạp ghi cứng số thứ tự cột. Kế toán đổi mẫu file là hỏng
 * ngay mà không báo lỗi: file "BC Bre Q1+2.2026.xlsx" thêm cột "Ngày ghi sổ"
 * ở đầu và bỏ cột "Seri", làm mọi cột lệch đi, bộ đọc cũ nhận 0 trên 950
 * dòng và vẫn chạy xong êm ru.
 *
 * Nên giờ dò cột theo TÊN tiêu đề. Tiêu đề nằm trên hai dòng và có ô gộp,
 * ví dụ "Chứng từ" phủ ba cột Loại / Số / Ngày, nên phải kéo giá trị dòng
 * trên sang ngang trước khi ghép với dòng dưới.
 *
 * Hai mẫu đã gặp:
 *   SO SACH BRE 2025   B Loại · C Số · D Ngày · E Seri · F Số · G Ngày · H Diễn giải · I Nợ · J Có · K Thành tiền
 *   BC Bre Q1+2.2026   A Ngày ghi sổ · B Loại · C Số · D Số · E Ngày · F Diễn giải · G Nợ · H Có · I Thành tiền
 */

export type DongNKC = {
  entryDate: string;
  docType: string;
  docNumber: string;
  invoiceSeri: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  sourceRow: number;
};

type Truong =
  | "entryDate"
  | "docType"
  | "docNumber"
  | "invoiceSeri"
  | "invoiceNumber"
  | "invoiceDate"
  | "description"
  | "debitAccount"
  | "creditAccount"
  | "amount";

const chuan = (v: unknown): string =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Excel lưu ngày dạng số. Năm 1900 bị Excel tính dư một ngày nhuận nên trừ 2. */
export function ngayExcel(serial: unknown): string | null {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1) return null;
  const d = new Date(Date.UTC(1900, 0, 1) + (Math.floor(n) - 2) * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Gán một cột vào trường nghiệp vụ, dựa trên tiêu đề trên và tiêu đề dưới. */
function nhanDien(tren: string, duoi: string): Truong | null {
  const ca = `${tren} ${duoi}`.trim();

  if (ca.includes("ngày ghi sổ")) return "entryDate";
  if (ca.includes("diễn giải")) return "description";
  if (ca.includes("thành tiền")) return "amount";

  if (tren.includes("chứng từ")) {
    if (duoi.includes("loại")) return "docType";
    if (duoi.includes("số")) return "docNumber";
    // Mẫu cũ để ngày ghi sổ nằm dưới nhóm "Chứng từ".
    if (duoi.includes("ngày")) return "entryDate";
  }
  if (tren.includes("hóa đơn")) {
    if (duoi.includes("seri")) return "invoiceSeri";
    if (duoi.includes("số")) return "invoiceNumber";
    if (duoi.includes("ngày")) return "invoiceDate";
  }
  if (tren.includes("tài khoản")) {
    if (duoi.includes("nợ")) return "debitAccount";
    if (duoi.includes("có")) return "creditAccount";
  }
  return null;
}

export type BanDoCot = Partial<Record<Truong, number>> & { dongDauDuLieu: number };

/**
 * Dò vị trí từng cột. Ném lỗi nếu thiếu cột bắt buộc, để script nạp dừng hẳn
 * thay vì nạp thiếu rồi báo thành công.
 */
export function doBanDoCot(raw: unknown[][]): BanDoCot {
  // Dòng tiêu đề trên là dòng đầu tiên có cả "chứng từ" và "diễn giải".
  let iTren = -1;
  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const hang = (raw[i] ?? []).map(chuan);
    if (hang.some((c) => c.includes("chứng từ")) && hang.some((c) => c.includes("diễn giải"))) {
      iTren = i;
      break;
    }
  }
  if (iTren < 0) throw new Error("Không tìm thấy dòng tiêu đề trong sheet NKC.");

  const hangTren = (raw[iTren] ?? []).map(chuan);
  const hangDuoi = (raw[iTren + 1] ?? []).map(chuan);

  // Ô gộp chỉ giữ chữ ở cột đầu, kéo sang ngang cho các cột còn lại của nhóm.
  const soCot = Math.max(hangTren.length, hangDuoi.length);
  const tren: string[] = [];
  let dangGiu = "";
  for (let j = 0; j < soCot; j++) {
    if (hangTren[j]) dangGiu = hangTren[j];
    tren[j] = dangGiu;
  }

  const bando: BanDoCot = { dongDauDuLieu: iTren + 2 };
  for (let j = 0; j < soCot; j++) {
    const t = nhanDien(tren[j] ?? "", hangDuoi[j] ?? "");
    // Cột đầu tiên khớp thì giữ, không để cột sau đè lên.
    if (t && bando[t] === undefined) bando[t] = j;
  }

  const batBuoc: Truong[] = [
    "entryDate",
    "description",
    "debitAccount",
    "creditAccount",
    "amount",
  ];
  const thieu = batBuoc.filter((t) => bando[t] === undefined);
  if (thieu.length > 0) {
    throw new Error(
      `Sheet NKC thiếu cột bắt buộc: ${thieu.join(", ")}. Kế toán có thể đã đổi mẫu file.`,
    );
  }
  return bando;
}

/** Đọc toàn bộ dòng hợp lệ của sheet NKC. */
export function docNKC(raw: unknown[][]): { dong: DongNKC[]; bando: BanDoCot; boQua: number } {
  const bando = doBanDoCot(raw);
  const lay = (r: unknown[], t: Truong): unknown =>
    bando[t] === undefined ? "" : r[bando[t]!];

  const dong: DongNKC[] = [];
  let boQua = 0;
  for (let i = bando.dongDauDuLieu; i < raw.length; i++) {
    const r = (raw[i] ?? []) as unknown[];
    const docType = String(lay(r, "docType") ?? "").trim();
    const docNumber = String(lay(r, "docNumber") ?? "").trim();
    const entryDate = ngayExcel(lay(r, "entryDate"));
    const debit = String(lay(r, "debitAccount") ?? "").trim();
    const credit = String(lay(r, "creditAccount") ?? "").trim();
    const amount = Number(lay(r, "amount"));

    // Dòng trống hoàn toàn: bỏ im lặng, không tính là bỏ sót.
    if (!docType && !docNumber && !entryDate && !debit && !credit) continue;

    if (!entryDate || !debit || !credit || !Number.isFinite(amount) || amount === 0) {
      boQua++;
      continue;
    }

    dong.push({
      entryDate,
      docType,
      docNumber,
      invoiceSeri: String(lay(r, "invoiceSeri") ?? "").trim() || null,
      invoiceNumber: String(lay(r, "invoiceNumber") ?? "").trim() || null,
      invoiceDate: ngayExcel(lay(r, "invoiceDate")),
      description: String(lay(r, "description") ?? "").trim(),
      debitAccount: debit,
      creditAccount: credit,
      amount,
      sourceRow: i,
    });
  }
  return { dong, bando, boQua };
}
