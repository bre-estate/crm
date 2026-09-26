/**
 * So sánh SỔ TẠM ỨNG BRE (Nga_HR + Tường Vi_admin) với Chi Phí - Cá nhân MERGED.
 *
 * Mục đích: dò xem giao dịch tạm ứng (chi từ tiền mặt) có được ghi song song
 * trong file chi phí cá nhân (Triết/Bách) không.
 *
 * Match key: normalize nội dung + số tiền (ngày lệch có thể vẫn cùng giao dịch).
 *
 * Output:
 *   data-excel/_tam-ung-delta.txt
 */
import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";

const dir = path.join(process.cwd(), "data-excel");
const TAM_UNG_FILE = path.join(dir, "Chi phí", "SỔ TẠM ỨNG BRE.xlsx");
const MERGED_FILE = path.join(dir, "Chi phí", "Chi Phí - Cá nhân MERGED.xlsx");
const OUT = path.join(dir, "_tam-ung-delta.txt");

type TU = {
  ngay: string; // display
  noiDung: string;
  soTien: number;
  hoaDon: string;
  ncc: string;
  nguoi: string; // Nga / Tường Vi
};

type MR = {
  thang: string;
  hangMuc: string;
  chiTiet: string;
  note: string;
  soTien: number;
  ngayChi: string;
  nguoi: string;
  origin: string;
};

const clean = (v: unknown): string => (v == null ? "" : String(v).trim().replace(/\s+/g, " "));

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

const normNoiDung = (s: string): string =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, "")
    .replace(/[.,;:'"()]/g, "");

function readTamUng(sheetName: string, nguoi: string): TU[] {
  const wb = XLSX.readFile(TAM_UNG_FILE);
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  const out: TU[] = [];
  // Data từ R7 trở đi. Cấu trúc:
  //  col 0: NGÀY
  //  col 1: NỘI DUNG
  //  col 2: NHẬN TẠM ỨNG (thu vào)
  //  col 3: CHI TỪ TIỀN TẠM ỨNG (chi ra) — lấy row này
  //  col 4: SỐ DƯ
  //  col 8: SỐ HÓA ĐƠN
  //  col 10: NHÀ CUNG CẤP
  for (let i = 7; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const noiDung = clean(r[1]);
    const soTien = toNum(r[3]);
    if (soTien === 0) continue; // bỏ row "nhận tạm ứng" hoặc empty
    const ngayRaw = r[0];
    const ngay = typeof ngayRaw === "number" ? excelSerialToDate(ngayRaw) : clean(ngayRaw);
    out.push({
      ngay,
      noiDung,
      soTien,
      hoaDon: clean(r[8]),
      ncc: clean(r[10]),
      nguoi,
    });
  }
  return out;
}

function readMerged(): MR[] {
  const wb = XLSX.readFile(MERGED_FILE);
  const out: MR[] = [];
  for (const nguoi of ["Triết", "Bách"]) {
    const ws = wb.Sheets[nguoi];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    // Header row 0. Data từ row 1. Stop khi row TOTAL.
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const hangMuc = clean(r[1]);
      const chiTiet = clean(r[2]);
      const soTien = toNum(r[4]);
      if (hangMuc === "TỔNG") break;
      if (!hangMuc && !chiTiet && soTien === 0) continue;
      out.push({
        thang: clean(r[0]),
        hangMuc,
        chiTiet,
        note: clean(r[3]),
        soTien,
        ngayChi: clean(r[7]),
        nguoi,
        origin: clean(r[9]),
      });
    }
  }
  return out;
}

function main() {
  const tu = [
    ...readTamUng("Nga_HR", "Nga"),
    ...readTamUng("Tường Vi_admin", "Tường Vi"),
  ];
  const merged = readMerged();
  console.log(`Tạm Ứng: ${tu.length} rows (Nga + Tường Vi)`);
  console.log(`MERGED: ${merged.length} rows (Triết + Bách)`);

  // Match key: soTien + norm nội dung
  const mergedMap = new Map<string, MR[]>();
  for (const m of merged) {
    // MERGED "Chi tiết" khớp với TU "nội dung"; MERGED "Hạng mục" cũng có
    // thể chứa nội dung. Ghép cả 2 để tăng tỉ lệ match.
    const keys = new Set<string>();
    keys.add(`${m.soTien}|${normNoiDung(m.chiTiet)}`);
    keys.add(`${m.soTien}|${normNoiDung(m.hangMuc)}`);
    for (const k of keys) {
      if (!mergedMap.has(k)) mergedMap.set(k, []);
      mergedMap.get(k)!.push(m);
    }
  }

  const matched: { tu: TU; m: MR }[] = [];
  const onlyTU: TU[] = [];
  for (const t of tu) {
    const k = `${t.soTien}|${normNoiDung(t.noiDung)}`;
    if (mergedMap.has(k)) {
      matched.push({ tu: t, m: mergedMap.get(k)![0] });
    } else {
      onlyTU.push(t);
    }
  }

  // MERGED rows không match với Tạm Ứng
  const matchedMergedKeys = new Set(
    matched.map((p) => `${p.m.soTien}|${normNoiDung(p.m.chiTiet)}`),
  );
  const onlyM: MR[] = merged.filter(
    (m) => !matchedMergedKeys.has(`${m.soTien}|${normNoiDung(m.chiTiet)}`),
  );

  const lines: string[] = [];
  lines.push("SO SÁNH SỔ TẠM ỨNG BRE ↔ MERGED (Chi phí cá nhân)\n");
  lines.push(`Generated: ${new Date().toISOString()}\n\n`);
  lines.push(`Tạm Ứng: ${tu.length} rows | MERGED: ${merged.length} rows\n`);
  lines.push(`Match: ${matched.length} | Chỉ có Tạm Ứng: ${onlyTU.length} | Chỉ có MERGED: ${onlyM.length}\n\n`);

  lines.push(`=== ${matched.length} TRÙNG NHAU (có ở cả 2) ===\n`);
  for (const p of matched) {
    lines.push(
      `  ${p.tu.ngay} · ${p.tu.noiDung} · ${p.tu.soTien.toLocaleString("vi-VN")} · [TU-${p.tu.nguoi}] ↔ [MERGED-${p.m.nguoi} ${p.m.thang}]\n`,
    );
  }

  lines.push(`\n\n=== ${onlyTU.length} CHỈ CÓ TRONG TẠM ỨNG (chưa note ở file Chi phí cá nhân) ===\n`);
  const byNguoi = new Map<string, TU[]>();
  for (const t of onlyTU) {
    if (!byNguoi.has(t.nguoi)) byNguoi.set(t.nguoi, []);
    byNguoi.get(t.nguoi)!.push(t);
  }
  for (const [ng, list] of byNguoi) {
    lines.push(`\n--- ${ng} (${list.length}) ---\n`);
    for (const t of list) {
      lines.push(`  ${t.ngay} · ${t.noiDung} · ${t.soTien.toLocaleString("vi-VN")}\n`);
    }
  }

  lines.push(`\n\n=== ${onlyM.length} CHỈ CÓ TRONG MERGED (không dính tạm ứng) ===\n`);
  const byNguoi2 = new Map<string, MR[]>();
  for (const m of onlyM) {
    if (!byNguoi2.has(m.nguoi)) byNguoi2.set(m.nguoi, []);
    byNguoi2.get(m.nguoi)!.push(m);
  }
  for (const [ng, list] of byNguoi2) {
    lines.push(`\n--- ${ng} (${list.length}) ---\n`);
    for (const m of list) {
      lines.push(
        `  ${m.thang} · ${m.hangMuc} · ${m.chiTiet || "-"} · ${m.soTien.toLocaleString("vi-VN")}\n`,
      );
    }
  }

  fs.writeFileSync(OUT, lines.join(""));
  console.log(`\n✅ Report: ${OUT}`);
  console.log(`   Match: ${matched.length}`);
  console.log(`   Chỉ Tạm Ứng: ${onlyTU.length}`);
  console.log(`   Chỉ MERGED: ${onlyM.length}`);
}

main();
