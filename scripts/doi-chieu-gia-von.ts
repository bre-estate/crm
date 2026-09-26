/**
 * Đối chiếu giá vốn giữa app và sheet 2.3_Gia von của Bao Cao Doanh Thu.xlsx.
 *
 * Khóa nối: cột D Ma_SP ↔ products.product_code. Tiêu đề ở dòng 4.
 *
 * CÁCH LẤY SỐ TỪ EXCEL, khác nhau theo loại chi phí:
 *
 *   KPI CEO  và KPI TPKD  có ba cột: lũy kế, đã thanh toán, còn thanh toán đợt
 *   này. Lấy LŨY KẾ ở dòng cuối cùng của mã đó (cột AD và AH), không cộng cột
 *   "còn thanh toán đợt này". Lý do: có dòng điều chỉnh giảm chỉ ghi vào cột
 *   tổng AM mà không ghi vào cột từng đợt, nên cộng từng đợt sẽ dư. Ví dụ
 *   AVIO_BAML_B.16.11 cộng đợt ra 3.369.452 trong khi lũy kế là 2.969.452,
 *   dư đúng 400.000 của dòng điều chỉnh 445.
 *
 *   Các loại còn lại chỉ có một cột số tiền mỗi đợt, nên cộng các đợt.
 *
 * ĐÃ GIẢI THÍCH, KHÔNG PHẢI LỖI (nhân sự xác nhận 27/09/2026):
 *
 *   Năm căn FENICA B.07-13, A.08-06, A.17-11, B.07-12, B.08-04 lệch đúng
 *   1.627.273 mỗi căn ở CĐT thưởng NVKD. Trong Excel mỗi căn có hai dòng:
 *   dòng 04/08 ghi 16.272.727, dòng 24/09 ghi -1.627.273. Cộng lại ra
 *   14.645.454 nên script báo lệch.
 *
 *   Số đối chiếu thật là 16.272.727 (chưa VAT), app ghi đúng. Dòng âm kia là
 *   thu hồi phần VAT mà nhân sự cũ đã chi dư: lúc chi đã trả khoảng 17,9 triệu
 *   gồm VAT, đợt sau trừ lại 1.627.273. Đó là điều chỉnh phía CHI TIỀN, không
 *   phải điều chỉnh nghĩa vụ, nên không được trừ vào số đối chiếu.
 *
 * Chỉ đọc, không ghi gì.
 *   npx tsx --env-file=.env.local scripts/doi-chieu-gia-von.ts
 */
import { db } from "@/lib/db";
import { products, costReconciliations } from "@/lib/schema";
import { sql } from "drizzle-orm";
import XLSX from "xlsx";

const FILE = "data-excel/Bao Cao Doanh Thu.xlsx";
const SHEET = "2.3_Gia von";
const NGUONG = 1000;
const tr = (n: number) => Math.round(n).toLocaleString("vi-VN");
const so = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** cost_type trong app → cách lấy số từ Excel. */
const MAP: Record<string, { nhan: string; cot: number; luyKe?: true }> = {
  sale_commission: { nhan: "HH sale", cot: 21 }, // V
  customer_support: { nhan: "Hỗ trợ khách", cot: 23 }, // X
  cdt_bonus_sale: { nhan: "CĐT thưởng NVKD", cot: 24 }, // Y
  cdt_bonus_manager: { nhan: "CĐT thưởng QL", cot: 25 }, // Z
  bonus_sale: { nhan: "CTY thưởng sale", cot: 26 }, // AA
  bonus_manager: { nhan: "CTY thưởng QL", cot: 27 }, // AB
  kpi_ceo: { nhan: "KPI CEO", cot: 29, luyKe: true }, // AD lũy kế
  kpi_tpkd: { nhan: "KPI TPKD", cot: 33, luyKe: true }, // AH lũy kế
  kpi_admin: { nhan: "KPI Admin", cot: 37 }, // AL
};

async function main() {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[SHEET], {
    header: 1, raw: true, defval: null,
  });

  // excel[maSP][cost_type] = số tiền
  const excel = new Map<string, number>();
  const congDot = new Map<string, number>();
  for (let r = 4; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const ma = String(row[3] ?? "").trim();
    if (!ma) continue;
    for (const [loai, m] of Object.entries(MAP)) {
      const k = `${ma}|${loai}`;
      const v = so(row[m.cot]);
      if (m.luyKe) {
        // Lũy kế: lấy giá trị ở dòng cuối cùng có số, không cộng dồn.
        if (v) excel.set(k, v);
        // Giữ thêm cách cộng từng đợt để đối chiếu chéo, vì hai cách này
        // không phải lúc nào cũng ra cùng một số trong chính file.
        const vDot = so(row[m.cot + 2]);
        if (vDot) congDot.set(k, (congDot.get(k) ?? 0) + vDot);
      } else if (v) {
        excel.set(k, (excel.get(k) ?? 0) + v);
      }
    }
  }

  const ds = await db.select({ id: products.id, code: products.productCode }).from(products);
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
    app.set(`${p.code}|${r.costType}`, Number(r.amt));
  }

  const lech = [...new Set([...app.keys(), ...excel.keys()])]
    .map((k) => ({ k, a: app.get(k) ?? 0, e: excel.get(k) ?? 0 }))
    .map((r) => ({ ...r, d: r.a - r.e }))
    .filter((r) => Math.abs(r.d) >= NGUONG)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d));

  console.log(`FILE : ${FILE}`);
  console.log(`SHEET: ${SHEET}\n`);
  console.log(
    "Ma SP".padEnd(26), "Loai".padEnd(18),
    "App".padStart(14), "Excel lũy kế".padStart(14), "App - Excel".padStart(14),
  );
  for (const r of lech) {
    const [ma, loai] = r.k.split("|");
    // Với KPI CEO và KPI TPKD, in thêm cách cộng từng đợt để thấy chính file
    // đang cho hai số khác nhau ở đâu.
    const dot = MAP[loai]?.luyKe ? (congDot.get(r.k) ?? 0) : null;
    console.log(
      ma.padEnd(26), (MAP[loai]?.nhan ?? loai).padEnd(18),
      tr(r.a).padStart(14), tr(r.e).padStart(14), tr(r.d).padStart(14),
      dot == null ? "" : `   cộng đợt ${tr(dot).padStart(13)}${Math.abs(dot - r.a) < NGUONG ? "  = app" : ""}`,
    );
  }

  const tongApp = [...app.values()].reduce((a, b) => a + b, 0);
  const tongExcel = [...excel.values()].reduce((a, b) => a + b, 0);
  console.log(`\n${lech.length} dòng lệch từ ${NGUONG} đồng trở lên.`);
  console.log(`Tổng app   ${tr(tongApp)}`);
  console.log(`Tổng excel ${tr(tongExcel)}`);
  console.log(`Chênh      ${tr(tongApp - tongExcel)}`);
}

main().then(() => process.exit(0));
