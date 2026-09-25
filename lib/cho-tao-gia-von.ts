import "server-only";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Căn đã nhận tiền từ chủ đầu tư nhưng giá vốn chưa theo kịp.
 *
 * Quy trình thật ở BRE: một căn đối chiếu doanh thu nhiều lần theo tiến độ chủ đầu tư
 * chi trả. Mỗi lần tiền về, kế toán mới lập đối chiếu giá vốn để chi hoa hồng cho sale
 * và KPI cho quản lý. Nên mốc để nhắc HR là NGÀY NHẬN TIỀN, không phải ngày đối chiếu
 * doanh thu.
 *
 * Cách nhận biết: không có cách nối trực tiếp giữa một đợt doanh thu và một đợt giá vốn,
 * vì một đợt doanh thu đẻ ra nhiều dòng giá vốn (hoa hồng sale, thưởng CĐT, KPI CEO,
 * KPI TPKD, thưởng admin). Nên so theo MỐC THỜI GIAN: ngày nhận tiền gần nhất mà muộn
 * hơn ngày đối chiếu giá vốn gần nhất thì coi như còn việc phải làm.
 */

export interface CanChoGiaVon {
  productId: number;
  maCan: string;
  maSanPham: string;
  duAn: string | null;
  nvkd: string | null;
  phong: string | null;
  ngayThuCuoi: string;
  soDotDaThu: number;
  tienDaThu: number;
  ngayGiaVonCuoi: string | null;
  soDotGiaVon: number;
  /** Trần hoa hồng sale theo hợp đồng trừ đi phần đã đối chiếu, để HR biết còn khoảng bao nhiêu. */
  hoaHongConLai: number;
}

export async function layCanChoGiaVon(): Promise<CanChoGiaVon[]> {
  const rows = (await db.execute(sql`
    WITH thu AS (
      SELECT r.product_id,
             max(pi.payment_date) AS ngay_thu_cuoi,
             count(DISTINCT r.id)::int AS so_dot_thu,
             sum(pi.amount)::float8 AS tien_thu
      FROM revenue_reconciliations r
      JOIN payments_in pi ON pi.reconciliation_id = r.id
      WHERE pi.payment_date IS NOT NULL
      GROUP BY r.product_id
    ), gv AS (
      SELECT product_id,
             max(reconciliation_date) AS ngay_gv_cuoi,
             count(*)::int AS so_dot_gv,
             COALESCE(sum(amount_payable_this_time) FILTER (WHERE cost_type = 'sale_commission'), 0)::float8 AS hh_da_dc
      FROM cost_reconciliations
      GROUP BY product_id
    )
    SELECT p.id,
           p.unit_code,
           p.product_code,
           pj.name AS du_an,
           p.sales_person,
           p.dept_name,
           t.ngay_thu_cuoi,
           t.so_dot_thu,
           t.tien_thu,
           g.ngay_gv_cuoi,
           COALESCE(g.so_dot_gv, 0)::int AS so_dot_gv,
           GREATEST(
             0,
             COALESCE(p.pmg_base_price, 0) * COALESCE(p.pmg_rate, 0) * COALESCE(p.sale_commission_rate, 0)
               - COALESCE(g.hh_da_dc, 0)
           )::float8 AS hh_con_lai
    FROM thu t
    JOIN products p ON p.id = t.product_id
    LEFT JOIN projects pj ON pj.id = p.project_id
    LEFT JOIN gv g ON g.product_id = t.product_id
    WHERE g.product_id IS NULL OR t.ngay_thu_cuoi > g.ngay_gv_cuoi
    ORDER BY t.ngay_thu_cuoi DESC
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    productId: Number(r.id),
    maCan: String(r.unit_code ?? ""),
    maSanPham: String(r.product_code ?? ""),
    duAn: r.du_an == null ? null : String(r.du_an),
    nvkd: r.sales_person == null ? null : String(r.sales_person),
    phong: r.dept_name == null ? null : String(r.dept_name),
    ngayThuCuoi: String(r.ngay_thu_cuoi ?? "").slice(0, 10),
    soDotDaThu: Number(r.so_dot_thu ?? 0),
    tienDaThu: Number(r.tien_thu ?? 0),
    ngayGiaVonCuoi: r.ngay_gv_cuoi == null ? null : String(r.ngay_gv_cuoi).slice(0, 10),
    soDotGiaVon: Number(r.so_dot_gv ?? 0),
    hoaHongConLai: Number(r.hh_con_lai ?? 0),
  }));
}
