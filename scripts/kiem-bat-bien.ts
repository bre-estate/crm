/**
 * Kiểm bộ bất biến của dữ liệu doanh thu và giá vốn.
 *
 * Mỗi trường số quan trọng gắn với một phép thử chạy được, để biết đúng sai
 * mà không phải suy đoán. Chạy trước khi khẳng định bất cứ điều gì về số
 * liệu, và chạy lại sau mỗi lần sửa dữ liệu.
 *
 *   npx tsx --env-file=.env.local scripts/kiem-bat-bien.ts
 *   npx tsx --env-file=.env.local scripts/kiem-bat-bien.ts --chi-tiet
 *
 * Thoát với mã 1 nếu có phép thử gãy, để dùng được trong quy trình tự động.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const CHI_TIET = process.argv.includes("--chi-tiet");
const sql = postgres(process.env.DATABASE_URL!);

const N = (v: unknown) => Number(v ?? 0);
const tien = (n: number) => Math.round(n).toLocaleString("vi-VN");

/** Dưới mức này là sai số làm tròn, không phải lỗi. */
const NGUONG = 5_000;
const DUNG_SAI = 0.001;

/** Năm loại ghi số cố định trên căn, công thức không dùng %PMG_LK_sale. */
const KHOAN_CO_DINH = new Set([
  "bonus_sale",
  "bonus_manager",
  "cdt_bonus_sale",
  "cdt_bonus_manager",
  "customer_support",
]);

type KetQua = { ten: string; moTa: string; tong: number; sai: string[] };
const ketQua: KetQua[] = [];

function thu<T>(
  ten: string,
  moTa: string,
  ds: T[],
  dung: (x: T) => boolean,
  ta: (x: T) => string,
): void {
  const sai = ds.filter((x) => !dung(x)).map(ta);
  ketQua.push({ ten, moTa, tong: ds.length, sai });
}

async function main() {
  const p = await sql`SELECT * FROM products`;
  const rr = await sql`SELECT * FROM revenue_reconciliations`;
  const cr = await sql`SELECT * FROM cost_reconciliations`;
  const can = new Map(p.map((x) => [x.id as number, x]));
  const maCan = (id: number) => String(can.get(id)?.unit_code ?? id);

  // ───────────────────────── products ─────────────────────────
  thu("pmg_base_price > 0", "giá tính PMG phải dương", p,
    (x) => N(x.pmg_base_price) > 0, (x) => `${x.unit_code}: ${tien(N(x.pmg_base_price))}`);

  thu("other_fee_pct = 0", "đã gộp vào pmg_rate ở migration 0061, khác 0 là bị hồi sinh", p,
    (x) => N(x.other_fee_pct) === 0, (x) => `${x.unit_code}: ${x.other_fee_pct}`);

  thu("pmg_sale_rate <= pmg_rate", "cơ sở giá vốn không cao hơn cơ sở doanh thu", p,
    (x) => N(x.pmg_sale_rate) <= N(x.pmg_rate) + 1e-9,
    (x) => `${x.unit_code}: sale ${x.pmg_sale_rate} > pmg ${x.pmg_rate}`);

  thu("0 < pmg_rate <= 0,1", "tỷ lệ dạng phân số, không phải phần trăm nhân 100", p,
    (x) => N(x.pmg_rate) > 0 && N(x.pmg_rate) <= 0.1, (x) => `${x.unit_code}: ${x.pmg_rate}`);

  thu("sale_commission_rate <= 1", "%HH lưu dạng phân số", p,
    (x) => N(x.sale_commission_rate) <= 1, (x) => `${x.unit_code}: ${x.sale_commission_rate}`);

  // ──────────────── revenue_reconciliations ────────────────
  thu("tổng phải thu = hoa hồng + hai khoản CĐT thưởng", "cộng ba thành phần phải ra cột tổng", rr,
    (x) => Math.abs(N(x.total_receivable_this_time) -
      (N(x.revenue_this_time) + N(x.cdt_bonus_sale) + N(x.cdt_bonus_manager))) < 2,
    (x) => `ĐC ${x.id} ${maCan(x.product_id as number)}: tổng ${tien(N(x.total_receivable_this_time))}`);

  thu("0 <= phase_pct_this_time <= 1", "tiến độ là LŨY KẾ, không cộng dồn giữa các đợt", rr,
    (x) => N(x.phase_pct_this_time) >= 0 && N(x.phase_pct_this_time) <= 1 + DUNG_SAI,
    (x) => `ĐC ${x.id} ${maCan(x.product_id as number)}: ${x.phase_pct_this_time}`);

  thu("pmg_cumulative_pct <= 0,1", "đây là TỶ LỆ PMG, không phải tiến độ. Nhầm hai cột đã gây lỗi nhiều lần", rr,
    (x) => N(x.pmg_cumulative_pct) <= 0.1,
    (x) => `ĐC ${x.id} ${maCan(x.product_id as number)}: ${x.pmg_cumulative_pct}`);

  const hhTheoCan = new Map<number, number>();
  for (const r of rr)
    hhTheoCan.set(r.product_id as number,
      (hhTheoCan.get(r.product_id as number) ?? 0) + N(r.revenue_this_time));
  thu("lũy kế hoa hồng <= PMG × %PMG_LK", "trần doanh thu theo hợp đồng",
    [...hhTheoCan.entries()],
    ([id, v]) => {
      const c = can.get(id);
      const tran = N(c?.pmg_base_price) * (N(c?.pmg_rate) + N(c?.other_fee_pct));
      return tran <= 0 || v <= tran * (1 + DUNG_SAI) || v - tran <= NGUONG;
    },
    ([id, v]) => {
      const c = can.get(id);
      const tran = N(c?.pmg_base_price) * (N(c?.pmg_rate) + N(c?.other_fee_pct));
      return `${maCan(id)}: ${tien(v)} / trần ${tien(tran)}, vượt ${tien(v - tran)}`;
    });

  // ───────────────── cost_reconciliations ─────────────────
  thu("employee_name không rỗng", "không có tên thì tiền không vào bảng lương ai", cr,
    (x) => !!String(x.employee_name ?? "").trim(),
    (x) => `ĐC ${x.id} ${maCan(x.product_id as number)}: ${tien(N(x.amount_payable_this_time))}`);

  thu("payment_progress_pct <= 1", "tiến độ khách đóng không quá 100%", cr,
    (x) => N(x.payment_progress_pct) <= 1 + DUNG_SAI,
    (x) => `ĐC ${x.id} ${maCan(x.product_id as number)}: ${x.payment_progress_pct}`);

  thu("commission_rate <= 1", "%HH lưu dạng phân số", cr,
    (x) => N(x.commission_rate) <= 1, (x) => `ĐC ${x.id}: ${x.commission_rate}`);

  thu("pmg_lk_sale_rate <= products.pmg_sale_rate",
    "chỉ áp cho loại tính theo tỷ lệ, bỏ qua năm khoản cố định",
    cr.filter((x) => !KHOAN_CO_DINH.has(x.cost_type as string) && N(x.pmg_lk_sale_rate) > 0),
    (x) => N(x.pmg_lk_sale_rate) <= N(can.get(x.product_id as number)?.pmg_sale_rate) * (1 + DUNG_SAI),
    (x) => `ĐC ${x.id} ${maCan(x.product_id as number)} ${x.cost_type}: ghi ${x.pmg_lk_sale_rate}, hợp đồng ${can.get(x.product_id as number)?.pmg_sale_rate}`);

  // ───────────────────────── in kết quả ─────────────────────────
  let gay = 0;
  console.log("KIỂM BẤT BIẾN DỮ LIỆU\n");
  for (const k of ketQua) {
    const ok = k.sai.length === 0;
    if (!ok) gay++;
    console.log(`${ok ? "✓" : "✗"} ${k.ten.padEnd(44)} ${ok ? `${k.tong} dòng đều đúng` : `SAI ${k.sai.length}/${k.tong}`}`);
    console.log(`   ${k.moTa}`);
    if (!ok) for (const d of k.sai.slice(0, CHI_TIET ? 999 : 5)) console.log(`     · ${d}`);
    if (!ok && !CHI_TIET && k.sai.length > 5) console.log(`     · còn ${k.sai.length - 5} dòng, chạy kèm --chi-tiet để xem hết`);
    console.log();
  }
  console.log(gay === 0
    ? `Tất cả ${ketQua.length} phép thử đều đúng.`
    : `${gay} / ${ketQua.length} phép thử gãy. Xem trang /reports/soat-du-lieu để có phép tính đầy đủ.`);
  process.exit(gay === 0 ? 0 : 1);
}

main();
