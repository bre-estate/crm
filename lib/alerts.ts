import "server-only";
import { db } from "@/lib/db";
import {
  products,
  employees,
  revenueReconciliations,
  paymentsIn,
  costReconciliations,
  financialTransactions,
} from "@/lib/schema";
import { sql, inArray, eq, and, lt, gte, isNotNull } from "drizzle-orm";
import { OPEX_MGMT_CATEGORIES, FIXED_COST_CATEGORIES } from "@/lib/accounting/categories";
import { layCanChoTao } from "@/lib/cho-tao-gia-von";
import { soatDuLieu } from "@/lib/soat-du-lieu";
import { TEN_NHOM, type NhomLoi } from "@/lib/soat-du-lieu-types";
import { hasPermission, type Action, type Resource, type Role } from "@/lib/permissions";

/**
 * Alerts — logic tách khỏi UI để reuse:
 *   - /alerts page (full render với detail React)
 *   - sidebar notifications panel (chỉ cần id + title + severity + url)
 *
 * Mỗi alert có `key` stable-per-period để track read state per user:
 *   - Monthly alerts: `${id}::${YYYY-MM}` — reset mỗi tháng
 *   - Persistent alerts (VD idle-sale): update daily → key có ngày
 */

export type Severity = "critical" | "warning" | "info";

type Base = {
  id: string;
  key: string;
  severity: Severity;
  title: string;
  description: string;
  url?: string;
};

export type AlertBelowBe = Base & {
  id: "below-be-3m";
  beUnits: number;
  months: { month: string; count: number }[];
};

export type AlertIdle = Base & {
  id: "idle-sale";
  emps: { name: string; lastSale: string | null }[];
};

export type AlertOpexSpike = Base & {
  id: "opex-spike";
  months: { month: string; amount: number; ratio: number }[];
};

export type AlertOverdue = Base & {
  id: "overdue-receivables";
  totalAmount: number;
  products: {
    productId: number;
    unitCode: string;
    total: number;
    oldestDate: string;
    count: number;
  }[];
};

export type AlertChoGiaVon = Base & {
  id: "cho-tao-gia-von";
  units: { productId: number; unitCode: string; ngayThuCuoi: string; tienDaThu: number; chuaTao: string[] }[];
};

export type AlertDoanhThuVe = Base & {
  id: "doanh-thu-ve";
  tongTien: number;
  dot: {
    paymentId: number;
    productId: number;
    unitCode: string;
    duAn: string | null;
    soTien: number;
    ngayThu: string | null;
  }[];
};

/** Mỗi nhóm trên trang Soát dữ liệu thành một cảnh báo riêng. */
export type AlertSoat = Base & {
  id: SoatAlertId;
  muc: { canTen: string; tieuDe: string; lech: number }[];
};

export type SoatAlertId =
  | "soat-doanh-thu-vuot"
  | "soat-doanh-thu-thieu"
  | "soat-gia-von-du"
  | "soat-chi-truoc"
  | "soat-thuong-nong"
  | "soat-nhap-sai";

/**
 * Nhóm phát hiện nào thành cảnh báo nào, mức ra sao.
 *
 * Ba nhóm nhập sai gộp làm một vì cùng một việc phải làm là mở dòng ra sửa.
 * Nhóm đã giải thích được không có mặt ở đây nên không sinh cảnh báo.
 */
const NHOM_THANH_CANH_BAO: Partial<Record<NhomLoi, { id: SoatAlertId; muc: Severity }>> = {
  doanh_thu_vuot: { id: "soat-doanh-thu-vuot", muc: "critical" },
  doanh_thu_lech_tien_do: { id: "soat-doanh-thu-thieu", muc: "warning" },
  gia_von_vuot: { id: "soat-gia-von-du", muc: "warning" },
  gia_von_chi_truoc: { id: "soat-chi-truoc", muc: "info" },
  thuong_nong_lech: { id: "soat-thuong-nong", muc: "info" },
  sai_ty_le: { id: "soat-nhap-sai", muc: "warning" },
  tien_do_qua: { id: "soat-nhap-sai", muc: "warning" },
  thieu_ten: { id: "soat-nhap-sai", muc: "warning" },
};

/** Câu mô tả việc phải làm, theo từng cảnh báo soát. */
const VIEC_PHAI_LAM: Record<SoatAlertId, string> = {
  "soat-doanh-thu-vuot": "Chủ đầu tư trả nhiều hơn hợp đồng, đối chiếu lại với bảng kê.",
  "soat-doanh-thu-thieu": "Chưa thu đủ so với tiến độ khách đã đóng, hỏi chủ đầu tư lịch chuyển tiền.",
  "soat-gia-von-du": "Đã chi vượt cả trần khi khách đóng đủ, không đợt nào bù được, phải thu lại.",
  "soat-chi-truoc": "Công ty ứng trước, tới đợt cuối là khớp. Không mất tiền, chỉ là chuyện dòng tiền.",
  "soat-thuong-nong": "Hai bên quy đổi thưởng nóng khác nhau. Nhân viên không nợ, cần chốt cách tính trong hợp đồng lần sau.",
  "soat-nhap-sai": "Dòng đối chiếu ghi sai tỷ lệ, sai tiến độ hoặc thiếu tên người nhận. Mở ra sửa.",
};

export type Alert =
  | AlertBelowBe
  | AlertIdle
  | AlertOpexSpike
  | AlertOverdue
  | AlertChoGiaVon
  | AlertDoanhThuVe
  | AlertSoat;

/** Số ngày coi là "vừa mới" cho thông báo tiền về. */
const SO_NGAY_TIEN_MOI = 7;

/**
 * Ai cần biết cảnh báo nào.
 *
 * Mỗi vị trí chỉ nhận phần việc của mình, không thì ai cũng thấy đủ thứ rồi thôi
 * không đọc nữa. Sale Admin nhận công nợ quá hạn vì đó là người đi hối chủ đầu tư.
 * Nhân sự nhận nhắc tạo giá vốn vì đó là người lập đối chiếu.
 *
 * Vai trò "custom" không có trong bảng này, nên chỉ xét theo bảng quyền bên dưới.
 */
const VAI_TRO_NHAN: Record<Alert["id"], Role[]> = {
  "below-be-3m": ["owner", "manager"],
  "doanh-thu-ve": ["owner", "manager"],
  "idle-sale": ["owner", "manager"],
  "opex-spike": ["owner"],
  "overdue-receivables": ["owner", "manager", "admin"],
  "cho-tao-gia-von": ["owner", "hr"],
  // Soát dữ liệu: chia theo người đi làm việc đó. Nga làm lệnh hoàn nên nhận
  // phần giá vốn, Thúy đi hỏi chủ đầu tư nên nhận phần doanh thu. CEO nhận cả
  // hai để nắm toàn cảnh (chốt với operator 18/10/2026).
  "soat-doanh-thu-vuot": ["owner", "manager", "admin"],
  "soat-doanh-thu-thieu": ["owner", "manager", "admin"],
  "soat-gia-von-du": ["owner", "manager", "hr"],
  "soat-chi-truoc": ["owner", "manager", "hr"],
  "soat-thuong-nong": ["owner", "manager", "admin"],
  "soat-nhap-sai": ["owner", "manager", "admin"],
};

/**
 * Quyền tối thiểu để nhận cảnh báo, lấy theo trang mà cảnh báo dẫn tới.
 * Không mở được trang thì báo cũng vô ích, bấm vào chỉ ra trang báo lỗi.
 */
const QUYEN_CAN: Record<Alert["id"], { res: Resource; act: Action }> = {
  "below-be-3m": { res: "reports.profit-detail", act: "view" },
  "doanh-thu-ve": { res: "revenues", act: "view" },
  "idle-sale": { res: "reports.people", act: "view" },
  "opex-spike": { res: "reports.expenses", act: "view" },
  "overdue-receivables": { res: "reports.ar-aging", act: "view" },
  // Cần quyền sửa vì việc phải làm là tạo đối chiếu, chỉ xem thì nhắc cũng không làm được.
  "cho-tao-gia-von": { res: "costs", act: "edit" },
  "soat-doanh-thu-vuot": { res: "reports.soat-du-lieu", act: "view" },
  "soat-doanh-thu-thieu": { res: "reports.soat-du-lieu", act: "view" },
  "soat-gia-von-du": { res: "reports.soat-du-lieu", act: "view" },
  "soat-chi-truoc": { res: "reports.soat-du-lieu", act: "view" },
  "soat-thuong-nong": { res: "reports.soat-du-lieu", act: "view" },
  "soat-nhap-sai": { res: "reports.soat-du-lieu", act: "view" },
};

/** Giữ lại những cảnh báo thuộc phần việc của người đang đăng nhập. */
export function locTheoVaiTro<T extends { id: string }>(
  ds: T[],
  role: Role,
  customPerms?: Record<string, Action[]>,
): T[] {
  return ds.filter((a) => {
    const q = QUYEN_CAN[a.id as Alert["id"]];
    if (q && !hasPermission(role, customPerms, q.res, q.act)) return false;
    const vt = VAI_TRO_NHAN[a.id as Alert["id"]];
    if (role !== "custom" && vt && !vt.includes(role)) return false;
    return true;
  });
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function computeAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const nowMonth = new Date().toISOString().slice(0, 7);
  const currentYear = nowMonth.slice(0, 4);
  const monthsSoFar = Number(nowMonth.slice(5));
  const todayISO = new Date().toISOString().slice(0, 10);

  // ============================================================
  // ALERT 1: 3 tháng liền bán dưới điểm hòa vốn
  // ============================================================
  const opexYtdRows = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(financialTransactions)
    .where(
      and(
        inArray(financialTransactions.categoryCode, FIXED_COST_CATEGORIES),
        sql`transaction_month LIKE ${currentYear + "-%"}`,
      ),
    );
  const opexAvgMonth = monthsSoFar > 0 ? Number(opexYtdRows[0].s) / monthsSoFar : 0;

  const tscdRows = await db
    .select({
      month: financialTransactions.transactionMonth,
      cost: financialTransactions.amount,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "153-211"));
  const monthlyDepTotal = tscdRows.reduce((s, a) => {
    const [y1, m1] = a.month.split("-").map(Number);
    const [y2, m2] = nowMonth.split("-").map(Number);
    const elapsed = (y2 - y1) * 12 + (m2 - m1);
    if (elapsed < 0 || elapsed >= 36) return s;
    return s + Number(a.cost) / 36;
  }, 0);
  const cpQlMonth = opexAvgMonth + monthlyDepTotal;

  const [productStats] = await db
    .select({
      revExp: sql<number>`coalesce(sum(total_revenue), 0)::float8`,
      costExp: sql<number>`coalesce(sum(total_cost), 0)::float8`,
      n: sql<number>`count(*)::int`,
    })
    .from(products);
  const avgGrossPerUnit =
    Number(productStats.n) > 0
      ? (Number(productStats.revExp) / 1.1 - Number(productStats.costExp)) / Number(productStats.n)
      : 0;
  const beUnits = avgGrossPerUnit > 0 && cpQlMonth > 0 ? cpQlMonth / avgGrossPerUnit : 0;

  const allProducts = await db
    .select({ depositDate: products.depositDate })
    .from(products)
    .where(isNotNull(products.depositDate));
  const unitsPerMonth = new Map<string, number>();
  for (const p of allProducts) {
    if (!p.depositDate) continue;
    const m = p.depositDate.slice(0, 7);
    unitsPerMonth.set(m, (unitsPerMonth.get(m) ?? 0) + 1);
  }
  const last3 = [1, 2, 3].map((i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const last3Counts = last3.map((m) => ({ month: m, count: unitsPerMonth.get(m) ?? 0 }));
  const below3 = last3Counts.filter((x) => x.count < beUnits).length;
  if (below3 === 3 && beUnits > 0) {
    alerts.push({
      id: "below-be-3m",
      key: `below-be-3m::${nowMonth}`,
      severity: "critical",
      title: `Bán dưới điểm hòa vốn 3 tháng liền`,
      description: `Điểm hòa vốn cần ${beUnits.toFixed(1)} căn/tháng.`,
      url: "/reports/profit-detail",
      beUnits,
      months: last3Counts,
    });
  }

  // ============================================================
  // ALERT 5: NVKD 0 căn > 3 tháng liền
  // ============================================================
  const threeMonthsAgo = daysAgo(90);
  const emps = await db
    .select({
      id: employees.id,
      name: employees.name,
      position: employees.position,
      aliasOfId: employees.aliasOfId,
    })
    .from(employees)
    .where(and(eq(employees.active, true), eq(employees.position, "nvkd")));

  const recentSaleRows = await db
    .select({ name: costReconciliations.employeeName })
    .from(costReconciliations)
    .where(
      and(
        eq(costReconciliations.costType, "sale_commission"),
        gte(costReconciliations.reconciliationDate, threeMonthsAgo),
      ),
    );
  const activeNames = new Set(
    recentSaleRows.map((r) => (r.name ?? "").trim().toLowerCase()).filter(Boolean),
  );

  const lastSaleRows = await db
    .select({
      name: costReconciliations.employeeName,
      d: sql<string>`max(reconciliation_date)`,
    })
    .from(costReconciliations)
    .where(eq(costReconciliations.costType, "sale_commission"))
    .groupBy(costReconciliations.employeeName);
  const lastSaleByName = new Map<string, string>();
  for (const r of lastSaleRows) {
    if (r.name && r.d) lastSaleByName.set(r.name.trim().toLowerCase(), r.d);
  }

  const idleEmps: { name: string; lastSale: string | null }[] = [];
  for (const e of emps) {
    if (e.aliasOfId != null) continue;
    const key = e.name.trim().toLowerCase();
    if (activeNames.has(key)) continue;
    idleEmps.push({ name: e.name, lastSale: lastSaleByName.get(key) ?? null });
  }

  if (idleEmps.length > 0) {
    alerts.push({
      id: "idle-sale",
      key: `idle-sale::${nowMonth}`,
      severity: "warning",
      title: `${idleEmps.length} NVKD không có đợt hoa hồng sale trong 3 tháng qua`,
      description:
        "Cân nhắc cho nghỉ việc, đào tạo lại, hoặc điều chuyển sang phòng ban khác.",
      url: "/reports/people",
      emps: idleEmps,
    });
  }

  // ============================================================
  // ALERT 6: Chi phí hoạt động tháng bất thường > 1.5× trung bình 6 tháng
  // ============================================================
  const opexPerMonthRows = await db
    .select({
      month: financialTransactions.transactionMonth,
      s: sql<number>`sum(amount)::float8`,
    })
    .from(financialTransactions)
    .where(inArray(financialTransactions.categoryCode, OPEX_MGMT_CATEGORIES))
    .groupBy(financialTransactions.transactionMonth);
  const opexByMonth = new Map(opexPerMonthRows.map((r) => [r.month, Number(r.s)]));

  const last7Months = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const [, ...prev6] = last7Months;
  const prev6Values = prev6.map((m) => opexByMonth.get(m) ?? 0).filter((v) => v > 0);
  const avg6m = prev6Values.length > 0 ? prev6Values.reduce((s, v) => s + v, 0) / prev6Values.length : 0;

  const spikeMonths: { month: string; amount: number; ratio: number }[] = [];
  for (const m of last7Months) {
    const v = opexByMonth.get(m) ?? 0;
    if (v > 0 && avg6m > 0 && v > avg6m * 1.5) {
      spikeMonths.push({ month: m, amount: v, ratio: v / avg6m });
    }
  }

  if (spikeMonths.length > 0) {
    alerts.push({
      id: "opex-spike",
      key: `opex-spike::${nowMonth}`,
      severity: "warning",
      title: `${spikeMonths.length} tháng có chi phí hoạt động bất thường`,
      description:
        "Chi phí hoạt động cao hơn 1,5 lần trung bình 6 tháng gần đây. Cần rà soát lý do (thưởng lớn, thuế, mua sắm bất thường).",
      months: spikeMonths,
      url: "/reports/expenses",
    });
  }

  // ============================================================
  // ALERT 8: Công nợ phải thu > 60 ngày
  // ============================================================
  const cutoff = daysAgo(60);
  const recons = await db
    .select({
      id: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      reconDate: revenueReconciliations.reconciliationDate,
      receivable: revenueReconciliations.totalReceivableThisTime,
    })
    .from(revenueReconciliations)
    .where(and(lt(revenueReconciliations.reconciliationDate, cutoff)));
  const reconIds = recons.map((r) => r.id);
  const paidByRecon = new Map<number, number>();
  if (reconIds.length > 0) {
    const paid = await db
      .select({
        rid: paymentsIn.reconciliationId,
        amount: paymentsIn.amount,
      })
      .from(paymentsIn)
      .where(inArray(paymentsIn.reconciliationId, reconIds));
    for (const p of paid) {
      if (p.rid == null) continue;
      paidByRecon.set(p.rid, (paidByRecon.get(p.rid) ?? 0) + Number(p.amount ?? 0));
    }
  }

  const overdueByProduct = new Map<
    number,
    { total: number; oldestDate: string; count: number }
  >();
  for (const r of recons) {
    const paid = paidByRecon.get(r.id) ?? 0;
    const outstanding = Number(r.receivable ?? 0) - paid;
    if (outstanding < 1000) continue;
    const cur = overdueByProduct.get(r.productId) ?? {
      total: 0,
      oldestDate: r.reconDate ?? "",
      count: 0,
    };
    cur.total += outstanding;
    cur.count += 1;
    if (r.reconDate && (!cur.oldestDate || r.reconDate < cur.oldestDate)) {
      cur.oldestDate = r.reconDate;
    }
    overdueByProduct.set(r.productId, cur);
  }
  const overdueTotalAmount = [...overdueByProduct.values()].reduce((s, x) => s + x.total, 0);

  if (overdueByProduct.size > 0) {
    const productMap = new Map<number, string>();
    const pRows = await db
      .select({ id: products.id, unitCode: products.unitCode })
      .from(products)
      .where(inArray(products.id, [...overdueByProduct.keys()]));
    for (const p of pRows) productMap.set(p.id, p.unitCode);

    const sortedOverdue = [...overdueByProduct.entries()]
      .map(([pid, x]) => ({
        productId: pid,
        unitCode: productMap.get(pid) ?? `#${pid}`,
        total: x.total,
        oldestDate: x.oldestDate,
        count: x.count,
      }))
      .sort((a, b) => b.total - a.total);

    alerts.push({
      id: "overdue-receivables",
      key: `overdue-receivables::${todayISO}`,
      severity: "warning",
      title: `${overdueByProduct.size} căn có công nợ phải thu > 60 ngày`,
      description: `Tổng công nợ quá hạn: ${Math.round(overdueTotalAmount).toLocaleString("vi-VN")} VND.`,
      url: "/reports/ar-aging",
      totalAmount: overdueTotalAmount,
      products: sortedOverdue,
    });
  }

  // ── Căn đã nhận tiền nhưng chưa lập đối chiếu giá vốn ──
  // Nhắc kế toán và nhân sự: tiền chủ đầu tư đã về, tới lượt chi hoa hồng cho sale
  // và KPI cho quản lý. Mốc là ngày nhận tiền, không phải ngày đối chiếu doanh thu.
  const choGiaVon = await layCanChoTao();
  if (choGiaVon.length > 0) {
    const moiVe = choGiaVon.filter((x) => x.tienMoiVe).length;
    const tenCan = choGiaVon.slice(0, 3).map((x) => x.maCan).join(", ");
    alerts.push({
      id: "cho-tao-gia-von",
      key: `cho-tao-gia-von::${todayISO}`,
      severity: "warning",
      title: `${choGiaVon.length} căn cần tạo đối chiếu giá vốn`,
      description:
        `Chủ đầu tư đã chuyển tiền cho ${tenCan}` +
        `${choGiaVon.length > 3 ? ` và ${choGiaVon.length - 3} căn khác` : ""}` +
        `${moiVe > 0 ? `, trong đó ${moiVe} căn vừa nhận tiền` : ""}. ` +
        `Tạo đủ các loại giá vốn để chi hoa hồng cho sale và KPI cho trưởng phòng, admin.`,
      url: "/costs?view=pending",
      units: choGiaVon.map((x) => ({
        productId: x.productId,
        unitCode: x.maCan,
        ngayThuCuoi: x.ngayThuCuoi,
        tienDaThu: x.tienDaThu,
        chuaTao: x.chuaTao.map((l) => l.ten),
      })),
    });
  }

  // ============================================================
  // ALERT 10: Tiền chủ đầu tư vừa về, do Sale Admin nhập vào
  // ============================================================
  //
  // Mốc là lúc NHẬP (created_at), không phải ngày thu trên chứng từ. Ngày thu hay
  // được ghi lùi lại theo ngày ngân hàng báo có, nên lấy ngày thu thì một đợt nhập
  // hôm nay mà ghi ngày tháng trước sẽ không báo cho ai biết.
  const tienVe = (await db.execute(sql`
    SELECT pi.id, pi.amount, pi.payment_date, p.id AS product_id, p.unit_code, pj.name AS du_an
    FROM payments_in pi
    JOIN revenue_reconciliations r ON r.id = pi.reconciliation_id
    JOIN products p ON p.id = r.product_id
    LEFT JOIN projects pj ON pj.id = p.project_id
    WHERE pi.created_at >= now() - (${SO_NGAY_TIEN_MOI} || ' days')::interval
      AND COALESCE(pi.amount, 0) > 0
    ORDER BY pi.id DESC
  `)) as unknown as Array<Record<string, unknown>>;

  if (tienVe.length > 0) {
    const dot = tienVe.map((r) => ({
      paymentId: Number(r.id),
      productId: Number(r.product_id),
      unitCode: String(r.unit_code ?? ""),
      duAn: r.du_an == null ? null : String(r.du_an),
      soTien: Number(r.amount ?? 0),
      ngayThu: r.payment_date == null ? null : String(r.payment_date).slice(0, 10),
    }));
    const tongTien = dot.reduce((a, b) => a + b.soTien, 0);
    const soCan = new Set(dot.map((d) => d.productId)).size;
    const tien = Math.round(tongTien).toLocaleString("vi-VN");
    alerts.push({
      id: "doanh-thu-ve",
      // Khóa gắn với đợt mới nhất, nên đọc rồi là im cho tới khi có tiền về tiếp.
      key: `doanh-thu-ve::${dot[0].paymentId}`,
      severity: "info",
      title: `Tiền về ${tien} từ ${soCan} căn`,
      description:
        `${dot.length} đợt thu được nhập trong ${SO_NGAY_TIEN_MOI} ngày qua, tổng ${tien} đồng ` +
        `từ ${soCan} căn. Tới lượt nhân sự lập đối chiếu giá vốn để chi hoa hồng và KPI.`,
      url: "/revenues",
      tongTien,
      dot,
    });
  }

  // ── Soát dữ liệu: mỗi nhóm phát hiện thành một cảnh báo ──
  // Gọi thẳng soatDuLieu để chỉ có MỘT nơi định nghĩa thế nào là lệch. Viết
  // lại phép dò ở đây thì hai chỗ sẽ trôi khỏi nhau, trang báo một kiểu mà
  // thông báo báo một kiểu.
  const phatHien = await soatDuLieu();
  const gom = new Map<SoatAlertId, { muc: Severity; nhom: NhomLoi[]; ds: typeof phatHien }>();
  for (const x of phatHien) {
    const map = NHOM_THANH_CANH_BAO[x.nhom];
    if (!map) continue;
    const cu = gom.get(map.id) ?? { muc: map.muc, nhom: [], ds: [] };
    if (!cu.nhom.includes(x.nhom)) cu.nhom.push(x.nhom);
    cu.ds.push(x);
    gom.set(map.id, cu);
  }
  for (const [id, g] of gom) {
    const tongLech = g.ds.reduce((t, x) => t + x.lech, 0);
    const soCan = new Set(g.ds.map((x) => x.canTen)).size;
    const tenNhom = g.nhom.map((n) => TEN_NHOM[n]).join(", ");
    alerts.push({
      id,
      key: `${id}::${todayISO}`,
      severity: g.muc,
      title:
        `${soCan} căn ${tenNhom.charAt(0).toLowerCase()}${tenNhom.slice(1)}` +
        (tongLech > 0 ? `, ${Math.round(tongLech).toLocaleString("vi-VN")} đồng` : ""),
      description: VIEC_PHAI_LAM[id],
      url: "/reports/soat-du-lieu",
      muc: g.ds.map((x) => ({ canTen: x.canTen, tieuDe: x.tieuDe, lech: x.lech })),
    });
  }

  return alerts;
}

/**
 * Summary version — chỉ trả về metadata cần cho sidebar notifications panel.
 * Nhẹ hơn (không expose detail arrays trong response client).
 */
export type AlertSummary = {
  id: string;
  key: string;
  severity: Severity;
  title: string;
  url?: string;
  /** Tiền đang mắc kẹt, để panel ở thanh bên xếp cùng thứ tự với trang. */
  tien: number;
};

/**
 * Số tiền đang mắc kẹt trong một cảnh báo, dùng để xếp thứ tự.
 *
 * Cùng một mức thì cảnh báo nào nhiều tiền hơn phải nằm trên. Trước đây chỉ
 * xếp theo mức nên một mục lệch mười nghìn có thể đứng trên một mục lệch
 * hai mươi bảy triệu.
 *
 * Cảnh báo không gắn với tiền (dưới điểm hòa vốn, sale không có giao dịch)
 * trả 0 và rơi xuống cuối nhóm của nó.
 */
export function tienLienQuan(a: Alert): number {
  switch (a.id) {
    case "overdue-receivables":
      return a.totalAmount;
    case "doanh-thu-ve":
      return a.tongTien;
    case "cho-tao-gia-von":
      return a.units.reduce((t, x) => t + x.tienDaThu, 0);
    case "opex-spike":
      return a.months.reduce((t, x) => Math.max(t, x.amount), 0);
    case "below-be-3m":
    case "idle-sale":
      return 0;
    default:
      return a.muc.reduce((t, x) => t + x.lech, 0);
  }
}

const THU_TU_MUC: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Nguy cấp trước, trong cùng mức thì nhiều tiền trước. */
export function xepTheoDoQuanTrong<T extends Alert>(ds: T[]): T[] {
  return [...ds].sort(
    (a, b) =>
      THU_TU_MUC[a.severity] - THU_TU_MUC[b.severity] ||
      tienLienQuan(b) - tienLienQuan(a) ||
      a.title.localeCompare(b.title, "vi"),
  );
}

export async function computeAlertSummaries(): Promise<AlertSummary[]> {
  const alerts = xepTheoDoQuanTrong(await computeAlerts());
  return alerts.map((a) => ({
    id: a.id,
    key: a.key,
    severity: a.severity,
    title: a.title,
    url: a.url,
    tien: tienLienQuan(a),
  }));
}
