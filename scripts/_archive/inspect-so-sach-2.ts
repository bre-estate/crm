import * as XLSX from "xlsx";

const wb = XLSX.readFile("data-excel/SO SACH BRE 2025.xlsx");
const fmt = (n: number) => (isNaN(n) ? "-" : Math.round(n).toLocaleString("vi-VN"));

// CDPS — full
console.log("═════════════════════════════════════════════════");
console.log("  CDPS — BẢNG CÂN ĐỐI PHÁT SINH 2025");
console.log("═════════════════════════════════════════════════");
const cdps = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["CDPS"], {
  header: 1,
  blankrows: false,
});
console.log("Mã  | Tên TK                                     | Nợ đầu     | Có đầu    | PS Nợ       | PS Có       | Nợ cuối    | Có cuối");
for (let i = 7; i < cdps.length; i++) {
  const row = cdps[i] as any[];
  if (!row || !row[0]) continue;
  const code = String(row[0] ?? "");
  const name = String(row[1] ?? "").substring(0, 42);
  const noDau = Number(row[2] ?? 0);
  const coDau = Number(row[3] ?? 0);
  const psNo = Number(row[4] ?? 0);
  const psCo = Number(row[5] ?? 0);
  const noCuoi = Number(row[6] ?? 0);
  const coCuoi = Number(row[7] ?? 0);
  if (code === "Tổng cộng" || code === "Cộng cuối kỳ") {
    console.log(`  ─────────────────────────────────────────────`);
    console.log(
      `${code.padEnd(4)} | ${name.padEnd(42)} | ${fmt(noDau).padStart(11)} | ${fmt(coDau).padStart(11)} | ${fmt(psNo).padStart(13)} | ${fmt(psCo).padStart(13)} | ${fmt(noCuoi).padStart(11)} | ${fmt(coCuoi).padStart(11)}`,
    );
    continue;
  }
  console.log(
    `${code.padEnd(4)} | ${name.padEnd(42)} | ${fmt(noDau).padStart(11)} | ${fmt(coDau).padStart(11)} | ${fmt(psNo).padStart(13)} | ${fmt(psCo).padStart(13)} | ${fmt(noCuoi).padStart(11)} | ${fmt(coCuoi).padStart(11)}`,
  );
}
