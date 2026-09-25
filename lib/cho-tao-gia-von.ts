import "server-only";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Căn đã nhận tiền từ chủ đầu tư, nhắc kế toán và nhân sự vào tạo đối chiếu giá vốn.
 *
 * Quy trình thật ở BRE: chủ đầu tư chi trả theo từng đợt. Tiền về đợt nào thì tới lượt
 * lập đối chiếu giá vốn cho căn đó, gồm ĐỦ BỘ các loại đang cấu hình trên căn: hoa hồng
 * sale, thưởng chủ đầu tư, KPI cho CEO, trưởng phòng và admin.
 *
 * Không ghép một đợt doanh thu với một đợt giá vốn, vì không có mối nối đó trong dữ liệu
 * và nghiệp vụ cũng không làm vậy. Chỉ cần trả lời hai câu hỏi cho từng căn:
 *   1. Tiền mới về mà chưa đụng tới giá vốn lần nào sau đó chưa?
 *   2. Loại giá vốn nào đang cấu hình trên căn mà chưa có đợt nào?
 */

/**
 * Trần PMG viết thẳng ra biểu thức, KHÔNG dùng bí danh cột.
 * Postgres không cho tham chiếu bí danh của cột này ở cột khác trong cùng một SELECT.
 */
const PMG = "(COALESCE(p.pmg_base_price,0) * COALESCE(p.pmg_rate,0))";

/** Các loại giá vốn của một căn, kèm mức trần lấy từ cấu hình trên căn. */
const LOAI = [
  { ma: "sale_commission", ten: "Hoa hồng sale", tran: `${PMG} * COALESCE(p.sale_commission_rate,0)` },
  { ma: "cdt_bonus_sale", ten: "CĐT thưởng sale", tran: "COALESCE(p.cdt_bonus_sale,0)" },
  { ma: "cdt_bonus_manager", ten: "CĐT thưởng quản lý", tran: "COALESCE(p.cdt_bonus_manager,0)" },
  { ma: "bonus_sale", ten: "Công ty thưởng sale", tran: "COALESCE(p.bonus_sale,0)" },
  { ma: "bonus_manager", ten: "Công ty thưởng quản lý", tran: "COALESCE(p.bonus_manager,0)" },
  { ma: "kpi_ceo", ten: "KPI CEO", tran: `${PMG} * COALESCE(p.kpi_ceo_rate,0)` },
  { ma: "kpi_tpkd", ten: "KPI trưởng phòng", tran: `${PMG} * COALESCE(p.kpi_tpkd_rate,0)` },
  { ma: "kpi_admin", ten: "KPI admin", tran: `${PMG} * COALESCE(p.kpi_admin_rate,0)` },
  { ma: "customer_support", ten: "Hỗ trợ khách", tran: "COALESCE(p.customer_support,0)" },
] as const;

export interface LoaiGiaVon {
  ma: string;
  ten: string;
  tran: number;
  daDoiChieu: number;
  soDot: number;
}

export interface CanChoGiaVon {
  productId: number;
  maCan: string;
  duAn: string | null;
  nvkd: string | null;
  ngayThuCuoi: string;
  tienDaThu: number;
  ngayGiaVonCuoi: string | null;
  /** Tiền về sau lần lập giá vốn gần nhất, tức chắc chắn còn việc. */
  tienMoiVe: boolean;
  /** Loại có cấu hình trên căn nhưng chưa có đợt nào. */
  chuaTao: LoaiGiaVon[];
  /** Mọi loại có cấu hình, để hiện bảng kiểm đầy đủ. */
  tatCaLoai: LoaiGiaVon[];
}

export async function layCanChoGiaVon(boQuaLoai: string[] = []): Promise<CanChoGiaVon[]> {
  const cotTran = LOAI.map((l) => `${l.tran} AS tran_${l.ma}`).join(",\n      ");
  const cotDaDc = LOAI.map(
    (l) =>
      `COALESCE((SELECT sum(amount_payable_this_time) FROM cost_reconciliations c
         WHERE c.product_id = p.id AND c.cost_type = '${l.ma}'), 0)::float8 AS dc_${l.ma}`,
  ).join(",\n      ");
  const cotSoDot = LOAI.map(
    (l) =>
      `(SELECT count(*)::int FROM cost_reconciliations c
         WHERE c.product_id = p.id AND c.cost_type = '${l.ma}') AS n_${l.ma}`,
  ).join(",\n      ");

  const rows = (await db.execute(
    sql.raw(`
    WITH thu AS (
      SELECT r.product_id,
             max(pi.payment_date) AS ngay_thu_cuoi,
             sum(pi.amount)::float8 AS tien_thu
      FROM revenue_reconciliations r
      JOIN payments_in pi ON pi.reconciliation_id = r.id
      WHERE pi.payment_date IS NOT NULL
      GROUP BY r.product_id
    )
    SELECT p.id, p.unit_code, pj.name AS du_an, p.sales_person,
      t.ngay_thu_cuoi, t.tien_thu,
      (SELECT max(reconciliation_date) FROM cost_reconciliations c WHERE c.product_id = p.id) AS ngay_gv_cuoi,
      ${cotTran},
      ${cotDaDc},
      ${cotSoDot}
    FROM thu t
    JOIN products p ON p.id = t.product_id
    LEFT JOIN projects pj ON pj.id = p.project_id
    ORDER BY t.ngay_thu_cuoi DESC
  `),
  )) as unknown as Array<Record<string, unknown>>;

  const bo = new Set(boQuaLoai);
  const ra: CanChoGiaVon[] = [];

  for (const r of rows) {
    const ngayThu = String(r.ngay_thu_cuoi ?? "").slice(0, 10);
    const ngayGv = r.ngay_gv_cuoi == null ? null : String(r.ngay_gv_cuoi).slice(0, 10);
    const tienMoiVe = !ngayGv || ngayThu > ngayGv;

    const tatCaLoai: LoaiGiaVon[] = [];
    for (const l of LOAI) {
      if (bo.has(l.ma)) continue;
      const tran = Number(r[`tran_${l.ma}`] ?? 0);
      if (tran <= 0) continue; // căn không cấu hình loại này thì không phải việc
      tatCaLoai.push({
        ma: l.ma,
        ten: l.ten,
        tran,
        daDoiChieu: Number(r[`dc_${l.ma}`] ?? 0),
        soDot: Number(r[`n_${l.ma}`] ?? 0),
      });
    }
    const chuaTao = tatCaLoai.filter((x) => x.soDot === 0);
    if (!tienMoiVe && chuaTao.length === 0) continue;

    ra.push({
      productId: Number(r.id),
      maCan: String(r.unit_code ?? ""),
      duAn: r.du_an == null ? null : String(r.du_an),
      nvkd: r.sales_person == null ? null : String(r.sales_person),
      ngayThuCuoi: ngayThu,
      tienDaThu: Number(r.tien_thu ?? 0),
      ngayGiaVonCuoi: ngayGv,
      tienMoiVe,
      chuaTao,
      tatCaLoai,
    });
  }
  // Tiền mới về thì lên trước, rồi tới căn thiếu nhiều loại nhất.
  ra.sort((a, b) =>
    Number(b.tienMoiVe) - Number(a.tienMoiVe) ||
    b.chuaTao.length - a.chuaTao.length ||
    b.ngayThuCuoi.localeCompare(a.ngayThuCuoi));
  return ra;
}
