import XLSX from "xlsx";
import postgres from "postgres";
import { readFileSync, writeFileSync } from "fs";

const env = readFileSync("/Users/trietnguyen/Documents/Company/BRE/App/CRM/.env.local", "utf-8");
const DB = env.match(/DATABASE_URL\s*=\s*['"]?([^'"\n]+)['"]?/)?.[1];
const sql = postgres(DB);

const wb = XLSX.readFile("/Users/trietnguyen/Documents/Company/BRE/App/CRM/data-excel/BAO CAO DOANH THU.xlsx", { cellDates: true, cellNF: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["2.3_Gia von"], { header: 1, raw: true, defval: null });

// Cột 2.3: 1=Ngày ĐC, 2=Tên NV, 3=Mã SP, 15=%HH sale, 21=PMG LK đợt này, 24=Hỗ trợ khách,
//   25=CĐT thưởng NVKD, 27=CĐT thưởng QL, 31=KPI CEO amt, 35=KPI TPKD amt, 37=KPI Admin amt, 38=Tổng phải trả

// Loại chi trong Excel (parse dòng có amount > 0)
function parseExcelRow(r) {
  const items = [];
  const push = (loai, amt) => { if (amt && Math.abs(amt) > 0.5) items.push({ loai, amt }); };
  push("HH sale", Number(r[21] ?? 0));
  push("Hỗ trợ khách", Number(r[24] ?? 0));
  push("CĐT thưởng NVKD", Number(r[25] ?? 0));
  push("CĐT thưởng QL", Number(r[27] ?? 0));
  push("KPI CEO", Number(r[31] ?? 0));
  push("KPI TPKD", Number(r[35] ?? 0));
  push("KPI Admin", Number(r[37] ?? 0));
  return items;
}

// Group Excel rows by product_code
const excelPerProduct = new Map();
for (let i = 4; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const productCode = r[3];
  const total = Number(r[38] ?? 0);
  if (!productCode || !total) continue;
  const items = parseExcelRow(r);
  const employee = r[2];
  const excelRow = i + 1;
  const cur = excelPerProduct.get(productCode) || [];
  cur.push({ excelRow, employee, items, total });
  excelPerProduct.set(productCode, cur);
}

// Load DB cost_reconciliations + activity_logs actor
const dbRows = await sql`
  SELECT p.product_code, cr.id, cr.cost_type, cr.employee_name, cr.reconciliation_date, cr.amount_payable_this_time,
    (SELECT actor_email FROM activity_logs
      WHERE entity_type='cost_reconciliation' AND entity_id=cr.id AND action='create'
      ORDER BY created_at LIMIT 1) AS actor
  FROM cost_reconciliations cr
  JOIN products p ON p.id = cr.product_id
`;
const dbPerProduct = new Map();
for (const r of dbRows) {
  const cur = dbPerProduct.get(r.product_code) || [];
  cur.push(r);
  dbPerProduct.set(r.product_code, cur);
}

// Compare: for each product, find items in Excel that don't match anything in DB
const COST_TYPE_LABEL = {
  sale_commission: "HH sale",
  customer_support: "Hỗ trợ khách",
  cdt_bonus_sale: "CĐT thưởng NVKD",
  cdt_bonus_manager: "CĐT thưởng QL",
  kpi_ceo: "KPI CEO",
  kpi_tpkd: "KPI TPKD",
  kpi_admin: "KPI Admin",
};
function excelLoaiToCostType(loai) {
  return Object.entries(COST_TYPE_LABEL).find(([, v]) => v === loai)?.[0];
}

const report = [];
for (const [code, excelRows] of excelPerProduct) {
  const dbList = dbPerProduct.get(code) || [];
  // Build DB "consumed" tracking (mark matched)
  const dbUsed = new Set();
  const missingItems = [];
  for (const eRow of excelRows) {
    for (const item of eRow.items) {
      const costType = excelLoaiToCostType(item.loai);
      // find DB row: same cost_type, amount within 1000, not yet used
      const match = dbList.find(d =>
        !dbUsed.has(d.id) &&
        d.cost_type === costType &&
        Math.abs(Number(d.amount_payable_this_time) - item.amt) < 1000
      );
      if (match) dbUsed.add(match.id);
      else missingItems.push({ ...item, employee: eRow.employee, excelRow: eRow.excelRow });
    }
  }
  const excelTotal = excelRows.reduce((s, r) => s + r.total, 0);
  const dbTotal = dbList.reduce((s, r) => s + Number(r.amount_payable_this_time), 0);
  const diff = excelTotal - dbTotal;
  if (Math.abs(diff) < 1000) continue;
  // Actors from DB rows (people who created recon for this căn)
  const actors = [...new Set(dbList.map(d => d.actor).filter(Boolean))];
  report.push({ code, excelCount: excelRows.length, dbCount: dbList.length, excelTotal, dbTotal, diff, missingItems, actors });
}
report.sort((a, b) => b.diff - a.diff);

// Markdown table output
let md = `# Báo cáo căn thiếu giá vốn (Excel BC DT vs App)\n\n`;
md += `Tổng ${report.length} căn có diff > 1.000 VND.\n\n`;
md += `| # | Mã căn | Excel (dòng) | App (recon) | Thiếu (VND) | Chi tiết thiếu | Người nhập app (recon đã có) |\n`;
md += `|---|---|---:|---:|---:|---|---|\n`;
report.forEach((r, i) => {
  const details = r.missingItems.map(m => `${m.loai}: ${m.amt.toLocaleString("vi-VN")}${m.employee ? ` (${m.employee})` : ""}`).join("<br>");
  const actors = r.actors.length > 0 ? r.actors.join(", ") : "_(chưa nhập)_";
  md += `| ${i + 1} | \`${r.code}\` | ${r.excelCount} | ${r.dbCount} | **${r.diff.toLocaleString("vi-VN")}** | ${details} | ${actors} |\n`;
});

const totalMissing = report.reduce((s, r) => s + r.diff, 0);
md += `\n**Tổng thiếu: ${totalMissing.toLocaleString("vi-VN")} VND** trên ${report.length} căn.\n`;

writeFileSync("/private/tmp/claude-501/-Users-trietnguyen-Documents-Company-Artonis-App/c4eb3248-a73f-4c72-8834-543d05b447d1/scratchpad/missing_cost_report.md", md);
console.log(md);
await sql.end();
