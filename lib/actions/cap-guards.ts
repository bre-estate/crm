/**
 * Chặn đối chiếu vượt trần hợp đồng.
 * Rule: mọi số tiền hoặc % lũy kế vượt cam kết hợp đồng đều báo lỗi.
 *
 * Áp dụng cho createRevenue/updateRevenue + createCost/updateCost.
 * Guard chạy TRƯỚC khi insert/update, throw Error nếu vi phạm.
 * Tolerance 1% cho rounding — VD 100.5% vẫn cho qua, 101%+ mới chặn.
 */
import { db } from "@/lib/db";
import { costReconciliations, revenueReconciliations, products } from "@/lib/schema";
import { and, eq, ne, sql } from "drizzle-orm";

const TOLERANCE = 0.01; // Cho qua nếu ≤ 101% target (chống lỗi làm tròn)

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function pctStr(actual: number, cap: number): string {
  if (cap <= 0) return "N/A";
  return `${((actual / cap) * 100).toFixed(1)}%`;
}

// ==================== DOANH THU ====================

/**
 * Doanh thu một căn gồm BA khoản riêng, mỗi khoản một trần riêng, KHÔNG gộp chung:
 *   hoa hồng       ≤ pmg_base_price × pmg_rate  (PMG × %PMG_LK)
 *   thưởng nóng sale    ≤ products.cdt_bonus_sale
 *   thưởng nóng quản lý ≤ products.cdt_bonus_manager
 *
 * Sửa 19/09/2026: bản cũ so TỔNG (hoa hồng cộng cả hai loại thưởng) với trần của
 * riêng hoa hồng, nên căn nào có thưởng nóng là bị chặn oan. Bảy căn Emerald Garden
 * hoa hồng mới đi 77% trần mà tổng đã 91-93% chỉ vì cộng thêm 22tr thưởng nóng đúng
 * bằng target CĐT cam kết.
 */
export async function assertRevenueCapNotExceeded(
  productId: number,
  newCommission: number,
  newCdtBonusSale: number,
  newCdtBonusManager: number,
  excludeReconciliationId?: number,
): Promise<void> {
  const [p] = await db
    .select({
      code: products.productCode,
      pmgBase: products.pmgBasePrice,
      pmgRate: products.pmgRate,
      cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
    })
    .from(products)
    .where(eq(products.id, productId));
  if (!p) return;

  const conditions = [eq(revenueReconciliations.productId, productId)];
  if (excludeReconciliationId) {
    conditions.push(ne(revenueReconciliations.id, excludeReconciliationId));
  }
  const [row] = await db
    .select({
      hh: sql<string>`COALESCE(SUM(${revenueReconciliations.revenueThisTime}), 0)`,
      bs: sql<string>`COALESCE(SUM(${revenueReconciliations.cdtBonusSale}), 0)`,
      bm: sql<string>`COALESCE(SUM(${revenueReconciliations.cdtBonusManager}), 0)`,
    })
    .from(revenueReconciliations)
    .where(and(...conditions));

  const khoan: { nhan: string; cap: number; moi: number; sau: number; giaiThich: string }[] = [
    {
      nhan: "hoa hồng",
      cap: Number(p.pmgBase ?? 0) * Number(p.pmgRate ?? 0),
      moi: newCommission,
      sau: Number(row?.hh ?? 0) + newCommission,
      giaiThich: "PMG × %PMG_LK",
    },
    {
      nhan: "thưởng nóng cho sale",
      cap: Number(p.cdtBonusSale ?? 0),
      moi: newCdtBonusSale,
      sau: Number(row?.bs ?? 0) + newCdtBonusSale,
      giaiThich: "mức CĐT cam kết trên căn",
    },
    {
      nhan: "thưởng nóng cho quản lý",
      cap: Number(p.cdtBonusManager ?? 0),
      moi: newCdtBonusManager,
      sau: Number(row?.bm ?? 0) + newCdtBonusManager,
      giaiThich: "mức CĐT cam kết trên căn",
    },
  ];

  for (const k of khoan) {
    if (k.cap <= 0) continue; // Chưa nhập mức cam kết thì không kiểm được
    // Chỉ kiểm khoản mà đợt đang nhập có đụng tới. Đợt hoa hồng thuần không đáng bị
    // chặn vì số thưởng nóng cũ đã vượt mức, việc đó xử lý riêng chứ không khóa nhập.
    if (k.moi <= 0) continue;
    if (k.sau > k.cap * (1 + TOLERANCE)) {
      throw new Error(
        `Vượt trần ${k.nhan} căn ${p.code}: sau khi lưu = ${fmt(k.sau)} VND (${pctStr(k.sau, k.cap)} trần). ` +
          `Trần hợp đồng = ${fmt(k.cap)} VND (${k.giaiThich}). ` +
          `Kiểm tra lại số tiền hoặc căn được chọn.`,
      );
    }
  }
}

/**
 * phase_pct_this_time là % tiến độ LŨY KẾ tại đợt đó, không phải phần tăng thêm của đợt.
 * Nên chỉ kiểm từng dòng ≤ 100%, KHÔNG cộng dồn các đợt lại.
 *
 * Sửa 19/09/2026: bản cũ cộng tổng mọi đợt rồi chặn khi vượt 100%, làm 60 trên 85 căn
 * không thêm được đợt mới (một căn 5 đợt lũy kế 70/70/80/90% cộng lại đã 310%).
 * Ba bằng chứng field này là lũy kế: dữ liệu tăng dần theo ngày đối chiếu, RevenueForm
 * lấy Math.max chứ không cộng, và tên cột đi kèm pmg_cumulative_pct cũng là lũy kế.
 */
export async function assertPhasePctNotExceeded(
  productId: number,
  newPhasePct: number,
  _excludeReconciliationId?: number,
): Promise<void> {
  if (!newPhasePct || newPhasePct <= 0) return;
  if (newPhasePct <= 1 + TOLERANCE) return;

  const [p] = await db
    .select({ code: products.productCode })
    .from(products)
    .where(eq(products.id, productId));

  throw new Error(
    `% tiến độ đợt này của căn ${p?.code ?? productId} = ${(newPhasePct * 100).toFixed(1)}%, vượt quá 100%. ` +
      `Ô này là tiến độ lũy kế tới đợt đang nhập, không phải phần tăng thêm.`,
  );
}

/**
 * pmg_cumulative_pct (% PMG lũy kế) trên 1 dòng ≤ 100%.
 */
export function assertPmgCumulativePctInRange(pmgCumulativePct: number): void {
  if (!pmgCumulativePct) return;
  if (pmgCumulativePct > 1 + TOLERANCE) {
    throw new Error(
      `% PMG lũy kế = ${(pmgCumulativePct * 100).toFixed(1)}% > 100%. Kiểm tra lại.`,
    );
  }
  if (pmgCumulativePct < 0) {
    throw new Error(`% PMG lũy kế = ${(pmgCumulativePct * 100).toFixed(1)}% âm. Kiểm tra lại.`);
  }
}

/**
 * Chạy hết guard doanh thu, trả câu báo lỗi để hiện thẳng cho nhân viên, null nếu hợp lệ.
 * Dùng thay cho việc throw: Next.js che mọi lỗi throw từ server action trong bản production
 * thành câu "An error occurred in the Server Components render", nhân viên không biết sai gì.
 */
export async function kiemTraTranDoanhThu(
  productId: number,
  khoan: { hoaHong: number; thuongSale: number; thuongQuanLy: number },
  pmgCumulativePct: number,
  phasePct: number,
  excludeReconciliationId?: number,
): Promise<string | null> {
  try {
    assertPmgCumulativePctInRange(pmgCumulativePct);
    await assertRevenueCapNotExceeded(
      productId,
      khoan.hoaHong,
      khoan.thuongSale,
      khoan.thuongQuanLy,
      excludeReconciliationId,
    );
    await assertPhasePctNotExceeded(productId, phasePct, excludeReconciliationId);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Số liệu vượt trần hợp đồng";
  }
}

// ==================== GIÁ VỐN ====================

/**
 * Trần theo loại chi phí:
 *   sale_commission   ≤ pmg_base × pmg_rate × commission_rate (HH sale hợp đồng)
 *   cdt_bonus_sale    ≤ products.cdt_bonus_sale (target CĐT thưởng NVKD)
 *   cdt_bonus_manager ≤ products.cdt_bonus_manager
 *   bonus_sale        ≤ products.bonus_sale
 *   bonus_manager     ≤ products.bonus_manager
 *   kpi_ceo           ≤ pmg × %KPI CEO
 *   kpi_tpkd          ≤ pmg × %KPI TPKD
 *   kpi_admin         ≤ pmg × %KPI Admin
 *   customer_support  ≤ products.customer_support (target HTK cam kết)
 */
function costCap(costType: string, p: {
  pmgBase: number;
  pmgRate: number;
  saleCommissionRate: number;
  cdtBonusSale: number;
  cdtBonusManager: number;
  bonusSale: number;
  bonusManager: number;
  kpiCeoRate: number;
  kpiTpkdRate: number;
  kpiAdminRate: number;
  customerSupport: number;
}): { cap: number; label: string } | null {
  const pmg = p.pmgBase * p.pmgRate; // Trần PMG_LK
  switch (costType) {
    case "sale_commission":
      return { cap: pmg * p.saleCommissionRate, label: "HH sale (PMG × %HH sale)" };
    case "cdt_bonus_sale":
      return { cap: p.cdtBonusSale, label: "CĐT thưởng NVKD" };
    case "cdt_bonus_manager":
      return { cap: p.cdtBonusManager, label: "CĐT thưởng QL" };
    case "bonus_sale":
      return { cap: p.bonusSale, label: "CTY thưởng sale" };
    case "bonus_manager":
      return { cap: p.bonusManager, label: "CTY thưởng QL" };
    case "kpi_ceo":
      return { cap: pmg * p.kpiCeoRate, label: "KPI CEO (PMG × %KPI CEO)" };
    case "kpi_tpkd":
      return { cap: pmg * p.kpiTpkdRate, label: "KPI TPKD (PMG × %KPI TPKD)" };
    case "kpi_admin":
      return { cap: pmg * p.kpiAdminRate, label: "KPI Admin (PMG × %KPI Admin)" };
    case "customer_support":
      return { cap: p.customerSupport, label: "Hỗ trợ khách (cam kết)" };
    default:
      return null;
  }
}

/**
 * Sau khi thêm/sửa đối chiếu giá vốn, tổng theo loại chi phí không được vượt trần hợp đồng.
 */
export async function assertCostCapNotExceeded(
  productId: number,
  costType: string,
  newAmount: number,
  excludeCostId?: number,
): Promise<void> {
  const [p] = await db
    .select({
      code: products.productCode,
      pmgBase: products.pmgBasePrice,
      pmgRate: products.pmgRate,
      saleCommissionRate: products.saleCommissionRate,
      cdtBonusSale: products.cdtBonusSale,
      cdtBonusManager: products.cdtBonusManager,
      bonusSale: products.bonusSale,
      bonusManager: products.bonusManager,
      kpiCeoRate: products.kpiCeoRate,
      kpiTpkdRate: products.kpiTpkdRate,
      kpiAdminRate: products.kpiAdminRate,
      customerSupport: products.customerSupport,
    })
    .from(products)
    .where(eq(products.id, productId));
  if (!p) return;

  const capInfo = costCap(costType, {
    pmgBase: Number(p.pmgBase ?? 0),
    pmgRate: Number(p.pmgRate ?? 0),
    saleCommissionRate: Number(p.saleCommissionRate ?? 0),
    cdtBonusSale: Number(p.cdtBonusSale ?? 0),
    cdtBonusManager: Number(p.cdtBonusManager ?? 0),
    bonusSale: Number(p.bonusSale ?? 0),
    bonusManager: Number(p.bonusManager ?? 0),
    kpiCeoRate: Number(p.kpiCeoRate ?? 0),
    kpiTpkdRate: Number(p.kpiTpkdRate ?? 0),
    kpiAdminRate: Number(p.kpiAdminRate ?? 0),
    customerSupport: Number(p.customerSupport ?? 0),
  });
  if (!capInfo || capInfo.cap <= 0) return;

  const conditions = [
    eq(costReconciliations.productId, productId),
    // costType đã validate ở tầng buildCostData(); cast để khớp union type Drizzle.
    eq(costReconciliations.costType, costType as (typeof costReconciliations.costType)["_"]["data"]),
  ];
  if (excludeCostId) conditions.push(ne(costReconciliations.id, excludeCostId));

  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${costReconciliations.amountPayableThisTime}), 0)`,
    })
    .from(costReconciliations)
    .where(and(...conditions));

  const existing = Number(row?.total ?? 0);
  const after = existing + newAmount;
  const capWithTolerance = capInfo.cap * (1 + TOLERANCE);

  if (after > capWithTolerance) {
    throw new Error(
      `Vượt trần ${capInfo.label} căn ${p.code}: tổng sau khi lưu = ${fmt(after)} VND (${pctStr(after, capInfo.cap)} trần). ` +
        `Trần hợp đồng = ${fmt(capInfo.cap)} VND. ` +
        `Kiểm tra lại số tiền hoặc căn được chọn.`,
    );
  }
}

/**
 * Chạy hết guard giá vốn, trả câu báo lỗi để hiện thẳng cho nhân viên, null nếu hợp lệ.
 * Lý do không throw: xem ghi chú ở kiemTraTranDoanhThu.
 */
export async function kiemTraTranGiaVon(
  productId: number,
  costType: string,
  amount: number,
  paymentProgressPct: number,
  excludeCostId?: number,
): Promise<string | null> {
  try {
    assertPaymentProgressPctInRange(paymentProgressPct);
    await assertCostCapNotExceeded(productId, costType, amount, excludeCostId);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Số liệu vượt trần hợp đồng";
  }
}

/**
 * payment_progress_pct (N — % khách đóng lũy kế) trên 1 dòng ≤ 100%.
 */
export function assertPaymentProgressPctInRange(pct: number): void {
  if (!pct) return;
  if (pct > 1 + TOLERANCE) {
    throw new Error(
      `Tiến độ thanh toán N = ${(pct * 100).toFixed(1)}% > 100%. Kiểm tra lại.`,
    );
  }
  if (pct < 0) {
    throw new Error(`Tiến độ thanh toán N = ${(pct * 100).toFixed(1)}% âm. Kiểm tra lại.`);
  }
}
