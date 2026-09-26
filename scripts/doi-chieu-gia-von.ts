/**
 * Đối chiếu giá vốn giữa app và sheet 2.3_Gia von của Bao Cao Doanh Thu.xlsx.
 *
 * Khóa nối: cột D Ma_SP ↔ products.product_code. Tiêu đề ở dòng 4.
 *
 * CÁCH LẤY SỐ TỪ EXCEL, khác nhau theo loại chi phí:
 *
 *   KPI CEO và KPI TPKD có ba cột: lũy kế, đã thanh toán, còn thanh toán đợt
 *   này. Lấy TỔNG CÁC ĐỢT (cột AF và AJ), vì tiền cũng chi theo từng đợt.
 *   Đếm trên toàn bộ dữ liệu 27/09/2026 thì app khớp cách này ở 37/37 mã KPI
 *   CEO và 40/41 mã KPI TPKD, trong khi không mã KPI CEO nào chỉ khớp lũy kế.
 *
 *   Ngoại lệ duy nhất: AVIO_BAML_B.16.11 KPI TPKD, và lỗi nằm ở Excel.
 *   Excel có hai dòng điều chỉnh cùng ngày 29/08 nhưng ghi khác kiểu nhau:
 *   dòng 443 ghi -5.500.000 vào cả cột V lẫn cột AM, còn dòng 445 ghi
 *   -400.000 CHỈ vào cột AM và để trống cột AJ. App có đủ cả hai dòng điều
 *   chỉnh, nên tính ra 2.527.089 + 842.363 - 400.000 = 2.969.452, khớp đúng
 *   cột lũy kế AH. Tức app đúng, Excel thiếu số ở cột AJ dòng 445.
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
 * BA DÒNG LẤY CỘT AM THAY VÌ CỘT KHOẢN
 *
 *   Toàn sheet 449 dòng thì 446 dòng có cột AM đúng bằng tổng các cột khoản.
 *   Ba dòng còn lại không, và ở cả ba thì AM trùng khít cột AO "Số tiền thanh
 *   toán", tức AM mới là số thật sự chi. App cũng đang theo AM.
 *
 *   Kiểm ở mức tổng: tổng cột AM 6.639.516.225, trừ Thưởng booking 46.540.000
 *   mà app chưa có, cộng lại 8.136.365 phần VAT của 5 căn FENICA, ra
 *   6.601.112.590 so với tổng app 6.601.112.561, chỉ chênh 29 đồng làm tròn.
 *
 *   Không đổi cả script sang đọc AM được, vì 72 dòng chứa từ hai loại chi phí
 *   trở lên và AM gộp chung, không tách ra theo loại được. Nên chỉ ghi đè đúng
 *   ba dòng này, cả ba đều chỉ có một loại.
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
  kpi_ceo: { nhan: "KPI CEO", cot: 31, luyKe: true }, // AF còn TT đợt này
  kpi_tpkd: { nhan: "KPI TPKD", cot: 35, luyKe: true }, // AJ còn TT đợt này
  kpi_admin: { nhan: "KPI Admin", cot: 37 }, // AL
};

/**
 * Dòng Excel → loại chi phí lấy cột AM thay cho cột khoản.
 * Thêm dòng mới vào đây khi kế toán xác nhận, script sẽ cảnh báo nếu gặp dòng
 * lệch mà chưa khai ở bảng này.
 */
const GHI_DE_AM: Record<number, { loai: string; vi_sao: string }> = {
  245: { loai: "kpi_admin", vi_sao: "AL 253.401 nhưng AM và AO đều 231.559, cột AK % để 0" },
  246: { loai: "kpi_admin", vi_sao: "AL 243.575 nhưng AM và AO đều 240.918, cột AK % để 0" },
  445: { loai: "kpi_tpkd", vi_sao: "điều chỉnh -400.000 chỉ ghi vào AM, bỏ trống cột AJ" },
};

/**
 * Chênh lệch đã tra ra nguyên nhân, không cần xử lý nữa. Vẫn in ra bảng chứ
 * không lọc bỏ, để đừng giấu mất số thật, chỉ đánh dấu để khỏi soi lại.
 */
const DA_GIAI_THICH: Record<string, string> = Object.fromEntries(
  ["B.07-13", "A.08-06", "A.17-11", "B.07-12", "B.08-04"].map((c) => [
    `FENI_DXFE_${c}|cdt_bonus_sale`,
    "VAT chi dư, app đúng",
  ]),
);

async function main() {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[SHEET], {
    header: 1, raw: true, defval: null,
  });

  // excel[maSP][cost_type] = số tiền
  const excel = new Map<string, number>();
  const luyKe = new Map<string, number>();
  const canhBao: string[] = [];
  for (let r = 4; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const ma = String(row[3] ?? "").trim();
    if (!ma) continue;

    const ghiDe = GHI_DE_AM[r + 1];
    // Dòng lệch mà chưa khai trong bảng ghi đè thì phải kêu lên, không im lặng bỏ qua.
    const congKhoan = Object.values(MAP).reduce((a, m) => a + so(row[m.cot]), 0);
    if (!ghiDe && Math.abs(so(row[38]) - congKhoan) >= NGUONG) {
      canhBao.push(
        `  dòng ${r + 1} ${ma}: AM ${tr(so(row[38]))} khác tổng khoản ${tr(congKhoan)}`,
      );
    }

    for (const [loai, m] of Object.entries(MAP)) {
      const k = `${ma}|${loai}`;
      const v = ghiDe ? (ghiDe.loai === loai ? so(row[38]) : 0) : so(row[m.cot]);
      if (v) excel.set(k, (excel.get(k) ?? 0) + v);
      if (m.luyKe) {
        // Giữ thêm cột lũy kế để đối chiếu chéo: hai cách này không phải lúc
        // nào cũng ra cùng một số trong chính file.
        const vLk = so(row[m.cot - 2]);
        if (vLk) luyKe.set(k, vLk); // dòng cuối cùng có số
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
    .sort((x, y) => {
      // Chưa rõ nguyên nhân lên trước, trong mỗi nhóm thì số lớn lên trước.
      const ga = DA_GIAI_THICH[x.k] ? 1 : 0;
      const gb = DA_GIAI_THICH[y.k] ? 1 : 0;
      return ga - gb || Math.abs(y.d) - Math.abs(x.d);
    });

  console.log(`FILE : ${FILE}`);
  console.log(`SHEET: ${SHEET}`);
  console.log(
    `Lấy cột AM thay cột khoản ở ${Object.keys(GHI_DE_AM).length} dòng: ${Object.keys(GHI_DE_AM).join(", ")}\n`,
  );
  if (canhBao.length) {
    console.log("CẢNH BÁO: có dòng AM khác tổng khoản mà chưa khai trong GHI_DE_AM");
    for (const c of canhBao) console.log(c);
    console.log("");
  }
  console.log(
    "Ma SP".padEnd(26), "Loai".padEnd(18),
    "App".padStart(14), "Excel cộng đợt".padStart(14), "App - Excel".padStart(14),
  );
  for (const r of lech) {
    const [ma, loai] = r.k.split("|");
    // Với KPI CEO và KPI TPKD, in thêm cột lũy kế để thấy chính file đang cho
    // hai số khác nhau ở đâu.
    const dot = MAP[loai]?.luyKe ? (luyKe.get(r.k) ?? 0) : null;
    console.log(
      ma.padEnd(26), (MAP[loai]?.nhan ?? loai).padEnd(18),
      tr(r.a).padStart(14), tr(r.e).padStart(14), tr(r.d).padStart(14),
      DA_GIAI_THICH[r.k]
        ? `   ${DA_GIAI_THICH[r.k]}`
        : dot == null
          ? ""
          : `   lũy kế ${tr(dot).padStart(13)}${Math.abs(dot - r.a) < NGUONG ? "  = app" : ""}`,
    );
  }

  const tongApp = [...app.values()].reduce((a, b) => a + b, 0);
  const tongExcel = [...excel.values()].reduce((a, b) => a + b, 0);
  const chuaRo = lech.filter((r) => !DA_GIAI_THICH[r.k]);
  const daRo = lech.filter((r) => DA_GIAI_THICH[r.k]);
  console.log(`\n${lech.length} dòng lệch từ ${NGUONG} đồng trở lên:`);
  console.log(
    `  chưa rõ nguyên nhân ${chuaRo.length} dòng, ${tr(chuaRo.reduce((a, b) => a + b.d, 0))}`,
  );
  console.log(
    `  đã giải thích       ${daRo.length} dòng, ${tr(daRo.reduce((a, b) => a + b.d, 0))}`,
  );
  console.log(`Tổng app   ${tr(tongApp)}`);
  console.log(`Tổng excel ${tr(tongExcel)}`);
  console.log(`Chênh      ${tr(tongApp - tongExcel)}`);
}

main().then(() => process.exit(0));
