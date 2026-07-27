/**
 * Parsers cho 3 loại Excel: file thanh toán / MERGED cá nhân / Sổ tạm ứng.
 *
 * Trả về ParsedRow[] chưa lưu DB — server action classify + insert.
 * Không expose XLSX types ra ngoài — chỉ Buffer input.
 */
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { classify } from "./classify";
import type { NewFinancialTransaction } from "@/lib/schema";

export type SourceType = "thanh-toan" | "merged" | "tam-ung";

const clean = (v: unknown) => (v == null ? "" : String(v).trim().replace(/\s+/g, " "));
const toNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const excelSerialToDate = (n: number): string => {
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};
const monthOf = (iso: string) => (iso ? iso.slice(0, 7) : "");
const sheetToMonth = (name: string): string => {
  const m = name.match(/^T(\d{1,2})\.(\d{4})$/);
  return m ? `${m[2]}-${m[1].padStart(2, "0")}` : "";
};

/**
 * Sinh dedup key: sha1 của (source + tháng + số tiền + norm nội dung + recipient).
 * Include recipient để 5 khoản "Thưởng tết 200k" cho 5 người khác nhau
 * không bị gộp làm 1 (bug ban đầu).
 * Re-import cùng file → skip row đã có.
 */
function makeDedupKey(
  source: string,
  month: string,
  amount: number,
  desc: string,
  recipient: string,
): string {
  const norm = (s: string) =>
    s.toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/\s+/g, "");
  return createHash("sha1")
    .update(`${source}|${month}|${amount}|${norm(desc)}|${norm(recipient)}`)
    .digest("hex");
}

export type ParsedRow = Omit<NewFinancialTransaction, "id" | "createdAt" | "updatedAt">;

/**
 * File "So theo doi thanh toan" — sheet "1.1-Đề nghị thanh toán".
 * Data từ row 11. Cột: 0=STT, 1=ngày ĐNTT, 3=bộ phận, 4=chi tiết,
 * 5=số tiền, 10=người nhận, 19=ngày thanh toán thực.
 */
export function parseThanhToan(buf: Buffer): ParsedRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets["1.1-Đề nghị thanh toán"];
  if (!ws) throw new Error("Thiếu sheet '1.1-Đề nghị thanh toán'");
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  const out: ParsedRow[] = [];
  for (let i = 11; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (r[0] == null || r[0] === "") continue;
    const description = clean(r[4]);
    const amount = toNum(r[5]);
    if (amount === 0) continue;
    const ngayRaw = r[19] ?? r[1];
    let iso = "";
    if (typeof ngayRaw === "number") iso = excelSerialToDate(ngayRaw);
    else if (typeof ngayRaw === "string") {
      const m = ngayRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    if (!iso) continue;
    const bp = clean(r[3]);
    const recipient = clean(r[10]);
    const c = classify(`${description} ${clean(r[9])} ${recipient}`, recipient);
    const source = "thanh-toan";
    out.push({
      transactionDate: iso,
      transactionMonth: monthOf(iso),
      accrualMonth: monthOf(iso),
      description,
      amount,
      direction: "out",
      categoryCode: c.categoryCode,
      managementGroup: c.managementGroup,
      payer: "company",
      recipient: recipient || null,
      hasInvoice: !!clean(r[6]),
      invoiceNo: null,
      invoiceValid: null,
      sourceFile: source,
      sourceRow: i + 1,
      dedupKey: makeDedupKey(source, monthOf(iso), amount, description, recipient),
      note: c.note + (bp ? ` · Bộ phận: ${bp}` : ""),
    });
  }
  return out;
}

/**
 * File "Chi Phí - Cá nhân MERGED" — 2 sheet Triết + Bách.
 * Cột: 0=tháng (YYYY-MM), 1=hạng mục, 2=chi tiết, 3=note, 4=số tiền,
 * 7=ngày chi (raw), 9=nguồn (F1/F2/F3-invoice).
 */
export function parseMerged(buf: Buffer): ParsedRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const out: ParsedRow[] = [];
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
      const amount = toNum(r[4]);
      const month = clean(r[0]);
      if (!month || amount === 0) continue;
      const ngayRaw = r[7];
      // Nếu không parse được ngày → dùng ngày 15 của tháng làm fallback.
      const iso = `${month}-15`;
      const description = `${hangMuc}${chiTiet ? " — " + chiTiet : ""}`;
      const c = classify(`${hangMuc} ${chiTiet} ${clean(r[3])}`, clean(r[3]));
      const source = `merged-${nguoi}`;
      out.push({
        transactionDate: iso,
        transactionMonth: month,
        accrualMonth: month,
        description,
        amount,
        direction: "out",
        categoryCode: c.categoryCode,
        managementGroup: c.managementGroup,
        payer: nguoi,
        recipient: null,
        hasInvoice: false,
        invoiceNo: null,
        invoiceValid: null,
        sourceFile: source,
        sourceRow: i + 1,
        dedupKey: makeDedupKey(source, month, amount, description, ""),
        note: c.note + (ngayRaw ? ` · Ngày Excel: ${clean(ngayRaw)}` : ""),
      });
    }
  }
  return out;
}

/**
 * Sổ Tạm Ứng — 2 sheet Nga_HR + Tường Vi_admin.
 * Cột: 0=ngày, 1=nội dung, 2=nhận (bỏ qua), 3=chi từ tạm ứng, 8=số hóa đơn, 10=nhà cung cấp.
 * Data từ row 7.
 */
export function parseTamUng(buf: Buffer): ParsedRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const out: ParsedRow[] = [];
  for (const [sheet, nguoi] of [
    ["Nga_HR", "Nga"],
    ["Tường Vi_admin", "Tường Vi"],
  ]) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    for (let i = 7; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const chi = toNum(r[3]);
      if (chi === 0) continue; // bỏ dòng nhận tạm ứng hoặc rỗng
      const ngayRaw = r[0];
      const iso = typeof ngayRaw === "number" ? excelSerialToDate(ngayRaw) : "";
      if (!iso) continue;
      const description = clean(r[1]);
      const invoiceNo = clean(r[8]) || null;
      const c = classify(description, clean(r[10]));
      const source = `tam-ung-${nguoi}`;
      out.push({
        transactionDate: iso,
        transactionMonth: monthOf(iso),
      accrualMonth: monthOf(iso),
        description,
        amount: chi,
        direction: "out",
        categoryCode: c.categoryCode,
        managementGroup: c.managementGroup,
        payer: nguoi,
        recipient: clean(r[10]) || null,
        hasInvoice: !!invoiceNo,
        invoiceNo,
        invoiceValid: null,
        sourceFile: source,
        sourceRow: i + 1,
        dedupKey: makeDedupKey(source, monthOf(iso), chi, description, clean(r[10])),
        note: c.note,
      });
    }
  }
  return out;
}

export function parseByType(type: SourceType, buf: Buffer): ParsedRow[] {
  if (type === "thanh-toan") return parseThanhToan(buf);
  if (type === "merged") return parseMerged(buf);
  if (type === "tam-ung") return parseTamUng(buf);
  throw new Error(`Loại file không hợp lệ: ${type}`);
}
