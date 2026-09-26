/**
 * Đối chiếu giá vốn giữa app và sheet 2.3_Gia von của Bao Cao Doanh Thu.xlsx.
 *
 * Khóa nối: cột D Ma_SP ↔ products.product_code.
 * So theo từng căn × từng loại chi phí, dùng 8 cột khoản (V, X, Y, Z, AB, AF,
 * AJ, AL). Bỏ qua chênh dưới 1000 đồng vì đó là làm tròn.
 *
 * Chỉ in số, không kết luận. Xóa sau khi xong.
 */
import { db } from "@/lib/db";
import { products, costReconciliations } from "@/lib/schema";
import { sql } from "drizzle-orm";
import XLSX from "xlsx";
import { bocGiaVon, SHEET_GIA_VON, COST_TYPE_LABEL } from "@/lib/reports/bcdt-gia-von";

const FILE = "data-excel/Bao Cao Doanh Thu.xlsx";
const NGUONG = 1000;
const tr = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[SHEET_GIA_VON], {
    header: 1, raw: true, defval: null,
  });
  const bang = bocGiaVon(grid);

  // 1. Cột AM có khớp tổng 8 cột khoản không
  let cotAM = 0;
  let congKhoan = 0;
  const lechTrongFile: string[] = [];
  for (const [ma, dot] of Object.entries(bang.perProduct)) {
    for (const d of dot) {
      const cong = d.items.reduce((a, b) => a + b.amt, 0);
      cotAM += d.total;
      congKhoan += cong;
      if (Math.abs(d.total - cong) >= NGUONG) {
        lechTrongFile.push(
          `  dòng ${String(d.excelRow).padEnd(5)} ${ma.padEnd(26)} AM ${tr(d.total).padStart(13)}  cộng khoản ${tr(cong).padStart(13)}  lệch ${tr(d.total - cong).padStart(13)}`,
        );
      }
    }
  }
  console.log(`FILE : ${FILE}`);
  console.log(`SHEET: ${SHEET_GIA_VON}\n`);
  console.log("=== 1. TRONG CHÍNH FILE: cột AM so với tổng 8 cột khoản ===");
  console.log(`  cột AM       ${tr(cotAM)}`);
  console.log(`  cộng khoản   ${tr(congKhoan)}`);
  console.log(`  chênh        ${tr(cotAM - congKhoan)}`);
  console.log(`  số dòng lệch ${lechTrongFile.length}`);
  for (const l of lechTrongFile) console.log(l);

  // 2. App so với Excel, theo từng căn × loại
  const ds = await db
    .select({ id: products.id, code: products.productCode })
    .from(products);
  const recon = await db
    .select({
      productId: costReconciliations.productId,
      costType: costReconciliations.costType,
      amt: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}),0)::float8`,
    })
    .from(costReconciliations)
    .groupBy(costReconciliations.productId, costReconciliations.costType);

  const app = new Map<string, number>();
  for (const r of recon) {
    const p = ds.find((x) => x.id === r.productId);
    if (!p) continue;
    app.set(`${p.code}|${COST_TYPE_LABEL[r.costType] ?? r.costType}`, Number(r.amt));
  }
  const excel = new Map<string, number>();
  for (const [ma, dot] of Object.entries(bang.perProduct)) {
    for (const d of dot) {
      for (const i of d.items) {
        const k = `${ma}|${i.loai}`;
        excel.set(k, (excel.get(k) ?? 0) + i.amt);
      }
    }
  }

  const lech = [...new Set([...app.keys(), ...excel.keys()])]
    .map((k) => ({ k, a: app.get(k) ?? 0, e: excel.get(k) ?? 0 }))
    .map((r) => ({ ...r, d: r.a - r.e }))
    .filter((r) => Math.abs(r.d) >= NGUONG)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d));

  console.log("\n\n=== 2. APP SO VỚI EXCEL, theo từng căn × loại ===\n");
  console.log(
    "Ma SP".padEnd(26), "Loai".padEnd(18),
    "App".padStart(14), "Excel".padStart(14), "App - Excel".padStart(14),
  );
  for (const r of lech) {
    const [ma, loai] = r.k.split("|");
    console.log(
      ma.padEnd(26), loai.padEnd(18),
      tr(r.a).padStart(14), tr(r.e).padStart(14), tr(r.d).padStart(14),
    );
  }
  const tongApp = [...app.values()].reduce((a, b) => a + b, 0);
  const tongExcel = [...excel.values()].reduce((a, b) => a + b, 0);
  console.log(`\n${lech.length} dòng lệch từ ${NGUONG} đồng trở lên.`);
  console.log(`Tổng app              ${tr(tongApp)}`);
  console.log(`Tổng excel cộng khoản ${tr(tongExcel)}`);
  console.log(`Chênh                 ${tr(tongApp - tongExcel)}`);
}

main().then(() => process.exit(0));
