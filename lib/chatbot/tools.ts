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

export const TOOL_IMPL: Record<string, (args: any) => Promise<ToolResult>> = {
  getEmployeeCommission,
  getEmployeeOverpaidList,
  getUnitInfo,
  listUnitsByProject,
  getProjectPolicy,
  getTopProjects,
};
