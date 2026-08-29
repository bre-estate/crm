import XLSX from "xlsx";
import postgres from "postgres";
import { readFileSync } from "fs";

const env = readFileSync("/Users/trietnguyen/Documents/Company/BRE/App/CRM/.env.local", "utf-8");
const DB = env.match(/DATABASE_URL\s*=\s*['"]?([^'"\n]+)['"]?/)?.[1];
const sql = postgres(DB);

const wb = XLSX.readFile("/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx", { cellDates: true, cellNF: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.3_Gia von"], { header: 1, raw: true, defval: null });

// Sheet 2.3 header ở R3, data từ R4
// Cột: 1=Ngày, 2=Tên NV, 3=Mã SP, 4=Mã căn, 15=%HH sale, 21=PMG LK đợt này, 24=Hỗ trợ khách,
//   25=CĐT thưởng NVKD, 27=Cty thưởng QL, 28=KPI CEO ($), 31=KPI CEO amount,
//   35=KPI TPKD amount, 37=KPI Admin amount, 38=Tổng phải trả

// Group Excel rows by product_code, dump từng "loại chi" per căn
const excelPerProduct = new Map();
for (let i = 4; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const productCode = r[3];
  if (!productCode) continue;
  const total = Number(r[38] ?? 0);
  if (!total) continue;
  const employee = r[2];
  const hhSale = Number(r[21] ?? 0);
  const cs = Number(r[24] ?? 0);
  const cdtBonusSale = Number(r[25] ?? 0);
  const cdtBonusMgr = 0; // TBD col
  const kpiCeo = Number(r[31] ?? 0);
  const kpiTpkd = Number(r[35] ?? 0);
  const kpiAdmin = Number(r[37] ?? 0);
  const entry = excelPerProduct.get(productCode) || [];
  entry.push({ row: i+1, employee, hhSale, cs, cdtBonusSale, kpiCeo, kpiTpkd, kpiAdmin, total });
  excelPerProduct.set(productCode, entry);
}

// Top diff products from previous audit
const TOP_DIFF = [
  "EMGV_DT26_A1-21-17", "EMGB_DT26_A-07-09", "EMGV_ZL26_B1-15-05",
  "EMGV_DT26_B2-22-05", "EMGV_DT26_A2-15-15", "BCGD_BCOH_A.10.10", "EMGB_DT26_B-15-10",
];

for (const code of TOP_DIFF) {
  console.log(`\n══════ ${code} ══════`);
  const excelRows = excelPerProduct.get(code) || [];
  console.log(`Excel: ${excelRows.length} dòng`);
  const excelTotal = excelRows.reduce((s, r) => s + r.total, 0);
  console.log(`  Tổng Excel: ${excelTotal.toLocaleString("vi-VN")}`);
  excelRows.forEach(r => {
    const parts = [];
    if (r.hhSale) parts.push(`HH sale ${r.hhSale.toLocaleString("vi-VN")}`);
    if (r.cs) parts.push(`HTK ${r.cs.toLocaleString("vi-VN")}`);
    if (r.cdtBonusSale) parts.push(`CĐT.T.NVKD ${r.cdtBonusSale.toLocaleString("vi-VN")}`);
    if (r.kpiCeo) parts.push(`KPI CEO ${r.kpiCeo.toLocaleString("vi-VN")}`);
    if (r.kpiTpkd) parts.push(`KPI TPKD ${r.kpiTpkd.toLocaleString("vi-VN")}`);
    if (r.kpiAdmin) parts.push(`KPI Admin ${r.kpiAdmin.toLocaleString("vi-VN")}`);
    console.log(`  R${r.row} ${r.employee}: total=${r.total.toLocaleString("vi-VN")}${parts.length ? ` [${parts.join(" + ")}]` : ""}`);
  });

  const [p] = await sql`SELECT id FROM products WHERE product_code = ${code}`;
  if (!p) { console.log("  ⚠️ Product không tồn tại DB!"); continue; }
  const dbRows = await sql`
    SELECT id, cost_type, employee_name, reconciliation_date, amount_payable_this_time
    FROM cost_reconciliations WHERE product_id = ${p.id}
    ORDER BY reconciliation_date NULLS LAST, id
  `;
  console.log(`DB: ${dbRows.length} recon`);
  const dbTotal = dbRows.reduce((s, r) => s + Number(r.amount_payable_this_time), 0);
  console.log(`  Tổng DB: ${dbTotal.toLocaleString("vi-VN")}`);
  dbRows.forEach(r => console.log(`  #${r.id} ${r.reconciliation_date} ${r.cost_type} ${r.employee_name}: ${Number(r.amount_payable_this_time).toLocaleString("vi-VN")}`));

  console.log(`  ⇒ THIẾU ${(excelTotal - dbTotal).toLocaleString("vi-VN")}`);
}

await sql.end();
