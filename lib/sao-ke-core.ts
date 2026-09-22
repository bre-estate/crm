/**
 * Đọc và soát sao kê Techcombank. Hàm thuần, không đụng database, để test được
 * và dùng chung cho cả trang web lẫn lệnh chạy tay.
 *
 * Quy ước của Techcombank rút ra từ dữ liệu thật:
 *   - File xếp dòng MỚI NHẤT TRƯỚC, phải đảo lại thành cũ trước.
 *   - Cột Nợ lưu số ÂM, cột Có lưu số dương.
 *   - Dòng phí ngân hàng để tiền ở cột Phí và Thuế, cột Nợ bằng 0.
 *   - Chuỗi số dư nối liền theo công thức: số dư = số dư trước + nợ + có + phí + thuế.
 *     Kiểm trên 923 mối nối của dữ liệu thật ngày 19/09/2026: chỉ 9 chỗ lệch, nằm
 *     trong 3 cụm cùng ngày và mỗi cụm cộng lại bằng 0, tức sai thứ tự chứ không mất dòng.
 */

/** Cột theo vị trí, giống nhau ở cả bản CSV lẫn bản Excel Techcombank xuất. */
export const COL = {
  requestDate: 0,
  txDate: 1,
  ref: 2,
  partnerBank: 3,
  partnerAccount: 4,
  partnerName: 5,
  description: 6,
  debit: 7,
  credit: 8,
  fee: 9,
  vat: 10,
  balance: 11,
} as const;

export interface DongSaoKe {
  requestDate: string;
  transactionDate: string;
  referenceNumber: string;
  partnerBank: string | null;
  partnerAccount: string | null;
  partnerName: string | null;
  description: string;
  debitAmount: number | null;
  creditAmount: number | null;
  feeInterest: number | null;
  vat: number | null;
  runningBalance: number | null;
}

export interface KetQuaDoc {
  accountNumber: string;
  rows: DongSaoKe[];
}

export function parseNum(s: unknown): number | null {
  if (s === null || s === undefined || String(s).trim() === "") return null;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const laDongTieuDe = (r: string[]) => /^Ng[àa]y KH/i.test(r[0] ?? "");
const laDongDuLieu = (r: string[]) =>
  /^\d{4}-\d{2}-\d{2}/.test(r[COL.txDate] ?? "") && !!(r[COL.ref] ?? "").trim();

/**
 * Bóc dòng giao dịch từ lưới ô đã đọc sẵn (Excel hoặc CSV đều quy về dạng này).
 * Trả về null nếu không tìm thấy dòng tiêu đề, tức không phải sao kê Techcombank.
 */
export function bocDongTuLuoi(grid: unknown[][]): KetQuaDoc | null {
  const g = grid.map((r) => r.map(cell));
  const hi = g.findIndex(laDongTieuDe);
  if (hi < 0) return null;

  const dongSoTk = g.find((r) => r.some((c) => /Account number/i.test(c)));
  const accountNumber = dongSoTk?.map((c) => c.match(/^\d{6,}$/)?.[0]).find(Boolean) ?? "unknown";

  const rows = g
    .slice(hi + 1)
    .filter(laDongDuLieu)
    .reverse() // file xếp mới nhất trước
    .map((r) => ({
      requestDate: r[COL.requestDate],
      transactionDate: r[COL.txDate].slice(0, 10),
      referenceNumber: r[COL.ref],
      partnerBank: r[COL.partnerBank] || null,
      partnerAccount: r[COL.partnerAccount] || null,
      partnerName: r[COL.partnerName] || null,
      description: r[COL.description] ?? "",
      debitAmount: parseNum(r[COL.debit]),
      creditAmount: parseNum(r[COL.credit]),
      feeInterest: parseNum(r[COL.fee]),
      vat: parseNum(r[COL.vat]),
      runningBalance: parseNum(r[COL.balance]),
    }));

  return { accountNumber, rows };
}

/** Khóa nhận dạng một giao dịch. Techcombank dùng lại số bút toán cho lệnh hoàn nên phải kèm số tiền. */
export function khoaDong(d: {
  referenceNumber: string;
  debitAmount: number | null;
  creditAmount: number | null;
}): string {
  return `${d.referenceNumber}|${d.debitAmount ?? 0}|${d.creditAmount ?? 0}`;
}

export interface ChoDut {
  viTri: number; // thứ tự dòng trong file, tính từ 1
  ngay: string;
  dienGiai: string;
  lech: number;
}

export interface SoatChuoi {
  soMoiNoi: number;
  choDut: ChoDut[];
  /** Cụm lệch cùng ngày mà cộng lại bằng 0 thì chỉ sai thứ tự, không mất dòng. */
  chiSaiThuTu: boolean;
  tongLech: number;
}

/**
 * Soát chuỗi số dư để biết có mất dòng nào không.
 * Cụm lệch trong cùng một ngày mà cộng lại bằng 0 nghĩa là ngân hàng xếp thứ tự khác
 * trong ngày, không phải thiếu giao dịch. Lệch mà không bù về 0 mới là mất dòng thật.
 */
export function soatChuoiSoDu(rows: DongSaoKe[], soDuTruoc?: number | null): SoatChuoi {
  const choDut: ChoDut[] = [];
  let truoc = soDuTruoc ?? null;
  let soMoiNoi = 0;

  for (const [i, r] of rows.entries()) {
    if (r.runningBalance == null) {
      truoc = null;
      continue;
    }
    if (truoc != null) {
      soMoiNoi++;
      const tinh =
        truoc + (r.debitAmount ?? 0) + (r.creditAmount ?? 0) + (r.feeInterest ?? 0) + (r.vat ?? 0);
      const lech = r.runningBalance - tinh;
      if (Math.abs(lech) > 1) {
        choDut.push({
          viTri: i + 1,
          ngay: r.transactionDate,
          dienGiai: r.description.slice(0, 60),
          lech,
        });
      }
    }
    truoc = r.runningBalance;
  }

  // Gom theo ngày, ngày nào cộng lại bằng 0 thì chỉ là sai thứ tự.
  const theoNgay = new Map<string, number>();
  for (const c of choDut) theoNgay.set(c.ngay, (theoNgay.get(c.ngay) ?? 0) + c.lech);
  const chiSaiThuTu = choDut.length > 0 && [...theoNgay.values()].every((v) => Math.abs(v) <= 1);

  return {
    soMoiNoi,
    choDut,
    chiSaiThuTu,
    tongLech: choDut.reduce((s, c) => s + c.lech, 0),
  };
}

export interface KetQuaSoat {
  accountNumber: string;
  tongDong: number;
  dongMoi: number;
  dongTrung: number;
  tuNgay: string | null;
  denNgay: string | null;
  soDuDau: number | null;
  soDuCuoi: number | null;
  /** Số dư cuối của phần đã có trong app, để biết file này có nối tiếp được không. */
  noiTiepDuoc: boolean | null;
  chenhNoiTiep: number | null;
  chuoi: SoatChuoi;
}

/**
 * So file vừa đọc với những gì đã có trong app.
 * `khoaDaCo` là tập khóa của mọi giao dịch đang có, `soDuCuoiDaCo` là số dư của dòng
 * cuối cùng đang có (null nếu app chưa có giao dịch nào).
 */
export function soatFile(
  doc: KetQuaDoc,
  khoaDaCo: Set<string>,
  soDuCuoiDaCo: number | null,
  ngayCuoiDaCo: string | null,
): KetQuaSoat {
  const { rows } = doc;
  let dongTrung = 0;
  for (const r of rows) if (khoaDaCo.has(khoaDong(r))) dongTrung++;

  const tuNgay = rows[0]?.transactionDate ?? null;
  const denNgay = rows[rows.length - 1]?.transactionDate ?? null;

  // Chỉ nối tiếp khi file bắt đầu sau phần đã có. File nằm đè lên phần cũ thì không so được.
  const noiTiep =
    soDuCuoiDaCo != null && ngayCuoiDaCo != null && tuNgay != null && tuNgay > ngayCuoiDaCo;
  const dongDau = rows[0];
  let chenhNoiTiep: number | null = null;
  if (noiTiep && dongDau?.runningBalance != null) {
    const tinh =
      soDuCuoiDaCo! +
      (dongDau.debitAmount ?? 0) +
      (dongDau.creditAmount ?? 0) +
      (dongDau.feeInterest ?? 0) +
      (dongDau.vat ?? 0);
    chenhNoiTiep = dongDau.runningBalance - tinh;
  }

  return {
    accountNumber: doc.accountNumber,
    tongDong: rows.length,
    dongMoi: rows.length - dongTrung,
    dongTrung,
    tuNgay,
    denNgay,
    soDuDau: dongDau?.runningBalance ?? null,
    soDuCuoi: rows[rows.length - 1]?.runningBalance ?? null,
    noiTiepDuoc: chenhNoiTiep == null ? null : Math.abs(chenhNoiTiep) <= 1,
    chenhNoiTiep,
    chuoi: soatChuoiSoDu(rows, noiTiep ? soDuCuoiDaCo : null),
  };
}
