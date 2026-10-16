import { config } from "dotenv"; config({ path: ".env.local" });
import postgres from "postgres";
const f=(n:any)=>Math.round(Number(n||0)).toLocaleString("vi-VN");
async function main(){ const sql = postgres(process.env.DATABASE_URL!);
const rows:any = await sql`
WITH emp_paid AS (
  SELECT c.product_id, c.employee_name, c.cost_type, COALESCE(SUM(po.amount),0)::float8 AS paid
  FROM cost_reconciliations c LEFT JOIN payments_out po ON po.cost_reconciliation_id=c.id
  WHERE c.cost_type IN ('cdt_bonus_sale','cdt_bonus_manager')
  GROUP BY 1,2,3),
pr AS (SELECT product_id,
  COALESCE(SUM(cdt_bonus_sale),0)::float8 AS bs, COALESCE(SUM(cdt_bonus_manager),0)::float8 AS bm,
  COALESCE(MIN(cdt_bonus_sale),0)::float8 AS min_bs, COALESCE(MIN(cdt_bonus_manager),0)::float8 AS min_bm
  FROM revenue_reconciliations GROUP BY 1)
SELECT p.unit_code, ep.employee_name, ep.cost_type, ep.paid,
  CASE WHEN ep.cost_type='cdt_bonus_sale' THEN COALESCE(pr.bs,0) ELSE COALESCE(pr.bm,0) END AS rev,
  CASE WHEN ep.cost_type='cdt_bonus_sale' THEN COALESCE(pr.min_bs,0) ELSE COALESCE(pr.min_bm,0) END AS min_rev,
  p.cdt_bonus_sale AS cfg_bs, p.cdt_bonus_manager AS cfg_bm
FROM emp_paid ep LEFT JOIN pr ON pr.product_id=ep.product_id
LEFT JOIN products p ON p.id=ep.product_id
WHERE ep.paid > 0 ORDER BY p.unit_code`;
const hien = rows.filter((r:any)=>Number(r.paid)-Math.max(0,Number(r.rev)) > 1000);
console.log("Số mục đang hiện cảnh báo:", hien.length, "/", rows.length, "\n");
console.table(hien.map((r:any)=>({can:r.unit_code,ai:r.employee_name,loai:r.cost_type,
  daTra:f(r.paid), cdtTra:f(r.rev), coDongAm: Number(r.min_rev)<0 ? "CÓ" : "không",
  congBo:f(r.cost_type==='cdt_bonus_sale'?r.cfg_bs:r.cfg_bm),
  chenh:f(Number(r.paid)-Math.max(0,Number(r.rev)))})));
await sql.end(); }
main();
