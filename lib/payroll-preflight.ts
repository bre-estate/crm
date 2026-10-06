/**
 * Soát kỳ lương trước khi xuất bảng hoa hồng.
 *
 * Ra đời sau sự cố 25/09/2026: năm dòng FENICA lưu %PMG_LK_sale 7,5% trong khi
 * hợp đồng ghi 6,5%, giao diện có cảnh báo nhưng không chặn, rồi bảng lương
 * chạy theo và chi dư 22.507.771. Chốt chặn ở tầng lưu đã có, nhưng những dòng
 * lưu trước đó vẫn nằm trong cơ sở dữ liệu, nên cần một lớp soát trước khi
 * tiền ra khỏi công ty.
 *
 * Lỗi chặn (chan = true) thì khoá nút xuất. Cảnh báo thì chỉ hiện.
 */
import { db } from "@/lib/db";
import {
  costReconciliations,
  products,
  employees,
} from "@/lib/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { computeLuyKe, type CostType } from "@/lib/costCalc";

const DUNG_SAI = 0.001;

export type MucSoat = {
  ma: string;
  ten: string;
  chan: boolean;
  dat: boolean;
  /** Mỗi dòng là một phát hiện, đã viết sẵn thành câu đọc được. */
  chiTiet: { nhan: string; mo_ta: string; duongDan?: string }[];
};

const LABEL_CHI_PHI: Record<string, string> = {
  sale_commission: "HH sale",
  kpi_ceo: "KPI CEO",
  kpi_tpkd: "KPI TPKD",
  kpi_admin: "KPI Admin",
  bonus_sale: "CTY thưởng sale",
  bonus_manager: "CTY thưởng QL",
  cdt_bonus_sale: "CĐT thưởng NVKD",
  cdt_bonus_manager: "CĐT thưởng QL",
  customer_support: "Hỗ trợ khách",
};

const tien = (n: number) => Math.round(n).toLocaleString("vi-VN");
const phanTram = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;

/**
 * Chạy toàn bộ phép soát trên khoảng ngày đối chiếu.
 * Không giới hạn theo nhân viên: bảng lương một người sai thường do dòng của
 * người khác trên cùng căn, nên phải soát cả kỳ.
 */
export async function soatKyLuong(input: {
  fromDate: string;
  toDate: string;
}): Promise<MucSoat[]> {
  const trongKy = and(
    gte(costReconciliations.reconciliationDate, input.fromDate),
    lte(costReconciliations.reconciliationDate, input.toDate),
  );

  const dsDong = await db
    .select({
      id: costReconciliations.id,
      costType: costReconciliations.costType,
      nguoi: costReconciliations.employeeName,
      tyLeDong: costReconciliations.pmgLkSaleRate,
      tienDo: costReconciliations.paymentProgressPct,
      soTien: costReconciliations.amountPayableThisTime,
      productId: costReconciliations.productId,
      ma: products.productCode,
      tyLeCan: products.pmgSaleRate,
      tyLeDoanhThu: products.pmgRate,
    })
    .from(costReconciliations)
    .innerJoin(products, eq(products.id, costReconciliations.productId))
    .where(trongKy);

  // ── 1. Tỷ lệ trên dòng cao hơn hợp đồng ──────────────────────────────
  const saiTyLe = dsDong
    .filter((d) => {
      const r = Number(d.tyLeDong ?? 0);
      const tran = Number(d.tyLeCan ?? 0);
      return r > 0 && tran > 0 && r > tran * (1 + DUNG_SAI);
    })
    .map((d) => {
      const r = Number(d.tyLeDong ?? 0);
      const nhamDoanhThu =
        Math.abs(r - Number(d.tyLeDoanhThu ?? 0)) < 1e-9
          ? " Đây là tỷ lệ phía doanh thu, không dùng cho giá vốn."
          : "";
      return {
        nhan: `${d.ma} · ${LABEL_CHI_PHI[d.costType] ?? d.costType}`,
        mo_ta:
          `ghi ${phanTram(r)}, hợp đồng ${phanTram(Number(d.tyLeCan ?? 0))}.` +
          nhamDoanhThu,
        duongDan: `/costs/${d.id}/edit`,
      };
    });

  // ── 2. Lũy kế vượt trần hợp đồng ─────────────────────────────────────
  // Trần tính trên toàn bộ lịch sử của căn, không chỉ trong kỳ, vì các đợt
  // trước vẫn nằm trong cùng một trần.
  const capTrongKy = new Map<string, { productId: number; ma: string; loai: string }>();
  for (const d of dsDong) {
    capTrongKy.set(`${d.productId}|${d.costType}`, {
      productId: d.productId!,
      ma: d.ma!,
      loai: d.costType,
    });
  }

  const vuotTran: MucSoat["chiTiet"] = [];
  for (const { productId, ma, loai } of capTrongKy.values()) {
    const [p] = await db
      .select({
        pmgBasePrice: products.pmgBasePrice,
        pmgSaleRate: products.pmgSaleRate,
        adminFeeSale: products.adminFeeSale,
        customerSupport: products.customerSupport,
        saleCommissionRate: products.saleCommissionRate,
        kpiCeoRate: products.kpiCeoRate,
        kpiTpkdRate: products.kpiTpkdRate,
        kpiAdminRate: products.kpiAdminRate,
        bonusSale: products.bonusSale,
        bonusManager: products.bonusManager,
        cdtBonusSale: products.cdtBonusSale,
        cdtBonusManager: products.cdtBonusManager,
      })
      .from(products)
      .where(eq(products.id, productId));
    if (!p) continue;

    const [tong] = await db
      .select({ t: sql<string>`COALESCE(SUM(${costReconciliations.amountPayableThisTime}), 0)` })
      .from(costReconciliations)
      .where(
        and(
          eq(costReconciliations.productId, productId),
          eq(
            costReconciliations.costType,
            loai as (typeof costReconciliations.costType)["_"]["data"],
          ),
        ),
      );

    const cfg = {
      pmgBasePrice: Number(p.pmgBasePrice ?? 0),
      pmgSaleRate: Number(p.pmgSaleRate ?? 0),
      adminFeeSale: Number(p.adminFeeSale ?? 0),
      customerSupport: Number(p.customerSupport ?? 0),
      saleCommissionRate: Number(p.saleCommissionRate ?? 0),
      kpiCeoRate: Number(p.kpiCeoRate ?? 0),
      kpiTpkdRate: Number(p.kpiTpkdRate ?? 0),
      kpiAdminRate: Number(p.kpiAdminRate ?? 0),
      bonusSale: Number(p.bonusSale ?? 0),
      bonusManager: Number(p.bonusManager ?? 0),
      cdtBonusSale: Number(p.cdtBonusSale ?? 0),
      cdtBonusManager: Number(p.cdtBonusManager ?? 0),
    };
    const tran = computeLuyKe(cfg, loai as CostType, 1);
    const luyKe = Number(tong?.t ?? 0);
    if (tran > 0 && luyKe > tran * (1 + DUNG_SAI)) {
      vuotTran.push({
        nhan: `${ma} · ${LABEL_CHI_PHI[loai] ?? loai}`,
        mo_ta: `lũy kế ${tien(luyKe)}, trần ${tien(tran)}, dư ${tien(luyKe - tran)}.`,
        duongDan: `/costs?productCode=${encodeURIComponent(ma)}`,
      });
    }
  }

  // ── 3. Tiến độ thanh toán quá 100% ───────────────────────────────────
  const tienDoLoi = dsDong
    .filter((d) => Number(d.tienDo ?? 0) > 1 + DUNG_SAI)
    .map((d) => ({
      nhan: `${d.ma} · ${LABEL_CHI_PHI[d.costType] ?? d.costType}`,
      mo_ta: `tiến độ N ghi ${phanTram(Number(d.tienDo ?? 0))}, không thể quá 100%.`,
      duongDan: `/costs/${d.id}/edit`,
    }));

  // ── 4. Dòng chưa có tên người ────────────────────────────────────────
  const thieuTen = dsDong
    .filter((d) => !d.nguoi || !String(d.nguoi).trim())
    .map((d) => ({
      nhan: `${d.ma} · ${LABEL_CHI_PHI[d.costType] ?? d.costType}`,
      mo_ta: `chưa điền tên người được đối chiếu, số tiền ${tien(Number(d.soTien ?? 0))} sẽ không vào bảng lương của ai.`,
      duongDan: `/costs/${d.id}/edit`,
    }));

  // ── 5. Tên người không khớp danh sách nhân sự ────────────────────────
  const dsNhanSu = await db.select({ ten: employees.name }).from(employees);
  const tapNhanSu = new Set(
    dsNhanSu.map((e) => String(e.ten ?? "").trim().toLowerCase()),
  );
  const lacTen = new Map<string, number>();
  for (const d of dsDong) {
    const ten = String(d.nguoi ?? "").trim();
    if (!ten) continue;
    if (tapNhanSu.has(ten.toLowerCase())) continue;
    lacTen.set(ten, (lacTen.get(ten) ?? 0) + 1);
  }
  const khongKhopTen = [...lacTen.entries()].map(([ten, n]) => ({
    nhan: ten,
    mo_ta: `có ${n} dòng đối chiếu nhưng tên này không có trong danh sách nhân sự, bảng lương sẽ bỏ sót.`,
    duongDan: `/employees`,
  }));

  return [
    {
      ma: "ty_le",
      ten: "Tỷ lệ %PMG_LK_sale đúng hợp đồng",
      chan: true,
      dat: saiTyLe.length === 0,
      chiTiet: saiTyLe,
    },
    {
      ma: "vuot_tran",
      ten: "Lũy kế không vượt trần hợp đồng",
      chan: true,
      dat: vuotTran.length === 0,
      chiTiet: vuotTran,
    },
    {
      ma: "tien_do",
      ten: "Tiến độ thanh toán không quá 100%",
      chan: true,
      dat: tienDoLoi.length === 0,
      chiTiet: tienDoLoi,
    },
    {
      ma: "thieu_ten",
      ten: "Dòng nào cũng có tên người nhận",
      chan: true,
      dat: thieuTen.length === 0,
      chiTiet: thieuTen,
    },
    {
      ma: "khop_nhan_su",
      ten: "Tên người khớp danh sách nhân sự",
      chan: false,
      dat: khongKhopTen.length === 0,
      chiTiet: khongKhopTen,
    },
  ];
}
