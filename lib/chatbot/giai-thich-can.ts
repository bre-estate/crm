import "server-only";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Gom đủ ba nguồn giải thích cho một căn, để chatbot trả lời được câu hỏi
 * "vì sao con số này lại như vậy".
 *
 * Ba nguồn và người phụ trách, theo đúng cách BRE vận hành:
 *
 *   1. HỢP ĐỒNG với đối tác, quyết định %PMG và phí admin.  Sale Admin
 *   2. ĐỐI CHIẾU từng đợt, quyết định tiến độ chi trả và %PMG lũy kế.  Sale Admin
 *   3. CHÍNH SÁCH nội bộ, quyết định %HH sale và các KPI.  HR
 *
 * Trả về cả dữ kiện đầu vào lẫn số đã tính, để mô hình trình bày được phép
 * tính chứ không chỉ đọc kết quả. Có thêm phần so sánh hợp đồng với cấu hình
 * trên căn, vì "vì sao khác nhau" thường nằm đúng chỗ lệch đó.
 */

export interface GiaiThichCan {
  can: Record<string, unknown>;
  hopDong: Record<string, unknown> | null;
  doanhThu: Record<string, unknown>;
  giaVon: Record<string, unknown>;
  luuY: string[];
}

const soHoac0 = (v: unknown) => Number(v ?? 0);

/** Chính sách nội bộ đang hiệu lực tại một ngày, theo từng vai trò. */
async function chinhSachTaiNgay(ngay: string | null) {
  const moc = ngay || new Date().toISOString().slice(0, 10);
  return (await db.execute(sql`
    SELECT role, effective_from, effective_to, base_rate, note
    FROM commission_policies
    WHERE effective_from <= ${moc}
      AND (effective_to IS NULL OR effective_to >= ${moc})
    ORDER BY role
  `)) as unknown as Array<Record<string, unknown>>;
}

export async function giaiThichCan(maCan: string): Promise<GiaiThichCan | null> {
  const code = maCan.trim();
  if (!code) return null;

  const [p] = (await db.execute(sql`
    SELECT p.*, pr.name AS du_an, pr.full_code AS ma_du_an,
           pt.name AS doi_tac, d.name AS phong
    FROM products p
    LEFT JOIN projects pr ON pr.id = p.project_id
    LEFT JOIN partners pt ON pt.id = pr.partner_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE UPPER(p.unit_code) = UPPER(${code})
       OR UPPER(p.product_code) = UPPER(${code})
    ORDER BY p.id DESC LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;
  if (!p) return null;

  const idCan = Number(p.id);
  const luuY: string[] = [];

  // ── Nguồn 1: hợp đồng với đối tác ──────────────────────────────────────
  const [hd] = (await db.execute(sql`
    SELECT contract_number, status, pmg_lk, pmg_lk_sale, admin_fee, admin_fee_sale,
           cdt_bonus_sale, cdt_bonus_manager, pmg_structure, pmg_tiers,
           pmg_metric, pmg_retroactive, pmg_notes, payment_phases
    FROM contracts WHERE project_id = ${Number(p.project_id)} LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;

  // Hợp đồng là mức chung của dự án, căn có thể được cấu hình khác. Chênh ở
  // đây thường chính là câu trả lời cho "vì sao căn này khác căn kia".
  const soSanh: Array<Record<string, unknown>> = [];
  if (hd) {
    const cap = [
      ["%PMG_LK", "pmg_lk", "pmg_rate"],
      ["%PMG_LK_sale", "pmg_lk_sale", "pmg_sale_rate"],
      ["Phí admin", "admin_fee", "admin_fee"],
      ["Phí admin sale", "admin_fee_sale", "admin_fee_sale"],
      ["CĐT thưởng sale", "cdt_bonus_sale", "cdt_bonus_sale"],
      ["CĐT thưởng QL", "cdt_bonus_manager", "cdt_bonus_manager"],
    ] as const;
    for (const [ten, cotHd, cotCan] of cap) {
      const a = soHoac0(hd[cotHd]);
      const b = soHoac0(p[cotCan]);
      if (Math.abs(a - b) > 0.0000001) {
        soSanh.push({ chi_tieu: ten, theo_hop_dong: a, cau_hinh_tren_can: b, lech: b - a });
      }
    }
    if (soSanh.length > 0) {
      luuY.push(
        `Căn này có ${soSanh.length} chỉ tiêu cấu hình khác mức chung của hợp đồng dự án. Xem phần hopDong.khac_voi_hop_dong.`,
      );
    }
  } else {
    luuY.push("Dự án này chưa nhập hợp đồng, nên không đối chiếu được %PMG với hợp đồng gốc.");
  }

  // ── Nguồn 2: các đợt đối chiếu doanh thu ───────────────────────────────
  // Đọc kỹ tên cột, vài cái đặt tên lệch nghĩa:
  //   phase_pct_this_time  tiến độ LŨY KẾ của căn, giá trị 0 tới 1, không phải
  //                        phần tăng thêm của đợt. Không được cộng dồn.
  //   pmg_cumulative_pct   TỶ LỆ %PMG áp dụng cho đợt (0,065 = 6,5%), không
  //                        phải phần trăm tiến độ.
  //   payment_progress_pct toàn bộ đang bằng 0, cột chưa dùng.
  const dot = (await db.execute(sql`
    SELECT r.phase_number AS dot, r.reconciliation_date AS ngay,
           r.phase_pct_this_time AS tien_do_luy_ke,
           r.pmg_cumulative_pct AS ty_le_pmg_ap_dung,
           r.revenue_this_time AS doanh_thu_dot,
           r.cdt_bonus_sale, r.cdt_bonus_manager,
           r.total_receivable_this_time AS phai_thu_dot,
           r.revenue_remaining AS con_lai_theo_file,
           COALESCE((SELECT SUM(pi.amount) FROM payments_in pi
                     WHERE pi.reconciliation_id = r.id), 0)::float8 AS da_thu_dot
    FROM revenue_reconciliations r
    WHERE r.product_id = ${idCan}
    ORDER BY r.reconciliation_date, r.id
  `)) as unknown as Array<Record<string, unknown>>;

  // Đổi phân số sang phần trăm và làm tròn, không thì ra 7.000000000000001%
  // rồi mô hình đọc nguyên vào câu trả lời.
  for (const d of dot) {
    d.tien_do_luy_ke = Math.round(soHoac0(d.tien_do_luy_ke) * 1000) / 10;
    d.ty_le_pmg_ap_dung = Math.round(soHoac0(d.ty_le_pmg_ap_dung) * 10000) / 100;
    d.don_vi = "tien_do_luy_ke và ty_le_pmg_ap_dung đã đổi sang phần trăm";
  }

  const tongPhaiThu = dot.reduce((a, d) => a + soHoac0(d.phai_thu_dot), 0);
  const daThu = dot.reduce((a, d) => a + soHoac0(d.da_thu_dot), 0);

  // Tiến độ là số lũy kế, lấy ở dòng có giá trị lớn nhất chứ không cộng dồn.
  const tienDo = dot.reduce((m, d) => Math.max(m, soHoac0(d.tien_do_luy_ke)), 0); // đã là phần trăm
  const dotCuoi = [...dot].reverse().find((d) => soHoac0(d.con_lai_theo_file) > 0);

  if (dot.length > 1) {
    luuY.push(
      "tien_do_luy_ke là số LŨY KẾ của căn (0 tới 1), không phải phần tăng thêm từng đợt. Không được cộng dồn. ty_le_pmg_ap_dung là tỷ lệ %PMG chứ không phải tiến độ.",
    );
  }

  // ── Nguồn 3: chính sách nội bộ và giá vốn ──────────────────────────────
  const ngayMoc = (p.deposit_date as string | null) ?? null;
  const chinhSach = await chinhSachTaiNgay(ngayMoc);

  const giaTinh = soHoac0(p.pmg_base_price);
  const tyLeSale = soHoac0(p.pmg_sale_rate) || soHoac0(p.pmg_rate);
  const goc = (giaTinh * tyLeSale - soHoac0(p.admin_fee_sale)) / 1.1 - soHoac0(p.customer_support);

  const LOAI = [
    ["Hoa hồng sale", "sale_commission", soHoac0(p.sale_commission_rate), true],
    ["KPI CEO", "kpi_ceo", soHoac0(p.kpi_ceo_rate), true],
    ["KPI trưởng phòng", "kpi_tpkd", soHoac0(p.kpi_tpkd_rate), true],
    ["KPI admin", "kpi_admin", soHoac0(p.kpi_admin_rate), true],
    ["CĐT thưởng sale", "cdt_bonus_sale", soHoac0(p.cdt_bonus_sale), false],
    ["CĐT thưởng quản lý", "cdt_bonus_manager", soHoac0(p.cdt_bonus_manager), false],
    ["Công ty thưởng sale", "bonus_sale", soHoac0(p.bonus_sale), false],
    ["Công ty thưởng quản lý", "bonus_manager", soHoac0(p.bonus_manager), false],
    ["Hỗ trợ khách", "customer_support", soHoac0(p.customer_support), false],
  ] as const;

  const daDc = (await db.execute(sql`
    SELECT c.cost_type,
           COALESCE(SUM(c.amount_payable_this_time), 0)::float8 AS da_doi_chieu,
           COUNT(*)::int AS so_dot,
           COALESCE((SELECT SUM(o.amount) FROM payments_out o
                     WHERE o.cost_reconciliation_id IN (
                       SELECT c2.id FROM cost_reconciliations c2
                       WHERE c2.product_id = ${idCan} AND c2.cost_type = c.cost_type
                     )), 0)::float8 AS da_chi
    FROM cost_reconciliations c
    WHERE c.product_id = ${idCan}
    GROUP BY c.cost_type
  `)) as unknown as Array<Record<string, unknown>>;
  const theoLoai = new Map(daDc.map((r) => [String(r.cost_type), r]));

  const khoanGiaVon = LOAI.filter(([, , tyLe]) => tyLe > 0).map(([ten, ma, tyLe, theoTyLe]) => {
    const tran = theoTyLe ? Math.round(goc * tyLe) : tyLe;
    const r = theoLoai.get(ma);
    const dc = soHoac0(r?.da_doi_chieu);
    return {
      loai: ten,
      ma,
      cach_tinh: theoTyLe ? `${(tyLe * 100).toFixed(2)}% trên cơ sở tính` : "số cố định",
      tran,
      da_doi_chieu: dc,
      so_dot: Number(r?.so_dot ?? 0),
      da_chi: soHoac0(r?.da_chi),
      con_duoc_doi_chieu: Math.max(0, tran - dc),
      vuot_tran: dc - tran > 1000 ? dc - tran : 0,
    };
  });

  const vuot = khoanGiaVon.filter((k) => k.vuot_tran > 0);
  if (vuot.length > 0) {
    luuY.push(
      `${vuot.length} loại đã đối chiếu vượt trần. Thường do trần tính theo cấu hình hiện tại còn số đã chi theo cấu hình cũ, cần hỏi lại kế toán.`,
    );
  }

  return {
    can: {
      ma_can: p.unit_code,
      ma_san_pham: p.product_code,
      du_an: p.du_an,
      doi_tac: p.doi_tac,
      khach_hang: p.customer_name,
      nvkd: p.sales_person,
      phong_ghi_nhan: p.phong,
      ngay_coc: p.deposit_date,
      gia_tinh_pmg: giaTinh,
    },
    hopDong: hd
      ? {
          nguon: "Hợp đồng với đối tác",
          ai_phu_trach: "Sale Admin",
          so_hop_dong: hd.contract_number,
          trang_thai: hd.status,
          pmg_lk: hd.pmg_lk,
          pmg_lk_sale: hd.pmg_lk_sale,
          phi_admin: hd.admin_fee,
          phi_admin_sale: hd.admin_fee_sale,
          cdt_thuong_sale: hd.cdt_bonus_sale,
          cdt_thuong_ql: hd.cdt_bonus_manager,
          cau_truc_pmg: hd.pmg_structure,
          bac_pmg: hd.pmg_tiers,
          tinh_theo: hd.pmg_metric,
          hoi_to: hd.pmg_retroactive,
          so_dot_thanh_toan: hd.payment_phases,
          ghi_chu: hd.pmg_notes,
          khac_voi_hop_dong: soSanh,
        }
      : null,
    doanhThu: {
      nguon: "File đối chiếu từng đợt",
      ai_phu_trach: "Sale Admin",
      so_dot: dot.length,
      tien_do_doi_chieu_phan_tram: tienDo,
      phan_tram_chua_doi_chieu: Math.round((100 - tienDo) * 10) / 10,
      so_tien_chua_doi_chieu_theo_file: soHoac0(dotCuoi?.con_lai_theo_file),
      tong_phai_thu: tongPhaiThu,
      da_thu: daThu,
      con_phai_thu_cua_phan_da_doi_chieu: tongPhaiThu - daThu,
      giai_thich:
        "tien_do_doi_chieu_phan_tram là phần trăm giá trị căn đã được đối chiếu với đối tác. phan_tram_chua_doi_chieu là phần còn lại sẽ đối chiếu ở các đợt sau. con_phai_thu_cua_phan_da_doi_chieu chỉ tính trên phần đã đối chiếu, không gồm phần chưa đối chiếu.",
      cac_dot: dot,
    },
    giaVon: {
      nguon: "Chính sách nội bộ",
      ai_phu_trach: "HR",
      co_so_tinh: Math.round(goc),
      cong_thuc_co_so:
        "(giá tính PMG × %PMG_LK_sale − phí admin sale) / 1,1 − hỗ trợ khách",
      chinh_sach_hieu_luc_tai_ngay_coc: chinhSach,
      cac_khoan: khoanGiaVon,
    },
    luuY,
  };
}
