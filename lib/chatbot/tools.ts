/**
 * Tools cho chatbot POC — 3 function LLM có thể call để trả lời câu hỏi số liệu.
 *
 * Extend: thêm 1 entry vào TOOL_SCHEMAS + implement trong TOOL_IMPL. Format
 * JSON schema theo OpenAI function calling convention.
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getEmployeeOverpaid } from "@/lib/employee-overpaid";

export const TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "getEmployeeCommission",
      description:
        "Lấy tổng HH sale ghi nhận + đã trả + còn nợ cho 1 nhân viên trong 1 kỳ. Dùng khi user hỏi 'HH của X bao nhiêu', 'X còn nợ bao nhiêu', 'X đã trả bao nhiêu HH'.",
      parameters: {
        type: "object",
        properties: {
          employeeName: {
            type: "string",
            description: "Tên nhân viên (VD: Đoàn Lê Bách). Case-insensitive.",
          },
          year: {
            type: "integer",
            description: "Năm (VD 2026). Bỏ trống = tất cả các năm.",
          },
        },
        required: ["employeeName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getEmployeeOverpaidList",
      description:
        "Liệt kê nhân viên nợ công ty do chi dư thưởng nóng (BRE đã trả nhưng CĐT hoàn). Dùng khi user hỏi 'ai đang nợ cty', 'chi dư bao nhiêu', 'X có nợ gì không'.",
      parameters: {
        type: "object",
        properties: {
          employeeName: {
            type: "string",
            description: "Lọc theo tên NV (tùy chọn). Bỏ trống = tất cả.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listUnitsByProject",
      description:
        "Liệt kê các căn thuộc 1 dự án (search theo tên dự án, VD 'Emerald Boulevard', 'Astral', 'The Emerald Garden View'). Trả về ngắn gọn mã căn + NVKD + trạng thái đối chiếu. Dùng khi user hỏi 'dự án X có căn nào', 'còn căn nào chưa đối chiếu', v.v. KHÔNG dùng để trả lời 'chính sách chung' vì mỗi căn có mức riêng.",
      parameters: {
        type: "object",
        properties: {
          projectName: {
            type: "string",
            description: "Tên dự án (partial match, case-insensitive).",
          },
          limit: {
            type: "integer",
            description: "Số căn tối đa trả về (default 50).",
          },
        },
        required: ["projectName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getProjectPolicy",
      description:
        "AGGREGATE mức áp dụng phổ biến của 1 dự án dựa trên các căn ĐÃ CHỐT: %HH sale, %PMG_LK, %PMG_LK_sale, phí admin, thưởng nóng CĐT. Trả về min/median/max + mode (mức phổ biến nhất). Dùng khi user hỏi 'chính sách dự án X', 'mức phổ biến của dự án X'. KHÔNG dùng nếu user hỏi về 1 căn cụ thể.",
      parameters: {
        type: "object",
        properties: {
          projectName: {
            type: "string",
            description: "Tên dự án (partial match, case-insensitive).",
          },
        },
        required: ["projectName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listAllProjectPolicies",
      description:
        "AGGREGATE mức phổ biến của TẤT CẢ dự án (mode %PMG, %HH sale, phí admin, thưởng nóng) — 1 row per dự án. Dùng khi user hỏi 'chính sách CĐT nào tốt nhất', 'so sánh chính sách các dự án', 'CĐT nào trả HH cao nhất'. Bot tự sort theo tiêu chí user hỏi (VD %HH sale cao = tốt cho BRE, thưởng nóng nhiều = ưu đãi tốt).",
      parameters: {
        type: "object",
        properties: {
          minUnits: {
            type: "integer",
            description: "Chỉ lấy dự án có ≥ N căn (default 1, để tránh dự án 1 căn skew ranking).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getARAging",
      description:
        "Tuổi nợ phải THU (AR aging): CĐT nào còn nợ BRE bao lâu, chia bucket 0-30/31-60/61-90/>90 ngày kể từ ngày đối chiếu doanh thu. Dùng khi user hỏi 'CĐT nào nợ mình', 'khoản còn thu bao nhiêu', 'nợ quá 90 ngày'.",
      parameters: {
        type: "object",
        properties: {
          partnerName: {
            type: "string",
            description: "Lọc theo tên CĐT (partial match, optional).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getAPAging",
      description:
        "Tuổi nợ phải TRẢ (AP aging): BRE còn nợ NVKD/CTV nào bao lâu, chia bucket 0-30/31-60/61-90/>90 ngày kể từ ngày đối chiếu giá vốn. Dùng khi user hỏi 'mình còn nợ ai', 'khoản NV nào nợ lâu nhất', 'cần trả gấp cho ai'.",
      parameters: {
        type: "object",
        properties: {
          employeeName: {
            type: "string",
            description: "Lọc theo tên NV (partial match, optional).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getObligations",
      description:
        "Nghĩa vụ tài chính tổng hợp (OWNER ONLY): còn thu từ CĐT, còn nợ sale team, nợ thuế (TK 3334/3335/33311), nợ BHXH (TK 3383/3384/3386), vị thế ròng. Dùng khi user hỏi 'còn nợ thuế bao nhiêu', 'nợ BHXH', 'vị thế tài chính'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getSalesReport",
      description:
        "Báo cáo doanh thu (BCDT kế toán) theo kỳ, group theo 1 trong 4 chiều: dự án / CĐT / NVKD / phòng KD. Dùng khi user hỏi 'DT quý 2', 'DT dự án X năm 2026', 'top NVKD doanh số', 'phòng nào DT cao'.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "integer", description: "Năm (VD 2026). Default năm hiện tại." },
          period: {
            type: "string",
            enum: ["year", "quarter", "month"],
            description: "Kỳ: cả năm / theo quý / theo tháng. Default year.",
          },
          quarter: { type: "integer", description: "Q1-Q4 (khi period=quarter)." },
          month: { type: "integer", description: "1-12 (khi period=month)." },
          groupBy: {
            type: "string",
            enum: ["project", "partner", "sales_person", "department"],
            description: "Chiều group. Default project.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getTopProjects",
      description:
        "AGGREGATE ranking dự án theo số căn đã bán, tổng doanh thu ghi nhận, tổng HH sale. Dùng khi user hỏi 'dự án nào BRE bán tốt nhất', 'top dự án theo doanh số', 'dự án nào nhiều căn nhất'.",
      parameters: {
        type: "object",
        properties: {
          year: {
            type: "integer",
            description: "Năm lọc theo ngày cọc (VD 2026). Bỏ trống = tất cả.",
          },
          limit: {
            type: "integer",
            description: "Số dự án top (default 10).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getUnitInfo",
      description:
        "Tra cứu thông tin căn theo mã căn (unit_code như 'A-07-09', 'B2-09-16'). Trả về NVKD, giá bán, %HH, %PMG, phòng KD, tình trạng đối chiếu.",
      parameters: {
        type: "object",
        properties: {
          unitCode: {
            type: "string",
            description: "Mã căn (VD: A-07-09, B2-09-16). Case-insensitive.",
          },
        },
        required: ["unitCode"],
      },
    },
  },
];

type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

async function getEmployeeCommission(args: {
  employeeName: string;
  year?: number;
}): Promise<ToolResult> {
  const name = args.employeeName.trim();
  if (!name) return { ok: false, error: "Thiếu tên nhân viên" };
  const year = args.year;
  const dateFilter = year
    ? sql`AND c.reconciliation_date BETWEEN ${year + "-01-01"} AND ${year + "-12-31"}`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT
      c.employee_name AS name,
      COUNT(DISTINCT c.product_id)::int AS units,
      COUNT(*)::int AS recons,
      COALESCE(SUM(c.amount_payable_this_time), 0)::float8 AS accrued,
      COALESCE((
        SELECT SUM(po.amount) FROM payments_out po
        WHERE po.cost_reconciliation_id IN (
          SELECT c2.id FROM cost_reconciliations c2
          WHERE LOWER(c2.employee_name) = LOWER(c.employee_name)
            AND c2.cost_type = 'sale_commission'
            ${dateFilter}
        )
      ), 0)::float8 AS paid
    FROM cost_reconciliations c
    WHERE LOWER(c.employee_name) = LOWER(${name})
      AND c.cost_type = 'sale_commission'
      ${dateFilter}
    GROUP BY c.employee_name
  `)) as unknown as Array<{
    name: string;
    units: number;
    recons: number;
    accrued: number;
    paid: number;
  }>;

  if (rows.length === 0) {
    return {
      ok: false,
      error: `Không tìm thấy HH sale cho "${name}"${year ? ` năm ${year}` : ""}`,
    };
  }
  const r = rows[0];
  return {
    ok: true,
    data: {
      name: r.name,
      year: year ?? "tất cả",
      soCan: r.units,
      soDoiChieu: r.recons,
      hhGhiNhan: Math.round(r.accrued),
      daTra: Math.round(r.paid),
      conNo: Math.max(0, Math.round(r.accrued - r.paid)),
    },
  };
}

async function getEmployeeOverpaidList(args: {
  employeeName?: string;
}): Promise<ToolResult> {
  const list = await getEmployeeOverpaid();
  const filtered = args.employeeName
    ? list.filter((r) =>
        r.employeeName.toLowerCase().includes(args.employeeName!.toLowerCase()),
      )
    : list;
  if (filtered.length === 0) {
    return {
      ok: true,
      data: {
        message: args.employeeName
          ? `${args.employeeName} không có nợ cty`
          : "Không có nhân viên nào đang nợ công ty",
        count: 0,
      },
    };
  }
  return {
    ok: true,
    data: {
      count: filtered.length,
      totalOwed: Math.round(filtered.reduce((s, r) => s + r.overpaid, 0)),
      items: filtered.map((r) => ({
        nhanVien: r.employeeName,
        can: r.productCode,
        loai: r.costType === "cdt_bonus_sale" ? "Thưởng nóng sale" : "Thưởng nóng QL",
        daTra: Math.round(r.paid),
        ctyNhanTuCDT: Math.round(r.revenueTotal),
        nvNoCty: Math.round(r.overpaid),
      })),
    },
  };
}

async function getUnitInfo(args: { unitCode: string }): Promise<ToolResult> {
  const code = args.unitCode.trim();
  if (!code) return { ok: false, error: "Thiếu mã căn" };

  const rows = (await db.execute(sql`
    SELECT
      p.id, p.product_code, p.unit_code, p.customer_name, p.sales_person,
      p.dept_name, p.sale_type, p.deposit_date,
      p.pmg_base_price, p.pmg_rate, p.pmg_sale_rate,
      p.sale_commission_rate, p.admin_fee,
      pr.name AS project_name,
      (SELECT COUNT(*)::int FROM cost_reconciliations WHERE product_id = p.id) AS n_cost_recons,
      (SELECT COUNT(*)::int FROM revenue_reconciliations WHERE product_id = p.id) AS n_rev_recons,
      -- Doanh thu ròng ghi nhận với CĐT (revenue chính + thưởng nóng)
      COALESCE((
        SELECT SUM(rr.revenue_this_time + COALESCE(rr.cdt_bonus_sale, 0) + COALESCE(rr.cdt_bonus_manager, 0))
        FROM revenue_reconciliations rr WHERE rr.product_id = p.id
      ), 0)::float8 AS revenue_recognized,
      -- Đã nhận thực tế từ CĐT (payments_in)
      COALESCE((
        SELECT SUM(pi.amount) FROM payments_in pi
        WHERE pi.reconciliation_id IN (
          SELECT id FROM revenue_reconciliations WHERE product_id = p.id
        )
      ), 0)::float8 AS revenue_received,
      -- HH sale ghi nhận cho NV (cost recon)
      COALESCE((
        SELECT SUM(cr.amount_payable_this_time)
        FROM cost_reconciliations cr
        WHERE cr.product_id = p.id AND cr.cost_type = 'sale_commission'
      ), 0)::float8 AS hh_recognized,
      -- HH sale đã trả cho NV (payments_out)
      COALESCE((
        SELECT SUM(po.amount) FROM payments_out po
        WHERE po.cost_reconciliation_id IN (
          SELECT id FROM cost_reconciliations
          WHERE product_id = p.id AND cost_type = 'sale_commission'
        )
      ), 0)::float8 AS hh_paid
    FROM products p
    LEFT JOIN projects pr ON pr.id = p.project_id
    WHERE UPPER(p.unit_code) = UPPER(${code}) OR UPPER(p.product_code) LIKE UPPER(${'%' + code + '%'})
    ORDER BY p.id DESC
    LIMIT 5
  `)) as unknown as Array<{
    id: number;
    product_code: string;
    unit_code: string;
    customer_name: string | null;
    sales_person: string | null;
    dept_name: string | null;
    sale_type: string;
    deposit_date: string | null;
    pmg_base_price: number;
    pmg_rate: number;
    pmg_sale_rate: number;
    sale_commission_rate: number;
    admin_fee: number;
    project_name: string | null;
    n_cost_recons: number;
    n_rev_recons: number;
    revenue_recognized: number;
    revenue_received: number;
    hh_recognized: number;
    hh_paid: number;
  }>;

  if (rows.length === 0) {
    return { ok: false, error: `Không tìm thấy căn "${code}"` };
  }

  return {
    ok: true,
    data: {
      soLuong: rows.length,
      items: rows.map((r) => {
        const revRecognized = Number(r.revenue_recognized ?? 0);
        const revReceived = Number(r.revenue_received ?? 0);
        const hhRecognized = Number(r.hh_recognized ?? 0);
        const hhPaid = Number(r.hh_paid ?? 0);
        return {
          id: r.id,
          maCan: r.product_code,
          maSp: r.unit_code,
          duAn: r.project_name,
          loaiGiaoDich: r.sale_type === "primary" ? "Sơ cấp" : "Thứ cấp",
          khach: r.customer_name,
          nvkd: r.sales_person,
          phong: r.dept_name,
          ngayCoc: r.deposit_date,
          giaTinhPMG: Math.round(Number(r.pmg_base_price)),
          pctPMG: Number(r.pmg_rate),
          pctPMGSale: Number(r.pmg_sale_rate),
          pctHHSale: Number(r.sale_commission_rate),
          phiAdmin: Math.round(Number(r.admin_fee)),
          soDoiChieuGiaVon: r.n_cost_recons,
          soDoiChieuDoanhThu: r.n_rev_recons,
          // Payment status: CĐT
          doanhThuGhiNhan: Math.round(revRecognized),
          daNhanTuCDT: Math.round(revReceived),
          conPhaiNhanTuCDT: Math.max(0, Math.round(revRecognized - revReceived)),
          pctDaNhanTuCDT:
            revRecognized > 0
              ? Math.round((revReceived / revRecognized) * 100)
              : 0,
          // HH sale status: NV
          hhSaleGhiNhan: Math.round(hhRecognized),
          hhSaleDaTraNV: Math.round(hhPaid),
          hhSaleConNoNV: Math.max(0, Math.round(hhRecognized - hhPaid)),
          linkChiTiet: `/products/${r.id}`,
        };
      }),
    },
  };
}

async function listUnitsByProject(args: {
  projectName: string;
  limit?: number;
}): Promise<ToolResult> {
  const name = args.projectName.trim();
  if (!name) return { ok: false, error: "Thiếu tên dự án" };
  const limit = Math.min(args.limit ?? 50, 200);

  const rows = (await db.execute(sql`
    SELECT
      p.id, p.product_code, p.unit_code, p.customer_name, p.sales_person,
      p.sale_type, p.deposit_date, p.pmg_rate, p.sale_commission_rate,
      pr.name AS project_name,
      (SELECT COUNT(*)::int FROM cost_reconciliations WHERE product_id = p.id) AS n_cost_recons,
      (SELECT COUNT(*)::int FROM revenue_reconciliations WHERE product_id = p.id) AS n_rev_recons
    FROM products p
    JOIN projects pr ON pr.id = p.project_id
    WHERE UPPER(pr.name) ILIKE UPPER(${'%' + name + '%'})
    ORDER BY p.deposit_date DESC NULLS LAST, p.id DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    id: number;
    product_code: string;
    unit_code: string;
    customer_name: string | null;
    sales_person: string | null;
    sale_type: string;
    deposit_date: string | null;
    pmg_rate: number;
    sale_commission_rate: number;
    project_name: string;
    n_cost_recons: number;
    n_rev_recons: number;
  }>;

  if (rows.length === 0) {
    return { ok: false, error: `Không tìm thấy dự án khớp "${name}"` };
  }

  const distinctProjects = Array.from(new Set(rows.map((r) => r.project_name)));

  return {
    ok: true,
    data: {
      duAnTimThay: distinctProjects,
      soCan: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        maCan: r.product_code,
        maSp: r.unit_code,
        duAn: r.project_name,
        loaiGiaoDich: r.sale_type === "primary" ? "Sơ cấp" : "Thứ cấp",
        khach: r.customer_name,
        nvkd: r.sales_person,
        ngayCoc: r.deposit_date,
        pctPMG: Number(r.pmg_rate),
        pctHHSale: Number(r.sale_commission_rate),
        soDoiChieuGiaVon: r.n_cost_recons,
        soDoiChieuDoanhThu: r.n_rev_recons,
        linkChiTiet: `/products/${r.id}`,
      })),
    },
  };
}

// Helper: median + mode cho array số. Ignore null/0.
function stats(values: number[]): {
  count: number;
  min: number;
  max: number;
  median: number;
  mode: number;
} {
  const nums = values.filter((v) => v != null && !isNaN(v) && v !== 0);
  if (nums.length === 0) return { count: 0, min: 0, max: 0, median: 0, mode: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  const freq = new Map<number, number>();
  for (const n of nums) {
    // Round rate về 4 decimals để mode meaningful (0.0575 vs 0.05750001)
    const key = Math.round(n * 10000) / 10000;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  let mode = nums[0];
  let maxFreq = 0;
  for (const [k, v] of freq) {
    if (v > maxFreq) {
      mode = k;
      maxFreq = v;
    }
  }
  return { count: nums.length, min: sorted[0], max: sorted[sorted.length - 1], median, mode };
}

async function getProjectPolicy(args: {
  projectName: string;
}): Promise<ToolResult> {
  const name = args.projectName.trim();
  if (!name) return { ok: false, error: "Thiếu tên dự án" };

  const rows = (await db.execute(sql`
    SELECT
      p.pmg_rate, p.pmg_sale_rate, p.sale_commission_rate, p.admin_fee,
      p.cdt_bonus_sale, p.cdt_bonus_manager,
      p.kpi_ceo_rate, p.kpi_tpkd_rate, p.kpi_admin_rate,
      pr.name AS project_name
    FROM products p
    JOIN projects pr ON pr.id = p.project_id
    WHERE UPPER(pr.name) ILIKE UPPER(${'%' + name + '%'})
  `)) as unknown as Array<{
    pmg_rate: number;
    pmg_sale_rate: number;
    sale_commission_rate: number;
    admin_fee: number;
    cdt_bonus_sale: number;
    cdt_bonus_manager: number;
    kpi_ceo_rate: number;
    kpi_tpkd_rate: number;
    kpi_admin_rate: number;
    project_name: string;
  }>;

  if (rows.length === 0) {
    return { ok: false, error: `Không tìm thấy dự án khớp "${name}"` };
  }

  const distinctProjects = Array.from(new Set(rows.map((r) => r.project_name)));

  const fmt = (s: ReturnType<typeof stats>) => ({
    soCanCoData: s.count,
    min: s.min,
    max: s.max,
    trungVi: s.median,
    phoBienNhat: s.mode,
  });

  return {
    ok: true,
    data: {
      duAn: distinctProjects,
      soCanTong: rows.length,
      pctPMG_LK: fmt(stats(rows.map((r) => Number(r.pmg_rate)))),
      pctPMG_LK_sale: fmt(stats(rows.map((r) => Number(r.pmg_sale_rate)))),
      pctHHSale: fmt(stats(rows.map((r) => Number(r.sale_commission_rate)))),
      phiAdmin: fmt(stats(rows.map((r) => Number(r.admin_fee)))),
      cdtThuongNongSale: fmt(stats(rows.map((r) => Number(r.cdt_bonus_sale)))),
      cdtThuongNongQL: fmt(stats(rows.map((r) => Number(r.cdt_bonus_manager)))),
      pctKPICEO: fmt(stats(rows.map((r) => Number(r.kpi_ceo_rate)))),
      pctKPITPKD: fmt(stats(rows.map((r) => Number(r.kpi_tpkd_rate)))),
      pctKPIAdmin: fmt(stats(rows.map((r) => Number(r.kpi_admin_rate)))),
    },
  };
}

async function getTopProjects(args: {
  year?: number;
  limit?: number;
}): Promise<ToolResult> {
  const limit = Math.min(args.limit ?? 10, 30);
  const dateFilter = args.year
    ? sql`AND p.deposit_date BETWEEN ${args.year + "-01-01"} AND ${args.year + "-12-31"}`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT
      pr.id, pr.name AS project_name,
      COUNT(p.id)::int AS n_units,
      COALESCE(SUM(rr.total_revenue), 0)::float8 AS revenue_recognized,
      COALESCE(SUM(cc.total_hh), 0)::float8 AS hh_total
    FROM projects pr
    LEFT JOIN products p ON p.project_id = pr.id ${dateFilter}
    LEFT JOIN LATERAL (
      SELECT SUM(revenue_this_time + COALESCE(cdt_bonus_sale, 0) + COALESCE(cdt_bonus_manager, 0)) AS total_revenue
      FROM revenue_reconciliations WHERE product_id = p.id
    ) rr ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(amount_payable_this_time) AS total_hh
      FROM cost_reconciliations WHERE product_id = p.id AND cost_type = 'sale_commission'
    ) cc ON TRUE
    GROUP BY pr.id, pr.name
    HAVING COUNT(p.id) > 0
    ORDER BY n_units DESC, revenue_recognized DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    id: number;
    project_name: string;
    n_units: number;
    revenue_recognized: number;
    hh_total: number;
  }>;

  if (rows.length === 0) {
    return { ok: true, data: { message: "Chưa có căn nào trong kỳ", items: [] } };
  }

  return {
    ok: true,
    data: {
      ky: args.year ?? "tất cả",
      soLuong: rows.length,
      items: rows.map((r, i) => ({
        hang: i + 1,
        duAn: r.project_name,
        soCan: r.n_units,
        doanhThuGhiNhan: Math.round(Number(r.revenue_recognized)),
        hhSaleGhiNhan: Math.round(Number(r.hh_total)),
      })),
    },
  };
}

async function listAllProjectPolicies(args: {
  minUnits?: number;
}): Promise<ToolResult> {
  const minUnits = args.minUnits ?? 1;

  const rows = (await db.execute(sql`
    SELECT
      pr.id, pr.name,
      p.pmg_rate, p.pmg_sale_rate, p.sale_commission_rate, p.admin_fee,
      p.cdt_bonus_sale, p.cdt_bonus_manager
    FROM projects pr
    JOIN products p ON p.project_id = pr.id
  `)) as unknown as Array<{
    id: number;
    name: string;
    pmg_rate: number;
    pmg_sale_rate: number;
    sale_commission_rate: number;
    admin_fee: number;
    cdt_bonus_sale: number;
    cdt_bonus_manager: number;
  }>;

  const byProject = new Map<string, {
    id: number;
    name: string;
    pmgRates: number[];
    pmgSaleRates: number[];
    hhSaleRates: number[];
    adminFees: number[];
    cdtBonusSales: number[];
    cdtBonusMgrs: number[];
  }>();

  for (const r of rows) {
    // Merge project trùng tên (data quality: có 2 project cùng name)
    const key = r.name.trim();
    if (!byProject.has(key)) {
      byProject.set(key, {
        id: r.id,
        name: key,
        pmgRates: [],
        pmgSaleRates: [],
        hhSaleRates: [],
        adminFees: [],
        cdtBonusSales: [],
        cdtBonusMgrs: [],
      });
    }
    const p = byProject.get(key)!;
    p.pmgRates.push(Number(r.pmg_rate));
    p.pmgSaleRates.push(Number(r.pmg_sale_rate));
    p.hhSaleRates.push(Number(r.sale_commission_rate));
    p.adminFees.push(Number(r.admin_fee));
    p.cdtBonusSales.push(Number(r.cdt_bonus_sale));
    p.cdtBonusMgrs.push(Number(r.cdt_bonus_manager));
  }

  const items = Array.from(byProject.values())
    .filter((p) => p.pmgRates.length >= minUnits)
    .map((p) => ({
      duAn: p.name,
      soCan: p.pmgRates.length,
      pctPMG_LK_phoBien: stats(p.pmgRates).mode,
      pctPMG_LK_sale_phoBien: stats(p.pmgSaleRates).mode,
      pctHHSale_phoBien: stats(p.hhSaleRates).mode,
      phiAdmin_phoBien: stats(p.adminFees).mode,
      cdtThuongNongSale_phoBien: stats(p.cdtBonusSales).mode,
      cdtThuongNongQL_phoBien: stats(p.cdtBonusMgrs).mode,
    }))
    .sort((a, b) => b.soCan - a.soCan);

  return {
    ok: true,
    data: {
      soDuAn: items.length,
      items,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// REPORT-BASED TOOLS (wrap logic từ /reports/* pages)
// ═══════════════════════════════════════════════════════════════════

async function getARAging(args: { partnerName?: string }): Promise<ToolResult> {
  const today = new Date().toISOString().slice(0, 10);
  const filter = args.partnerName
    ? sql`WHERE partner ILIKE ${'%' + args.partnerName + '%'}`
    : sql``;

  const rows = (await db.execute(sql`
    WITH recon AS (
      SELECT
        r.id,
        COALESCE(pa_inv.name, pa_pj.name, 'Không rõ') AS partner,
        r.reconciliation_date,
        r.total_receivable_this_time,
        COALESCE((SELECT SUM(amount) FROM payments_in pi WHERE pi.reconciliation_id = r.id), 0) AS paid
      FROM revenue_reconciliations r
      LEFT JOIN products p ON p.id = r.product_id
      LEFT JOIN projects pj ON pj.id = p.project_id
      LEFT JOIN partners pa_pj ON pa_pj.id = pj.partner_id
      LEFT JOIN invoices i ON i.id = r.invoice_id
      LEFT JOIN partners pa_inv ON pa_inv.id = i.partner_id
      WHERE r.total_receivable_this_time > 0
    )
    SELECT * FROM (
      SELECT
        partner,
        COUNT(*)::int AS count,
        SUM(CASE WHEN (${today}::date - reconciliation_date::date) <= 30
          THEN GREATEST(0, total_receivable_this_time - paid) ELSE 0 END)::float8 AS b0_30,
        SUM(CASE WHEN (${today}::date - reconciliation_date::date) BETWEEN 31 AND 60
          THEN GREATEST(0, total_receivable_this_time - paid) ELSE 0 END)::float8 AS b31_60,
        SUM(CASE WHEN (${today}::date - reconciliation_date::date) BETWEEN 61 AND 90
          THEN GREATEST(0, total_receivable_this_time - paid) ELSE 0 END)::float8 AS b61_90,
        SUM(CASE WHEN (${today}::date - reconciliation_date::date) > 90
          THEN GREATEST(0, total_receivable_this_time - paid) ELSE 0 END)::float8 AS b91,
        SUM(GREATEST(0, total_receivable_this_time - paid))::float8 AS total
      FROM recon
      GROUP BY partner
      HAVING SUM(GREATEST(0, total_receivable_this_time - paid)) > 0
    ) x ${filter}
    ORDER BY total DESC
  `)) as unknown as Array<{
    partner: string;
    count: number;
    b0_30: number;
    b31_60: number;
    b61_90: number;
    b91: number;
    total: number;
  }>;

  const totalOwed = rows.reduce((s, r) => s + Number(r.total), 0);
  return {
    ok: true,
    data: {
      soCDT: rows.length,
      tongConThu: Math.round(totalOwed),
      chotNgay: today,
      items: rows.map((r) => ({
        cdt: r.partner,
        soDot: r.count,
        buc0_30ngay: Math.round(Number(r.b0_30)),
        buc31_60ngay: Math.round(Number(r.b31_60)),
        buc61_90ngay: Math.round(Number(r.b61_90)),
        bucTren90ngay: Math.round(Number(r.b91)),
        tongCDTnayNo: Math.round(Number(r.total)),
      })),
    },
  };
}

async function getAPAging(args: { employeeName?: string }): Promise<ToolResult> {
  const today = new Date().toISOString().slice(0, 10);
  const filter = args.employeeName
    ? sql`WHERE name ILIKE ${'%' + args.employeeName + '%'}`
    : sql``;

  const rows = (await db.execute(sql`
    WITH recon AS (
      SELECT
        c.id, c.employee_name, c.reconciliation_date, c.amount_payable_this_time,
        COALESCE((SELECT SUM(amount) FROM payments_out po WHERE po.cost_reconciliation_id = c.id), 0) AS paid
      FROM cost_reconciliations c
      WHERE c.amount_payable_this_time > 0
    )
    SELECT * FROM (
      SELECT
        employee_name AS name,
        COUNT(*)::int AS count,
        SUM(CASE WHEN (${today}::date - reconciliation_date::date) <= 30
          THEN GREATEST(0, amount_payable_this_time - paid) ELSE 0 END)::float8 AS b0_30,
        SUM(CASE WHEN (${today}::date - reconciliation_date::date) BETWEEN 31 AND 60
          THEN GREATEST(0, amount_payable_this_time - paid) ELSE 0 END)::float8 AS b31_60,
        SUM(CASE WHEN (${today}::date - reconciliation_date::date) BETWEEN 61 AND 90
          THEN GREATEST(0, amount_payable_this_time - paid) ELSE 0 END)::float8 AS b61_90,
        SUM(CASE WHEN (${today}::date - reconciliation_date::date) > 90
          THEN GREATEST(0, amount_payable_this_time - paid) ELSE 0 END)::float8 AS b91,
        SUM(GREATEST(0, amount_payable_this_time - paid))::float8 AS total
      FROM recon
      GROUP BY employee_name
      HAVING SUM(GREATEST(0, amount_payable_this_time - paid)) > 0
    ) x ${filter}
    ORDER BY total DESC
  `)) as unknown as Array<{
    name: string;
    count: number;
    b0_30: number;
    b31_60: number;
    b61_90: number;
    b91: number;
    total: number;
  }>;

  const totalOwed = rows.reduce((s, r) => s + Number(r.total), 0);
  return {
    ok: true,
    data: {
      soNV: rows.length,
      tongConNo: Math.round(totalOwed),
      chotNgay: today,
      items: rows.map((r) => ({
        nvkd: r.name,
        soDot: r.count,
        buc0_30ngay: Math.round(Number(r.b0_30)),
        buc31_60ngay: Math.round(Number(r.b31_60)),
        buc61_90ngay: Math.round(Number(r.b61_90)),
        bucTren90ngay: Math.round(Number(r.b91)),
        tongNVnayCtyNo: Math.round(Number(r.total)),
      })),
    },
  };
}

async function getObligations(): Promise<ToolResult> {
  const { getCurrentUser } = await import("@/lib/auth");
  const u = await getCurrentUser();
  if (u?.role !== "owner") {
    return { ok: false, error: "Chỉ owner mới xem được nghĩa vụ tài chính tổng hợp" };
  }

  const [rev] = (await db.execute(sql`
    SELECT COALESCE(SUM(total_receivable_this_time), 0)::float8 AS s
    FROM revenue_reconciliations
  `)) as unknown as Array<{ s: number }>;
  const [pIn] = (await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::float8 AS s FROM payments_in
  `)) as unknown as Array<{ s: number }>;
  const receivable = Math.max(0, Number(rev?.s ?? 0) - Number(pIn?.s ?? 0));

  const [costAccrual] = (await db.execute(sql`
    SELECT COALESCE(SUM(amount_payable_this_time), 0)::float8 AS s FROM cost_reconciliations
  `)) as unknown as Array<{ s: number }>;
  const [saleCash] = (await db.execute(sql`
    SELECT COALESCE(SUM(ABS(debit_amount)), 0)::float8 AS s
    FROM bank_transactions
    WHERE debit_amount IS NOT NULL
      AND partner_name IN (
        'DOAN LE BACH','HO NGUYEN CONG THANH','TRAN MINH NHAT',
        'TRAN THI KHANH LINH','LE THI CAM GIANG','LE TRINH THANH THUY','VU DUC THINH'
      )
  `)) as unknown as Array<{ s: number }>;
  const owedSaleTeam = Math.max(0, Number(costAccrual?.s ?? 0) - Number(saleCash?.s ?? 0));

  const [taxAccrual] = (await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::float8 AS s FROM accounting_journal
    WHERE credit_account IN ('3334','3335','33311')
      AND debit_account != '911'
      AND substr(entry_date, 1, 4) IN ('2025','2026')
  `)) as unknown as Array<{ s: number }>;
  const [taxCash] = (await db.execute(sql`
    SELECT COALESCE(SUM(ABS(debit_amount)), 0)::float8 AS s FROM bank_transactions
    WHERE debit_amount IS NOT NULL
      AND (partner_name ILIKE '%KHO BAC%' OR partner_name ILIKE '%KBNN%')
  `)) as unknown as Array<{ s: number }>;
  const owedTax = Math.max(0, Number(taxAccrual?.s ?? 0) - Number(taxCash?.s ?? 0));

  const [bhxhAccrual] = (await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::float8 AS s FROM accounting_journal
    WHERE credit_account IN ('3383','3384','3386')
      AND debit_account != '911'
      AND substr(entry_date, 1, 4) IN ('2025','2026')
  `)) as unknown as Array<{ s: number }>;
  const [bhxhCash] = (await db.execute(sql`
    SELECT COALESCE(SUM(ABS(debit_amount)), 0)::float8 AS s FROM bank_transactions
    WHERE debit_amount IS NOT NULL AND partner_name ILIKE '%BAO HIEM XA HOI%'
  `)) as unknown as Array<{ s: number }>;
  const owedBhxh = Math.max(0, Number(bhxhAccrual?.s ?? 0) - Number(bhxhCash?.s ?? 0));

  const totalOwed = owedSaleTeam + owedTax + owedBhxh;
  return {
    ok: true,
    data: {
      conThuTuCDT: Math.round(receivable),
      conNoSaleTeam: Math.round(owedSaleTeam),
      conNoThue: Math.round(owedTax),
      conNoBHXH: Math.round(owedBhxh),
      tongNo: Math.round(totalOwed),
      viTheRong: Math.round(receivable - totalOwed),
    },
  };
}

async function getSalesReport(args: {
  year?: number;
  period?: "year" | "quarter" | "month";
  quarter?: number;
  month?: number;
  groupBy?: "project" | "partner" | "sales_person" | "department";
}): Promise<ToolResult> {
  const year = args.year ?? new Date().getUTCFullYear();
  const period = args.period ?? "year";
  const groupBy = args.groupBy ?? "project";

  let start: string, end: string, label: string;
  if (period === "month" && args.month) {
    start = `${year}-${String(args.month).padStart(2, "0")}-01`;
    end = new Date(year, args.month, 0).toISOString().slice(0, 10);
    label = `T${args.month}/${year}`;
  } else if (period === "quarter" && args.quarter) {
    const sm = (args.quarter - 1) * 3 + 1;
    start = `${year}-${String(sm).padStart(2, "0")}-01`;
    end = new Date(year, sm + 2, 0).toISOString().slice(0, 10);
    label = `Q${args.quarter}/${year}`;
  } else {
    start = `${year}-01-01`;
    end = `${year}-12-31`;
    label = `Năm ${year}`;
  }

  const [totals] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(total_receivable_this_time), 0)::float8 AS total_rev,
      COUNT(*)::int AS cnt_recon,
      COUNT(DISTINCT product_id)::int AS cnt_units
    FROM revenue_reconciliations
    WHERE reconciliation_date BETWEEN ${start} AND ${end}
  `)) as unknown as Array<{ total_rev: number; cnt_recon: number; cnt_units: number }>;

  let breakdown: Array<{ label: string; rev: number; count: number; units: number }> = [];

  if (groupBy === "project") {
    const rows = (await db.execute(sql`
      SELECT pr.name AS label,
        COALESCE(SUM(rr.total_receivable_this_time), 0)::float8 AS rev,
        COUNT(*)::int AS count,
        COUNT(DISTINCT rr.product_id)::int AS units
      FROM revenue_reconciliations rr
      JOIN products p ON p.id = rr.product_id
      JOIN projects pr ON pr.id = p.project_id
      WHERE rr.reconciliation_date BETWEEN ${start} AND ${end}
      GROUP BY pr.name
      ORDER BY rev DESC
    `)) as unknown as typeof breakdown;
    breakdown = rows;
  } else if (groupBy === "partner") {
    const rows = (await db.execute(sql`
      SELECT COALESCE(pa.name, '(Chưa gán CĐT)') AS label,
        COALESCE(SUM(rr.total_receivable_this_time), 0)::float8 AS rev,
        COUNT(*)::int AS count,
        COUNT(DISTINCT rr.product_id)::int AS units
      FROM revenue_reconciliations rr
      JOIN products p ON p.id = rr.product_id
      JOIN projects pj ON pj.id = p.project_id
      LEFT JOIN partners pa ON pa.id = pj.partner_id
      WHERE rr.reconciliation_date BETWEEN ${start} AND ${end}
      GROUP BY pa.name
      ORDER BY rev DESC
    `)) as unknown as typeof breakdown;
    breakdown = rows;
  } else if (groupBy === "sales_person") {
    const rows = (await db.execute(sql`
      SELECT COALESCE(p.sales_person, '(Không rõ)') AS label,
        COALESCE(SUM(rr.total_receivable_this_time), 0)::float8 AS rev,
        COUNT(*)::int AS count,
        COUNT(DISTINCT rr.product_id)::int AS units
      FROM revenue_reconciliations rr
      JOIN products p ON p.id = rr.product_id
      WHERE rr.reconciliation_date BETWEEN ${start} AND ${end}
      GROUP BY p.sales_person
      ORDER BY rev DESC
    `)) as unknown as typeof breakdown;
    breakdown = rows;
  } else {
    const rows = (await db.execute(sql`
      SELECT COALESCE(d.name, p.dept_name, '(Chưa phân phòng)') AS label,
        COALESCE(SUM(rr.total_receivable_this_time), 0)::float8 AS rev,
        COUNT(*)::int AS count,
        COUNT(DISTINCT rr.product_id)::int AS units
      FROM revenue_reconciliations rr
      JOIN products p ON p.id = rr.product_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE rr.reconciliation_date BETWEEN ${start} AND ${end}
      GROUP BY d.name, p.dept_name
      ORDER BY rev DESC
    `)) as unknown as typeof breakdown;
    breakdown = rows;
  }

  return {
    ok: true,
    data: {
      ky: label,
      groupBy,
      tongDT: Math.round(Number(totals?.total_rev ?? 0)),
      soDoiChieu: totals?.cnt_recon ?? 0,
      soCanCoDT: totals?.cnt_units ?? 0,
      breakdown: breakdown.map((b) => ({
        [groupBy === "project" ? "duAn" : groupBy === "partner" ? "cdt" : groupBy === "sales_person" ? "nvkd" : "phong"]: b.label,
        doanhThu: Math.round(Number(b.rev)),
        soDot: b.count,
        soCan: b.units,
      })),
    },
  };
}

export const TOOL_IMPL: Record<string, (args: any) => Promise<ToolResult>> = {
  getEmployeeCommission,
  getEmployeeOverpaidList,
  getUnitInfo,
  listUnitsByProject,
  getProjectPolicy,
  listAllProjectPolicies,
  getTopProjects,
  getARAging,
  getAPAging,
  getObligations,
  getSalesReport,
};
