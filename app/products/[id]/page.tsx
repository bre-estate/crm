import { db } from "@/lib/db";
import {
  products,
  projects,
  partners,
  departments,
  revenueReconciliations,
  costReconciliations,
  invoices,
  paymentsIn,
  paymentsOut,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPct, fmtPctTight, fmtPctRaw, costTypeLabel, toTitleCase } from "@/lib/format";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [row] = await db
    .select({
      product: products,
      project: projects,
      partner: partners,
      department: departments,
    })
    .from(products)
    .leftJoin(projects, eq(products.projectId, projects.id))
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .leftJoin(departments, eq(products.departmentId, departments.id))
    .where(eq(products.id, id));
  if (!row) notFound();

  const p = row.product;
  const isSecondary = p.saleType === "secondary";

  const revRecs = await db
    .select({ rec: revenueReconciliations, invoice: invoices })
    .from(revenueReconciliations)
    .leftJoin(invoices, eq(revenueReconciliations.invoiceId, invoices.id))
    .where(eq(revenueReconciliations.productId, id))
    .orderBy(asc(revenueReconciliations.phaseNumber));

  const revPayments = await db
    .select({ payment: paymentsIn })
    .from(paymentsIn)
    .innerJoin(
      revenueReconciliations,
      eq(paymentsIn.reconciliationId, revenueReconciliations.id),
    )
    .where(eq(revenueReconciliations.productId, id))
    .orderBy(asc(paymentsIn.paymentDate));

  const costRecs = await db
    .select()
    .from(costReconciliations)
    .where(eq(costReconciliations.productId, id))
    .orderBy(asc(costReconciliations.reconciliationDate));

  const costPayments = await db
    .select({ payment: paymentsOut })
    .from(paymentsOut)
    .innerJoin(
      costReconciliations,
      eq(paymentsOut.costReconciliationId, costReconciliations.id),
    )
    .where(eq(costReconciliations.productId, id));

  // === Compute derived values ===
  // Phí HH sale dự kiến (net BRE nhận) = pmg_base × latestPmg − admin
  // Đồng nhất với "Tổng DT (CĐT chuyển BRE)" ở Section 1.
  const latestPmgRate = Math.max(
    Number(p.pmgRate ?? 0),
    ...revRecs.map((r) => Number(r.rec.pmgCumulativePct ?? 0)),
  );
  const expectedHHSaleGross = Number(p.pmgBasePrice ?? 0) * latestPmgRate;
  const expectedHHSale = isSecondary
    ? Number(p.totalRevenue ?? 0)
    : Math.max(0, expectedHHSaleGross - Number(p.adminFee ?? 0));
  const expectedBonus =
    Number(p.cdtBonusSale ?? 0) + Number(p.cdtBonusManager ?? 0);

  // Lịch sử %HH: ưu tiên product.pmgRateHistory (nhập explicit),
  // fallback distinct pmgCumulativePct từ các recon.
  const pmgHistory = ((): Array<{ date: string; rate: number; note?: string }> => {
    try {
      if (p.pmgRateHistory) {
        const arr = JSON.parse(p.pmgRateHistory) as Array<{
          rate: number;
          date: string;
          note?: string;
        }>;
        if (Array.isArray(arr) && arr.length > 0) {
          return arr
            .filter((e) => e.rate > 0)
            .sort((a, b) => a.rate - b.rate);
        }
      }
    } catch {
      // ignore
    }
    // Fallback: recon-derived
    const seen = new Map<number, string>();
    const sorted = [...revRecs].sort((a, b) =>
      (a.rec.reconciliationDate ?? "").localeCompare(b.rec.reconciliationDate ?? ""),
    );
    for (const r of sorted) {
      const rate = Number(r.rec.pmgCumulativePct ?? 0);
      if (rate > 0 && !seen.has(rate)) {
        seen.set(rate, r.rec.reconciliationDate ?? "");
      }
    }
    return Array.from(seen.entries())
      .map(([rate, date]) => ({ date, rate }))
      .sort((a, b) => a.rate - b.rate);
  })();

  // Đã thu tách theo loại: HH sale vs Thưởng nóng
  // Phân loại recon: nếu có cdtBonus > 0 và revThis = 0 → là recon thưởng nóng
  const isBonusRecon = (rec: (typeof revRecs)[number]["rec"]) => {
    const cdt =
      Number(rec.cdtBonusSale ?? 0) + Number(rec.cdtBonusManager ?? 0);
    const rev = Number(rec.revenueThisTime ?? 0);
    return cdt > 0 && rev === 0;
  };
  const hhReconIds = new Set(
    revRecs.filter((r) => !isBonusRecon(r.rec)).map((r) => r.rec.id),
  );
  const bonusReconIds = new Set(
    revRecs.filter((r) => isBonusRecon(r.rec)).map((r) => r.rec.id),
  );

  const paidHHSale = revPayments
    .filter((p) => p.payment.reconciliationId && hhReconIds.has(p.payment.reconciliationId))
    .reduce((s, r) => s + Number(r.payment.amount ?? 0), 0);
  const paidBonus = revPayments
    .filter((p) => p.payment.reconciliationId && bonusReconIds.has(p.payment.reconciliationId))
    .reduce((s, r) => s + Number(r.payment.amount ?? 0), 0);
  const totalPaidInCash = paidHHSale + paidBonus;

  // "Đã nhận" = sum totalReceivable của recons đã có biên bản ĐC.
  // totalReceivable đã là delta per đợt (đợt hồi tố chỉ chứa 4.795.525, không double count).
  const receivedHH = revRecs
    .filter((r) => !isBonusRecon(r.rec))
    .reduce((s, r) => s + Number(r.rec.totalReceivableThisTime ?? 0), 0);
  const receivedBonus = revRecs
    .filter((r) => isBonusRecon(r.rec))
    .reduce((s, r) => s + Number(r.rec.totalReceivableThisTime ?? 0), 0);

  // Data quality check: recon có CĐT thưởng nhưng config căn không nhập →
  // hiển thị warning banner để admin biết cần bổ sung config.
  const sumReconCdtSale = revRecs
    .filter((r) => isBonusRecon(r.rec))
    .reduce((s, r) => s + Number(r.rec.cdtBonusSale ?? 0), 0);
  const sumReconCdtMgr = revRecs
    .filter((r) => isBonusRecon(r.rec))
    .reduce((s, r) => s + Number(r.rec.cdtBonusManager ?? 0), 0);
  const missingCfgSale = Math.max(0, sumReconCdtSale - Number(p.cdtBonusSale ?? 0));
  const missingCfgMgr = Math.max(0, sumReconCdtMgr - Number(p.cdtBonusManager ?? 0));
  const hasMissingCdtBonusCfg = missingCfgSale >= 1000 || missingCfgMgr >= 1000;

  // Backward compat: một số biến còn dùng
  const expectedFee = expectedHHSale;
  const collectedFromCDT = paidHHSale;
  const rawRemaining = expectedHHSale - paidHHSale;
  const remainingFromCDT = Math.abs(rawRemaining) < 1000 ? 0 : Math.max(0, rawRemaining);
  const pctCollected =
    expectedHHSale > 0 ? (paidHHSale / expectedHHSale) * 100 : 0;
  const invoiceCount = new Set(revRecs.map((r) => r.invoice?.id).filter(Boolean)).size;
  const totalCostPayable = costRecs.reduce(
    (s, r) => s + Number(r.amountPayableThisTime ?? 0),
    0,
  );
  const totalPaidOut = costPayments.reduce((s, r) => s + Number(r.payment.amount ?? 0), 0);

  // === Rate derivation từ cost_recons cho Section 2 (nếu config = 0) ===
  const derivedRateByType = new Map<string, number>();
  const derivedFlatByType = new Map<string, number>();
  const derivedAdminFeeSaleFromRecons = costRecs.reduce(
    (max, r) => Math.max(max, Number(r.adminFeeSale ?? 0)),
    0,
  );
  for (const r of costRecs) {
    const t = r.costType;
    const rate = Number(r.kpiRate ?? 0) || Number(r.commissionRate ?? 0);
    if (rate > 0 && !derivedRateByType.has(t)) derivedRateByType.set(t, rate);
    const flat = Number(r.amountPayableThisTime ?? 0);
    derivedFlatByType.set(t, (derivedFlatByType.get(t) ?? 0) + flat);
  }
  // Ưu tiên số thực từ cost_recons (đã đối chiếu = ground truth), fallback config nếu chưa có.
  const effRate = (configRate: number | null, costType: string): number =>
    derivedRateByType.get(costType) || Number(configRate ?? 0) || 0;
  const effAmount = (configAmount: number | null, costType: string): number => {
    const actual = derivedFlatByType.get(costType);
    if (actual !== undefined && actual !== 0) return actual;
    return Number(configAmount ?? 0);
  };
  const effAdminFeeSale = derivedAdminFeeSaleFromRecons || Number(p.adminFeeSale ?? 0);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Breadcrumb + title */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/products" className="text-blue-600 hover:underline">
          ← Giao dịch
        </Link>
        <span className="text-slate-400">/</span>
        <span className="font-mono">{p.productCode}</span>
      </div>

      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="font-mono">{p.unitCode}</span>
            <span className="text-slate-400 mx-2">·</span>
            {row.project?.name}
          </h1>
          <div className="flex gap-2 mt-2 text-xs items-center flex-wrap">
            <Badge color={isSecondary ? "orange" : "sky"}>
              {isSecondary ? "Thứ cấp" : "Sơ cấp"}
            </Badge>
            {row.department && <Badge color="blue">{row.department.name}</Badge>}
            {!isSecondary && (
              <span className="text-slate-500">
                Đối tác: <b>{row.partner?.name ?? "—"}</b>
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/products/${id}/edit`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap"
        >
          Sửa giao dịch
        </Link>
      </div>

      {/* Quick summary strip */}
      {isSecondary ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card
            label="Doanh thu về cty"
            value={fmtMoney(p.totalRevenue)}
            sub="Từ Excel (đã net trung gian)"
          />
          <Card
            label="Tổng giá vốn"
            value={fmtMoney(p.totalCost)}
            sub="HH sale + phí phát sinh"
          />
          <Card
            label="Lãi dự kiến"
            value={fmtMoney(Number(p.totalRevenue ?? 0) - Number(p.totalCost ?? 0))}
            highlight={Number(p.totalRevenue ?? 0) - Number(p.totalCost ?? 0) >= 0}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card
            label="Giá tính PMG"
            value={fmtMoney(p.pmgBasePrice)}
            sub={`%PMG_LK: ${fmtPctTight(p.pmgRate)}`}
          />
          <Card
            label="Phí HH dự kiến BRE"
            value={fmtMoney(expectedFee)}
            sub="= (DT − admin) / 1.1 − CK"
          />
          <Card
            label="Đã thu"
            value={fmtMoney(collectedFromCDT)}
            highlight={pctCollected >= 99.5}
            sub={`${pctCollected.toFixed(0)}% · ${revRecs.length} đợt · ${invoiceCount} HĐ`}
          />
          <Card
            label="Còn phải thu"
            value={fmtMoney(remainingFromCDT)}
            warn={remainingFromCDT > 0}
            sub={remainingFromCDT > 0 ? "Chưa thu đủ" : "Đã thu đủ"}
          />
        </div>
      )}

      {/* Data quality warnings */}
      {hasMissingCdtBonusCfg && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex gap-3 items-start">
          <div className="text-2xl leading-none">⚠️</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">
              Thông tin căn thiếu nhập:
              {missingCfgSale >= 1000 && <span> &quot;chủ đầu tư thưởng sale&quot;</span>}
              {missingCfgSale >= 1000 && missingCfgMgr >= 1000 && <span>,</span>}
              {missingCfgMgr >= 1000 && <span> &quot;chủ đầu tư thưởng quản lý&quot;</span>}
            </div>
            <div className="mt-2">
              <Link
                href={`/products/${id}/edit`}
                className="text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700"
              >
                Sửa thông tin căn →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* === 1. THÔNG TIN CĂN === */}
      <SectionCard title="1. Thông tin căn" icon="🏠">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Info label="Mã căn" value={p.unitCode} mono />
          <Info label="Mã SP" value={p.productCode} mono small />
          <Info label="Loại giao dịch" value={isSecondary ? "Thứ cấp" : "Sơ cấp"} />
          <Info label="Dự án" value={row.project?.name ?? "—"} />
          {!isSecondary && <Info label="Đối tác (CĐT/F1)" value={row.partner?.name ?? "—"} />}
          <Info label="Mô tả căn" value={p.unitDescription ?? "—"} />
          <Info label="Tên khách" value={toTitleCase(p.customerName) || "—"} />
          <Info label="NVKD" value={toTitleCase(p.salesPerson) || "—"} />
          <Info
            label="Trưởng phòng (TPKD)"
            value={
              toTitleCase(p.deptLeaderName) ||
              toTitleCase(row.department?.leaderName) ||
              "—"
            }
          />
          <Info label="Phòng KD" value={row.department?.name ?? p.deptName ?? "—"} />
          <Info label="Ngày cọc" value={fmtDate(p.depositDate)} />
          <Info label="Tháng ghi nhận DT" value={p.recognitionMonth ?? "—"} mono />
        </div>
        {p.note && p.note.trim() && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Ghi chú</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{p.note}</div>
          </div>
        )}
      </SectionCard>

      {/* === 2. DOANH THU === (chỉ áp dụng sơ cấp) */}
      {!isSecondary && (
        <SectionCard title="2. Doanh thu (CĐT/F1 trả BRE)" icon="💰">
          {/* Row 1: Giá tính PMG + Lịch sử %PMG_LK */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Info
              label="Giá tính PMG (= giá bán)"
              value={fmtMoney(p.pmgBasePrice)}
            />
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Lịch sử %PMG_LK</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {pmgHistory.length === 0 ? (
                  <span className="text-sm font-medium tabular-nums">
                    {fmtPctTight(p.pmgRate)}
                  </span>
                ) : (
                  pmgHistory.map((h, i) => (
                    <span
                      key={h.rate}
                      className={`text-xs px-2 py-0.5 rounded ${i === pmgHistory.length - 1 ? "bg-amber-200 text-amber-900 font-semibold" : "bg-slate-200 text-slate-600"}`}
                    >
                      {fmtPct(h.rate, 2)}
                      {h.date && <span className="ml-1 text-[10px] opacity-70">({fmtDate(h.date)})</span>}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Phí admin */}
          {(() => {
            const feeReal = Number(p.adminFee ?? 0);
            const feeSale = Number(p.adminFeeSale ?? 0);
            const sameFee = Math.abs(feeReal - feeSale) < 1000;
            if (sameFee) {
              return (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Info
                    label="Phí admin"
                    value={fmtMoney(feeReal)}
                    tooltip="Số CĐT trừ khỏi PMG trước khi trả BRE. Đồng thời cũng là số dùng khi tính HH sale."
                  />
                </div>
              );
            }
            return (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Info
                  label="Phí admin (CĐT trừ)"
                  value={fmtMoney(feeReal)}
                  tooltip="Số CĐT trừ khỏi PMG trước khi trả BRE (VD PMG 100M − admin 8,8M → BRE nhận 91,2M)."
                />
                <Info
                  label="Phí admin (tính HH sale)"
                  value={fmtMoney(feeSale)}
                  tooltip={`Số dùng trong công thức tính HH sale — thấp hơn phí thực (${fmtMoney(feeReal)}) để sale nhận HH cao hơn. Chênh ${fmtMoney(feeReal - feeSale)} công ty tự chịu.`}
                />
              </div>
            );
          })()}

          {/* Row 3: CĐT thưởng nóng */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Info label="CĐT thưởng nóng cho sale" value={fmtMoney(p.cdtBonusSale)} />
            <Info label="CĐT thưởng nóng cho QL" value={fmtMoney(p.cdtBonusManager)} />
          </div>

          {/* 3 cards Tổng doanh thu — theo công thức Excel sheet 2.1 col P */}
          {(() => {
            const pmgBase = Number(p.pmgBasePrice ?? 0);
            const rate = latestPmgRate;
            const admin = Number(p.adminFee ?? 0);
            const otherFeePct = Number(p.otherFeePct ?? 0);
            const otherRevenue = Number(p.otherRevenue ?? 0);
            const revenueReduction = Number(p.revenueReduction ?? 0);
            const cdtSale = Number(p.cdtBonusSale ?? 0);
            const cdtMgr = Number(p.cdtBonusManager ?? 0);
            const pmgSaleRate = Number(p.pmgSaleRate ?? 0) || rate;
            // Excel col P: T × (U+V) + W − X − Y + AA + AB
            //   T=pmgBase, U=%PMG_LK, V=%phí khác, W=DT khác, X=giảm DT,
            //   Y=phí admin, AA=CĐT thưởng sale, AB=CĐT thưởng QL
            const gross =
              pmgBase * (rate + otherFeePct) + otherRevenue - revenueReduction - admin + cdtSale + cdtMgr;
            const netIn = pmgBase * rate - admin; // DT thuần (không CĐT thưởng)
            const thangDu = pmgBase * Math.max(0, rate - pmgSaleRate);
            return (
              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
                  Tổng doanh thu (theo %PMG_LK mới nhất {fmtPct(rate, 2)})
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-${thangDu > 0 ? 3 : 2} gap-3`}>
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                    <div className="text-xs text-blue-700 font-semibold">A. Tổng ghi nhận</div>
                    <div className="text-lg font-bold tabular-nums mt-1">{fmtMoney(gross)}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      = PMG × (%PMG_LK + %phí khác) + DT khác − giảm DT − phí admin + CĐT thưởng
                    </div>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50/60 p-3">
                    <div className="text-xs text-green-700 font-semibold">B. DT thuần nội bộ</div>
                    <div className="text-lg font-bold tabular-nums mt-1">{fmtMoney(netIn)}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      = Giá tính PMG × %PMG_LK − phí admin
                    </div>
                  </div>
                  {thangDu > 0 && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-3">
                      <div className="text-xs text-purple-700 font-semibold">C. DT thặng dư</div>
                      <div className="text-lg font-bold tabular-nums mt-1">{fmtMoney(thangDu)}</div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        PMG × (%PMG_LK − %PMG_LK_sale) — CTY giữ + bù admin
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </SectionCard>
      )}

      {/* === 3. GIÁ VỐN === */}
      <SectionCard title={isSecondary ? "2. Giá vốn (BRE trả NVKD)" : "3. Giá vốn (BRE trả nội bộ)"} icon="🏦">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          {!isSecondary && (
            <Info
              label="%PMG_LK_sale (base HH sale + KPI)"
              value={fmtPctTight(p.pmgSaleRate)}
              tooltip="Base BRE dùng để tính HH sale + KPI. Chênh so với %PMG_LK = phần BRE giữ (thưởng manager + bù admin)."
            />
          )}
          <Info
            label="%HH sale (NVKD)"
            value={fmtPctTight(effRate(p.saleCommissionRate, "sale_commission"))}
          />
          {!isSecondary && (
            <>
              <Info label="%KPI CEO" value={fmtPctTight(effRate(p.kpiCeoRate, "kpi_ceo"))} />
              <Info label="%KPI TPKD" value={fmtPctTight(effRate(p.kpiTpkdRate, "kpi_tpkd"))} />
              <Info label="%KPI Admin" value={fmtPctTight(effRate(p.kpiAdminRate, "kpi_admin"))} />
            </>
          )}
          <Info
            label="Hỗ trợ khách"
            value={fmtMoney(effAmount(p.customerSupport, "customer_support"))}
          />
          <Info
            label="CTY thưởng QL"
            value={fmtMoney(effAmount(p.bonusManager, "bonus_manager"))}
          />
        </div>

        {/* Tổng giá vốn — theo công thức Excel sheet 2.1 col R:
             ((L×M − Q)/1.1 − R) × (%HH + Σ%KPI) + (CĐT_thưởng)/1.1 + CTY thưởng + CP giá vốn khác
        */}
        {(() => {
          const pmgBase = Number(p.pmgBasePrice ?? 0);
          const pmgSaleRate = Number(p.pmgSaleRate ?? 0) || Number(p.pmgRate ?? 0);
          const adminSale = Number(p.adminFeeSale ?? 0);
          const support = Number(p.customerSupport ?? 0);
          const bonusSale = Number(p.bonusSale ?? 0);
          const bonusMgr = Number(p.bonusManager ?? 0);
          const cdtSale = Number(p.cdtBonusSale ?? 0);
          const cdtMgr = Number(p.cdtBonusManager ?? 0);
          const otherCost = Number(p.otherCost ?? 0);
          const hhRate = Number(p.saleCommissionRate ?? 0);
          const kpiCeo = Number(p.kpiCeoRate ?? 0);
          const kpiTpkd = Number(p.kpiTpkdRate ?? 0);
          const kpiAdmin = Number(p.kpiAdminRate ?? 0);

          // Base net VAT sau khi trừ admin sale và hỗ trợ khách
          const baseNet = (pmgBase * pmgSaleRate - adminSale) / 1.1 - support;
          const hhSaleAmt = baseNet * hhRate;
          const kpiCeoAmt = baseNet * kpiCeo;
          const kpiTpkdAmt = baseNet * kpiTpkd;
          const kpiAdminAmt = baseNet * kpiAdmin;
          const cdtBonusNet = (cdtSale + cdtMgr) / 1.1; // CĐT thưởng đã trừ VAT

          const total =
            hhSaleAmt + kpiCeoAmt + kpiTpkdAmt + kpiAdminAmt + cdtBonusNet + bonusSale + bonusMgr + otherCost;

          const tooltipText =
            `= HH sale (${fmtMoney(hhSaleAmt)}) + KPI CEO (${fmtMoney(kpiCeoAmt)}) + KPI TPKD (${fmtMoney(kpiTpkdAmt)}) + KPI Admin (${fmtMoney(kpiAdminAmt)}) + CĐT thưởng net VAT (${fmtMoney(cdtBonusNet)}) + CTY thưởng NVKD (${fmtMoney(bonusSale)}) + CTY thưởng QL (${fmtMoney(bonusMgr)}) + CP giá vốn khác (${fmtMoney(otherCost)}). Base net = ((${fmtMoney(pmgBase)} × ${fmtPct(pmgSaleRate, 2)} − ${fmtMoney(adminSale)}) / 1,1 − ${fmtMoney(support)})`;
          return (
            <div className="border-t border-slate-200 pt-3">
              <div className="rounded-lg border-2 border-orange-200 bg-orange-50/60 p-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm font-semibold text-orange-900 flex items-center gap-1.5">
                    Tổng giá vốn
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-300 text-white text-[10px] cursor-help select-none"
                      title={tooltipText}
                    >
                      ?
                    </span>
                  </div>
                  <div className="text-xl font-bold tabular-nums text-orange-900">
                    {fmtMoney(total)}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </SectionCard>

      {/* === 3. CƠ CẤU PHÂN BỔ TIỀN === */}
      <SectionCard
        title={
          isSecondary
            ? "3. Cơ cấu doanh thu / giá vốn"
            : "4. Cơ cấu phân bổ tiền (dự kiến khi thu đủ 100%)"
        }
        icon="📊"
      >
        {isSecondary ? (
          (() => {
            const dt = Number(p.totalRevenue ?? 0);
            // Lấy amount thật từ cost_recon (KHÔNG dùng rate từ product làm amount).
            const hhSale = Number(derivedFlatByType.get("sale_commission") ?? 0);
            const kpiCeo = Number(derivedFlatByType.get("kpi_ceo") ?? 0);
            const kpiTpkd = Number(derivedFlatByType.get("kpi_tpkd") ?? 0);
            const kpiAdmin = Number(derivedFlatByType.get("kpi_admin") ?? 0);
            const support = Number(derivedFlatByType.get("customer_support") ?? p.customerSupport ?? 0);
            const bonusSale = Number(derivedFlatByType.get("bonus_sale") ?? p.bonusSale ?? 0);
            const bonusMgr = Number(derivedFlatByType.get("bonus_manager") ?? p.bonusManager ?? 0);
            const otherCost = Number(p.otherCost ?? 0);
            const configTotalCost = Number(p.totalCost ?? 0);
            const derivedCostSum =
              hhSale + kpiCeo + kpiTpkd + kpiAdmin + support + bonusSale + bonusMgr + otherCost;
            // Ưu tiên breakdown thực từ cost_recon; nếu chưa có → dùng totalCost từ config
            const hasBreakdown = derivedCostSum > 0;
            const totalCost = hasBreakdown ? derivedCostSum : configTotalCost;
            const profit = dt - totalCost;
            const profitPct = dt > 0 ? (profit / dt) * 100 : 0;
            const rows: Array<[string, number]> = (
              [
                ["HH NVKD", hhSale],
                ["KPI CEO", kpiCeo],
                ["KPI TPKD", kpiTpkd],
                ["KPI Admin", kpiAdmin],
                ["Hỗ trợ khách", support],
                ["Thưởng NVKD (CTY)", bonusSale],
                ["Thưởng TPKD (CTY)", bonusMgr],
                ["Chi phí khác", otherCost],
              ] as Array<[string, number]>
            ).filter(([, v]) => v > 0);
            return (
              <div className="text-sm">
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 mb-3">
                  <div className="text-xs uppercase text-blue-700 font-semibold mb-2">
                    Bước 1 · Doanh thu về cty
                  </div>
                  <Row label="Từ giao dịch thứ cấp" value={fmtMoney(dt)} bold color="green" />
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 mb-3">
                  <div className="text-xs uppercase text-orange-700 font-semibold mb-2">
                    Bước 2 · Chi phí
                  </div>
                  {hasBreakdown ? (
                    <>
                      {rows.map(([label, val]) => (
                        <Row
                          key={label}
                          label={label}
                          value={`− ${fmtMoney(val)}`}
                          color="red"
                        />
                      ))}
                      <div className="border-t border-orange-200 mt-1 pt-1">
                        <Row
                          label="Tổng chi"
                          value={`− ${fmtMoney(totalCost)}`}
                          bold
                          color="red"
                        />
                      </div>
                    </>
                  ) : configTotalCost > 0 ? (
                    <>
                      <Row
                        label="Tổng giá vốn (từ config, chưa có đối chiếu chi tiết)"
                        value={`− ${fmtMoney(configTotalCost)}`}
                        color="red"
                      />
                      <div className="text-xs text-slate-500 mt-1 italic">
                        Chưa có dòng đối chiếu chi tiết ở mục 4. Số này lấy từ trường "Tổng giá vốn" khi nhập.
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500 italic">
                      Chưa có chi phí nào (chưa nhập Tổng giá vốn và chưa có dòng đối chiếu ở mục 4).
                    </div>
                  )}
                </div>
                <div
                  className={`rounded-lg border-2 p-4 ${
                    profit >= 0 ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-xs uppercase font-semibold text-slate-600">
                        Bước 3 · Lợi nhuận công ty
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        DT − Tổng chi = {fmtPctRaw(profitPct, 1)} biên
                      </div>
                    </div>
                    <div
                      className={`text-2xl font-bold tabular-nums ${
                        profit >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {fmtMoney(profit)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()
        ) : (() => {
          const pmgBase = Number(p.pmgBasePrice ?? 0);
          const pmgRate = Number(p.pmgRate ?? 0);
          const pmgSaleRate = Number(p.pmgSaleRate ?? 0) || pmgRate; // fallback nếu chưa nhập
          const adminFee = Number(p.adminFee ?? 0);
          const cdtBonusSale = Number(p.cdtBonusSale ?? 0);
          const cdtBonusMgr = Number(p.cdtBonusManager ?? 0);
          const totalRevenue = Number(p.totalRevenue ?? 0);
          const totalCostStored = Number(p.totalCost ?? 0);

          // Business logic (2026-07-10 confirmed with admin):
          // Công thức Excel sheet 2.1 col R:
          //   base_net = (pmgBase × pmgSaleRate − admin_sale) / 1,1 − hỗ trợ khách
          //   HH sale = base_net × %HH + (CĐT thưởng sale + CĐT thưởng QL)/1,1 + CTY thưởng NVKD
          //   KPI CEO/TPKD/Admin = base_net × %KPI
          //   Phí admin sale (BRE trả F1) — hiển thị info, KHÔNG cộng vào tổng
          //   Tổng = HH sale + KPI CEO + KPI TPKD + KPI Admin + CTY thưởng QL + Chi phí khác
          const grossFeeFromCDT = pmgBase * pmgRate;
          const adminFeeSaleAmt = Number(p.adminFeeSale ?? 0);
          const supportAmt =
            derivedFlatByType.get("customer_support") || Number(p.customerSupport ?? 0);
          const baseNet = (pmgBase * pmgSaleRate - adminFeeSaleAmt) / 1.1 - supportAmt;

          // % lấy từ actual cost_recons trước, fallback config
          const hhSaleRate =
            derivedRateByType.get("sale_commission") || Number(p.saleCommissionRate ?? 0);
          const kpiCeoRate =
            derivedRateByType.get("kpi_ceo") || Number(p.kpiCeoRate ?? 0);
          const kpiTpkdRate =
            derivedRateByType.get("kpi_tpkd") || Number(p.kpiTpkdRate ?? 0);
          const kpiAdminRate =
            derivedRateByType.get("kpi_admin") || Number(p.kpiAdminRate ?? 0);

          const cdtBonusNet = (cdtBonusSale + cdtBonusMgr) / 1.1;
          const bonusSaleCtyAmt =
            derivedFlatByType.get("bonus_sale") || Number(p.bonusSale ?? 0);
          const bonusMgrCtyAmt =
            derivedFlatByType.get("bonus_manager") || Number(p.bonusManager ?? 0);
          const otherCostAmt = Number(p.otherCost ?? 0);

          // HH sale (NVKD) đầy đủ theo admin: base_net × %HH + CĐT bonus/1.1 + CTY thưởng NVKD
          const hhSaleBase = baseNet * hhSaleRate;
          const hhSaleAmt = hhSaleBase + cdtBonusNet + bonusSaleCtyAmt;
          const kpiCeoAmt = baseNet * kpiCeoRate;
          const kpiTpkdAmt = baseNet * kpiTpkdRate;
          const kpiAdminAmt = baseNet * kpiAdminRate;

          // Doanh thu công ty (A) = Tổng ghi nhận theo Excel col P
          const dtThuanNoibo =
            pmgBase * pmgRate - adminFee + cdtBonusSale + cdtBonusMgr;

          // Tổng chi phí (Excel col R): HH+KPI+CTY thưởng QL+chi phí khác
          // (KHÔNG cộng phí admin sale - đó là số CĐT giữ tính vào base)
          const totalCost =
            hhSaleAmt + kpiCeoAmt + kpiTpkdAmt + kpiAdminAmt + bonusMgrCtyAmt + otherCostAmt;
          // Lợi nhuận công ty theo công thức kế toán: P/1,1 − R (Excel col S)
          //   P/1,1 = trừ VAT 10% khỏi tổng doanh thu ghi nhận
          //   R    = tổng giá vốn (đã net VAT)
          const dtNetVat = dtThuanNoibo / 1.1;
          const loiNhuan = dtNetVat - totalCost;
          const bienLN = dtNetVat > 0 ? (loiNhuan / dtNetVat) * 100 : 0;

          const costRows: Array<[string, number, string?]> = [];
          if (adminFeeSaleAmt > 0)
            costRows.push([
              "Phí admin sale (BRE trả F1)",
              adminFeeSaleAmt,
              "Đã trừ trong base tính HH+KPI, hiển thị info — không cộng vào tổng",
            ]);
          if (hhSaleAmt > 0) {
            const parts: string[] = [`${fmtPctTight(hhSaleRate)} × base = ${fmtMoney(hhSaleBase)}`];
            if (cdtBonusNet > 0)
              parts.push(`+ CĐT thưởng/1,1 = ${fmtMoney(cdtBonusNet)}`);
            if (bonusSaleCtyAmt > 0)
              parts.push(`+ CTY thưởng NVKD = ${fmtMoney(bonusSaleCtyAmt)}`);
            costRows.push([`HH sale (NVKD)`, hhSaleAmt, parts.join(" ")]);
          }
          if (kpiCeoAmt > 0)
            costRows.push([`KPI CEO — ${fmtPctTight(kpiCeoRate)} × base`, kpiCeoAmt]);
          if (kpiTpkdAmt > 0)
            costRows.push([`KPI TPKD — ${fmtPctTight(kpiTpkdRate)} × base`, kpiTpkdAmt]);
          if (kpiAdminAmt > 0)
            costRows.push([`KPI Admin — ${fmtPctTight(kpiAdminRate)} × base`, kpiAdminAmt]);
          if (bonusMgrCtyAmt > 0) costRows.push(["CTY thưởng QL", bonusMgrCtyAmt]);
          if (otherCostAmt !== 0) costRows.push(["Chi phí khác", otherCostAmt]);

          return (
            <div className="text-sm space-y-3">
              {/* Doanh thu công ty */}
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-3">
                <div className="text-xs uppercase text-green-700 font-semibold mb-2">
                  A. Tổng doanh thu ghi nhận
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  Số CĐT trả BRE (bao gồm cả thưởng nóng transit).
                </div>
                <Row
                  label={`= Giá PMG × ${fmtPctTight(pmgRate)} − phí admin + CĐT thưởng`}
                  value={fmtMoney(dtThuanNoibo)}
                  bold
                  color="green"
                />
              </div>

              {/* Chi phí */}
              <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                <div className="text-xs uppercase text-orange-700 font-semibold mb-2">
                  B. Chi phí phân bổ
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  Base tính HH sale + KPI = (Giá PMG × {fmtPctTight(pmgSaleRate)} − phí admin sale) / 1,1 − hỗ trợ khách = <b>{fmtMoney(baseNet)}</b>
                </div>
                {costRows.map(([label, amt, sub]) => {
                  const isInfo = label.startsWith("Phí admin sale");
                  return (
                    <Row
                      key={label}
                      label={label}
                      value={isInfo ? fmtMoney(amt) : `− ${fmtMoney(amt)}`}
                      color={isInfo ? undefined : "red"}
                      sub={sub}
                    />
                  );
                })}
                <div className="border-t border-orange-200 mt-1 pt-1">
                  <Row
                    label="Tổng chi phí"
                    value={`− ${fmtMoney(totalCost)}`}
                    bold
                    color="red"
                  />
                </div>
              </div>

              {/* Lợi nhuận */}
              <div
                className={`rounded-lg border-2 p-4 ${
                  loiNhuan >= 0 ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm uppercase font-semibold text-slate-700">
                      C. Lợi nhuận công ty (dự kiến)
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      = A / 1,1 − B · Biên {fmtPctRaw(bienLN, 1)}
                    </div>
                  </div>
                  <div
                    className={`text-2xl font-bold tabular-nums ${
                      loiNhuan >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {fmtMoney(loiNhuan)}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500 italic">
                Số dự kiến khi thu đủ 100% phí. Số thực đã trả có thể khác — xem ở mục 6.
              </div>
            </div>
          );
        })()}
      </SectionCard>

      {/* === 4. THU PHÍ TỪ CĐT === (chỉ áp dụng cho sơ cấp) */}
      {!isSecondary && (
      <SectionCard title="5. Thu phí HH từ CĐT" icon="💵">
        {(() => {
          const hasBonus = expectedBonus > 0 || receivedBonus > 0;
          const expectedTotal = expectedHHSale + expectedBonus;
          const paidTotal = paidHHSale + paidBonus;
          const receivedTotal = receivedHH + receivedBonus;
          const remaining = Math.max(0, expectedTotal - paidTotal);
          const remainDCPending = Math.max(0, receivedTotal - paidTotal); // đã ĐC chưa thu
          const remainNotDC = Math.max(0, expectedTotal - receivedTotal); // chưa lập biên bản
          const pct = expectedTotal > 0 ? (paidTotal / expectedTotal) * 100 : 0;
          const isDone = remaining < 1000;
          return (
            <>
              <div className="text-xs text-slate-600 mb-3 -mt-1">
                Thu phí từ CĐT gồm{" "}
                {hasBonus ? (
                  <>
                    <b>HH sale</b> ({fmtMoney(expectedHHSale)}) + <b>Thưởng nóng CĐT</b> (
                    {fmtMoney(expectedBonus)}) = {fmtMoney(expectedTotal)}
                  </>
                ) : (
                  <>
                    <b>HH sale</b> theo %PMG_LK mới nhất {fmtPct(latestPmgRate, 2)}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                <Info
                  label="Dự kiến"
                  value={fmtMoney(expectedTotal)}
                  tooltip={
                    hasBonus
                      ? `= HH sale (${fmtMoney(expectedHHSale)}) + Thưởng nóng (${fmtMoney(expectedBonus)}). HH sale = pmg_base × %PMG_LK − admin.`
                      : `= pmg_base × %PMG_LK − admin. Với ${fmtPct(latestPmgRate, 2)}: ${fmtMoney(expectedHHSaleGross)} − ${fmtMoney(p.adminFee)} = ${fmtMoney(expectedHHSale)}`
                  }
                />
                <Info
                  label="Đã nhận (vào TK)"
                  value={fmtMoney(paidTotal)}
                  tooltip={
                    hasBonus
                      ? `Tổng CĐT đã chuyển vào TK. Trong đó: HH sale ${fmtMoney(paidHHSale)} + Thưởng nóng ${fmtMoney(paidBonus)}.`
                      : "Số CĐT đã thực chuyển vào tài khoản BRE."
                  }
                  accent="green"
                />
                <Info
                  label="Còn phải nhận"
                  value={fmtMoney(remaining)}
                  tooltip={
                    remaining > 0
                      ? `= Dự kiến − Đã nhận. Trong đó: ${fmtMoney(remainDCPending)} đã ĐC chờ CĐT chuyển tiền, ${fmtMoney(remainNotDC)} chưa lập biên bản ĐC.`
                      : "Đã thu đủ"
                  }
                  accent={isDone ? "slate" : "red"}
                />
                <Info
                  label="% đã nhận"
                  value={expectedTotal > 0 ? fmtPctRaw(pct, 1) : "—"}
                  accent={isDone ? "green" : "red"}
                />
              </div>
              {/* Breakdown chi tiết */}
              {(remainDCPending >= 1000 || remainNotDC >= 1000) && (
                <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-4">
                  <span className="font-semibold text-amber-800">Trong phần còn phải nhận:</span>
                  {remainDCPending >= 1000 && (
                    <span className="ml-2">
                      ⏳ <b className="tabular-nums">{fmtMoney(remainDCPending)}</b> đã ĐC (có biên
                      bản), chờ CĐT chuyển tiền
                    </span>
                  )}
                  {remainNotDC >= 1000 && (
                    <span className="ml-2">
                      📋 <b className="tabular-nums">{fmtMoney(remainNotDC)}</b> chưa lập biên bản ĐC
                    </span>
                  )}
                </div>
              )}
            </>
          );
        })()}

        <div className="flex justify-between items-center mb-2">
          <div className="text-xs text-slate-500 uppercase font-semibold">
            Các đợt đối chiếu với CĐT ({revRecs.length})
          </div>
          <Link
            href={`/revenues/new?productId=${id}`}
            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700"
          >
            + Thêm đợt
          </Link>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-center p-2 whitespace-nowrap">Đợt</th>
                <th className="text-left p-2 whitespace-nowrap">Ngày ĐC</th>
                <th className="text-left p-2 whitespace-nowrap">Số HĐ</th>
                <th className="text-left p-2 whitespace-nowrap">Ngày HĐ</th>
                <th className="text-right p-2 whitespace-nowrap">%PMG</th>
                <th className="text-right p-2 whitespace-nowrap">Số tiền đợt</th>
                <th className="text-right p-2 whitespace-nowrap">Phải thu</th>
                <th className="text-left p-2 whitespace-nowrap">Trạng thái</th>
                <th className="text-right p-2 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {revRecs.map(({ rec, invoice }) => {
                const hasDate = !!rec.reconciliationDate;
                const paidForThisRec = revPayments
                  .filter((p) => p.payment.reconciliationId === rec.id)
                  .reduce((s, p) => s + Number(p.payment.amount ?? 0), 0);
                const receivable = Number(rec.totalReceivableThisTime ?? 0);
                const isFullyPaid = receivable > 0 && Math.abs(paidForThisRec - receivable) < 1000;
                const isPartialPaid = paidForThisRec > 0 && !isFullyPaid;
                // 3 label chính: Đã ĐC, Đã thanh toán, Hoàn thành
                let status: { label: string; color: string } = { label: "Chưa ĐC", color: "bg-slate-100 text-slate-600" };
                if (!hasDate && isFullyPaid) status = { label: "Đã thanh toán", color: "bg-green-100 text-green-700" };
                else if (!hasDate) status = { label: "Chưa ĐC", color: "bg-slate-100 text-slate-600" };
                else if (isFullyPaid) status = { label: "Hoàn thành", color: "bg-green-100 text-green-700" };
                else if (isPartialPaid) status = { label: "Đã ĐC · TT 1 phần", color: "bg-orange-100 text-orange-700" };
                else status = { label: "Đã ĐC", color: "bg-yellow-100 text-yellow-700" };
                return (
                  <tr key={rec.id} className="border-t border-slate-100">
                    <td className="p-2 text-center font-semibold">{rec.phaseNumber ?? "—"}</td>
                    <td className="p-2">{fmtDate(rec.reconciliationDate)}</td>
                    <td className="p-2 font-mono">{invoice?.invoiceNumber ?? "—"}</td>
                    <td className="p-2">{fmtDate(invoice?.invoiceDate)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {rec.pmgCumulativePct ? fmtPct(rec.pmgCumulativePct) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums font-medium">
                      {fmtMoney(rec.revenueThisTime)}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold">
                      {fmtMoney(rec.totalReceivableThisTime)}
                    </td>
                    <td className="p-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <Link
                        href={`/revenues/${rec.id}/edit`}
                        className="text-blue-600 hover:underline"
                      >
                        Sửa
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {revRecs.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-slate-500">
                    Chưa có đợt đối chiếu nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {revPayments.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-2 flex items-center gap-2">
              <span>Đã nhận thanh toán ({revPayments.length})</span>
              {revPayments.length < revRecs.length && (
                <span className="normal-case font-normal text-slate-400">
                  · {revRecs.length - revPayments.length} đợt đã ĐC nhưng chưa vào TK
                </span>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left p-2">Ngày nhận</th>
                    <th className="text-right p-2">Số tiền thực nhận</th>
                    <th className="text-left p-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {revPayments.map((r) => (
                    <tr key={r.payment.id} className="border-t border-slate-100">
                      <td className="p-2">{fmtDate(r.payment.paymentDate)}</td>
                      <td className="p-2 text-right tabular-nums font-medium text-green-700">
                        {fmtMoney(r.payment.amount)}
                      </td>
                      <td className="p-2 text-slate-500">{r.payment.note ?? "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td className="p-2">Tổng đã thu</td>
                    <td className="p-2 text-right tabular-nums text-green-700">
                      {fmtMoney(totalPaidInCash)}
                    </td>
                    <td className="p-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>
      )}

      {/* === 5. TRẢ PHÍ NỘI BỘ === */}
      <SectionCard title={isSecondary ? "4. Trả phí NVKD" : "6. Trả phí nội bộ (HH sale, KPI, thưởng)"} icon="🏦">
        {(() => {
          // Nếu chưa có payments_out riêng, coi dòng đối chiếu = đã trả
          const hasExplicitPayments = totalPaidOut > 0;
          return (
            <div
              className={`grid ${hasExplicitPayments ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"} gap-3 mb-4`}
            >
              <Info
                label="Tổng đã đối chiếu"
                value={fmtMoney(totalCostPayable)}
                accent="green"
                tooltip="Đối chiếu = đã thoả thuận số. Trong hệ thống hiện tại, đối chiếu = đã chi trả (nếu chưa có thanh toán riêng)."
              />
              {hasExplicitPayments &&
                (() => {
                  const remaining = Math.max(0, totalCostPayable - totalPaidOut);
                  const isDone = remaining < 1000;
                  return (
                    <>
                      <Info label="Đã trả" value={fmtMoney(totalPaidOut)} accent="green" />
                      <Info
                        label="Còn phải trả"
                        value={fmtMoney(remaining)}
                        accent={isDone ? "slate" : "red"}
                      />
                    </>
                  );
                })()}
              {!hasExplicitPayments && (
                <Info
                  label="Số dòng đối chiếu"
                  value={String(costRecs.length)}
                  tooltip="Mỗi dòng = 1 cá nhân × 1 lần đối chiếu."
                />
              )}
            </div>
          );
        })()}

        <div className="flex justify-between items-center mb-2">
          <div className="text-xs text-slate-500 uppercase font-semibold">
            Các dòng đối chiếu ({costRecs.length})
          </div>
          <Link
            href={`/costs/new?productId=${id}`}
            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700"
          >
            + Thêm dòng
          </Link>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">Ngày ĐC</th>
                <th className="text-left p-2 whitespace-nowrap">Người</th>
                <th className="text-left p-2 whitespace-nowrap">Loại chi phí</th>
                <th className="text-right p-2 whitespace-nowrap">%HH / %KPI</th>
                <th className="text-right p-2 whitespace-nowrap">Phải trả</th>
                <th className="text-left p-2 whitespace-nowrap">Ngày TT</th>
                <th className="text-right p-2 whitespace-nowrap">Đã trả</th>
                <th className="text-left p-2 whitespace-nowrap">Trạng thái</th>
                <th className="text-right p-2 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {costRecs.map((r) => {
                const payable = Number(r.amountPayableThisTime ?? 0);
                const paymentsForRec = costPayments.filter(
                  (p) => p.payment.costReconciliationId === r.id,
                );
                const paidAmt = paymentsForRec.reduce((s, p) => s + Number(p.payment.amount ?? 0), 0);
                const paidDate = paymentsForRec.find((p) => p.payment.paymentDate)?.payment.paymentDate;
                const hasDate = !!r.reconciliationDate;
                const isFullyPaid = payable !== 0 && Math.abs(paidAmt - payable) < 1000;
                const isPartial = paidAmt !== 0 && !isFullyPaid;
                let status: { label: string; color: string } = { label: "Chưa ĐC", color: "bg-slate-100 text-slate-600" };
                if (!hasDate && isFullyPaid) status = { label: "Đã thanh toán", color: "bg-green-100 text-green-700" };
                else if (!hasDate) status = { label: "Chưa ĐC", color: "bg-slate-100 text-slate-600" };
                else if (isFullyPaid) status = { label: "Hoàn thành", color: "bg-green-100 text-green-700" };
                else if (isPartial) status = { label: "Đã ĐC · TT 1 phần", color: "bg-orange-100 text-orange-700" };
                else status = { label: "Đã ĐC", color: "bg-yellow-100 text-yellow-700" };
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-2">{fmtDate(r.reconciliationDate)}</td>
                    <td className="p-2">{toTitleCase(r.employeeName)}</td>
                    <td className="p-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 whitespace-nowrap">
                        {costTypeLabel(r.costType)}
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {r.kpiRate ? fmtPct(r.kpiRate) : fmtPct(r.commissionRate)}
                    </td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${payable < 0 ? "text-red-600" : ""}`}
                      title={payable < 0 ? "Số âm = điều chỉnh / hoàn trả" : ""}
                    >
                      {fmtMoney(payable)}
                    </td>
                    <td className="p-2">{fmtDate(paidDate)}</td>
                    <td className="p-2 text-right tabular-nums text-green-700">
                      {paidAmt > 0 ? fmtMoney(paidAmt) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="p-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <Link
                        href={`/costs/${r.id}/edit`}
                        className="text-blue-600 hover:underline"
                      >
                        Sửa
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {costRecs.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-slate-500">
                    Chưa có dòng giá vốn nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  color,
  sub,
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: "green" | "red";
  sub?: string;
}) {
  const valCls = [
    "tabular-nums",
    bold ? "font-semibold" : "",
    color === "green" ? "text-green-700" : color === "red" ? "text-red-600" : "text-slate-800",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex justify-between items-baseline py-0.5">
      <div className="flex-1 text-sm text-slate-700">
        {label}
        {sub && <span className="text-xs text-slate-400 ml-1">({sub})</span>}
      </div>
      <div className={valCls}>{value}</div>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: "sky" | "orange" | "blue" }) {
  const cls =
    color === "sky"
      ? "bg-sky-100 text-sky-700"
      : color === "orange"
        ? "bg-orange-100 text-orange-700"
        : "bg-blue-100 text-blue-700";
  return <span className={`px-2 py-0.5 rounded whitespace-nowrap ${cls}`}>{children}</span>;
}

function Card({
  label,
  value,
  sub,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  let cls = "bg-white border-slate-200";
  if (warn) cls = "bg-orange-50 border-orange-300";
  else if (highlight) cls = "bg-green-50 border-green-300";
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function Info({
  label,
  value,
  mono,
  small,
  accent,
  tooltip,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  accent?: "green" | "orange" | "red" | "slate";
  tooltip?: string;
}) {
  const valueCls = [
    "font-medium tabular-nums mt-1",
    small ? "text-xs" : "text-sm",
    mono ? "font-mono" : "",
    accent === "green"
      ? "text-green-700"
      : accent === "orange"
        ? "text-orange-700"
        : accent === "red"
          ? "text-red-600"
          : accent === "slate"
            ? "text-slate-500"
            : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="text-xs text-slate-500 flex items-center gap-1">
        <span>{label}</span>
        {tooltip && (
          <span
            title={tooltip}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-300 text-white text-[10px] cursor-help select-none"
          >
            ?
          </span>
        )}
      </div>
      <div className={valueCls}>{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="text-base font-semibold text-slate-800 pb-2 border-b border-slate-100">
        {icon && <span className="mr-2">{icon}</span>}
        {title}
      </div>
      {children}
    </div>
  );
}
