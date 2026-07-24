/**
 * Sum theo tháng: Tạm Ứng (Nga + Tường Vi) vs Bách trong MERGED.
 * Nếu tạm ứng đều đến từ Bách chi ra (Bách tự chi hoặc đưa tiền cho Admin) →
 * Tổng Bách MERGED theo tháng phải ≥ Tổng Tạm Ứng theo tháng.
 */
import * as XLSX from "xlsx";
import * as path from "path";

const dir = path.join(process.cwd(), "data-excel");
const TAM_UNG_FILE = path.join(dir, "Chi phí", "SỔ TẠM ỨNG BRE.xlsx");
const MERGED_FILE = path.join(dir, "Chi phí", "Chi Phí - Cá nhân MERGED.xlsx");

const clean = (v: unknown): string => (v == null ? "" : String(v).trim());
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

function sumTamUng(): Map<string, number> {
  const wb = XLSX.readFile(TAM_UNG_FILE);
  const totals = new Map<string, number>();
  for (const sheetName of ["Nga_HR", "Tường Vi_admin"]) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    for (let i = 7; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const chi = toNum(r[3]); // CHI TỪ TIỀN TẠM ỨNG
      if (chi === 0) continue;
      const ngayRaw = r[0];
      const month = typeof ngayRaw === "number" ? excelSerialToMonth(ngayRaw) : "";
      if (!month) continue;
      totals.set(month, (totals.get(month) ?? 0) + chi);
    }
  }
  return totals;
}

function sumBachMerged(): Map<string, number> {
  const wb = XLSX.readFile(MERGED_FILE);
  const ws = wb.Sheets["Bách"];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  const totals = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const thang = clean(r[0]);
    const hangMuc = clean(r[1]);
    const soTien = toNum(r[4]);
    if (hangMuc === "TỔNG") break;
    if (!thang) continue;
    if (soTien === 0) continue;
    totals.set(thang, (totals.get(thang) ?? 0) + soTien);
  }
  return totals;
}

function main() {
  const tu = sumTamUng();
  const bach = sumBachMerged();
  const allMonths = new Set<string>([...tu.keys(), ...bach.keys()]);
  const sorted = [...allMonths].sort();

  console.log("\n== Tổng chi theo tháng: Tạm Ứng (Nga+Tường Vi) vs Bách MERGED ==\n");
  console.log(
    "Tháng    | Tạm Ứng          | Bách MERGED      | Chênh (Bách − TU) | Ghi chú"
  );
  console.log(
    "---------+------------------+------------------+-------------------+--------"
  );
  let sumTU = 0;
  let sumBach = 0;
  for (const m of sorted) {
    const t = tu.get(m) ?? 0;
    const b = bach.get(m) ?? 0;
    sumTU += t;
    sumBach += b;
    const diff = b - t;
    let note = "";
    if (t > 0 && b === 0) note = "⚠ TU có, Bách 0";
    else if (t === 0 && b > 0) note = "Bách only";
    else if (t > 0 && b > 0 && diff < 0) note = "⚠ Bách < TU (lệch)";
    else if (t > 0 && b > 0 && diff >= 0) note = "OK (Bách ≥ TU)";
    console.log(
      `${m}  | ${t.toLocaleString("vi-VN").padStart(16)} | ${b.toLocaleString("vi-VN").padStart(16)} | ${diff.toLocaleString("vi-VN").padStart(17)} | ${note}`
    );
  }
  console.log(
    "---------+------------------+------------------+-------------------+--------"
  );
  console.log(
    `TỔNG     | ${sumTU.toLocaleString("vi-VN").padStart(16)} | ${sumBach.toLocaleString("vi-VN").padStart(16)} | ${(sumBach - sumTU).toLocaleString("vi-VN").padStart(17)} |`
  );
}

main();
