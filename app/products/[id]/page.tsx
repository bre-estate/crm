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
import { fmtMoney, fmtDate, fmtPct, fmtPctTight, costTypeLabel, toTitleCase } from "@/lib/format";
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

  // Lịch sử %HH: distinct pmgCumulativePct từ các recon, sort tăng dần theo ngày
  const pmgHistory = ((): Array<{ date: string; rate: number }> => {
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

      {/* === 1. THÔNG TIN CĂN === */}
      <SectionCard title="1. Thông tin căn" icon="🏠">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Info label="Mã căn" value={p.unitCode} mono />
          <Info label="Mã SP" value={p.productCode} mono small />
          <Info label="Dự án" value={row.project?.name ?? "—"} />
          {!isSecondary && <Info label="Đối tác (CĐT)" value={row.partner?.name ?? "—"} />}
          <Info label="Loại giao dịch" value={isSecondary ? "Thứ cấp" : "Sơ cấp"} />
          <Info label="Mô tả căn" value={p.unitDescription ?? "—"} />
          {isSecondary ? (
            <Info label="Doanh thu về cty" value={fmtMoney(p.totalRevenue)} />
          ) : (
            <>
              {(() => {
                const sell = Number(p.sellPrice ?? 0);
                const pmg = Number(p.pmgBasePrice ?? 0);
                if (sell === 0 || sell === pmg) {
                  return <Info label="Giá tính PMG (giá tính hoa hồng)" value={fmtMoney(pmg)} />;
                }
                return (
                  <>
                    <Info label="Giá bán" value={fmtMoney(sell)} />
                    <Info label="Giá tính PMG (giá tính HH)" value={fmtMoney(pmg)} />
                  </>
                );
              })()}
              <Info
                label="Tổng DT (CĐT chuyển BRE)"
                value={fmtMoney(p.totalRevenue)}
                tooltip={`= Giá tính PMG × %PMG_LK − Phí admin. Với căn này: ${fmtMoney(Number(p.pmgBasePrice ?? 0))} × ${(Number(p.pmgRate ?? 0) * 100).toFixed(2)}% − ${fmtMoney(p.adminFee)} = ${fmtMoney(p.totalRevenue)}. Số thực CĐT chuyển vào TK BRE (sau khi CĐT trừ admin). KHÔNG bao gồm thưởng nóng CĐT.`}
              />
              <Info
                label="Phí admin"
                value={fmtMoney(p.adminFee)}
                tooltip="Phí admin trả cho sàn F1 liên kết. BRE KHÔNG nhận khoản này (CĐT trừ trước khi chuyển BRE)."
              />
              <Info label="Chiết khấu (CK)" value={fmtMoney(p.discountCk)} />
            </>
          )}
          <Info label="Tháng ghi nhận DT" value={p.recognitionMonth ?? "—"} mono />
        </div>
      </SectionCard>

      {/* === 2. KHÁCH HÀNG & GIAO DỊCH === */}
      <SectionCard title="2. Khách hàng & tỷ lệ phí" icon="👤">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
          <Info label="Ngày HT dự kiến" value={fmtDate(p.expectedCompleteDate)} />
          <Info label="PTTT" value={p.paymentMethod ?? "—"} />
        </div>

        {!isSecondary && (
          <div className="border-t border-slate-200 mt-3 pt-3">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
              Tỷ lệ %
            </div>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {(() => {
                const r1 = Number(p.pmgRate ?? 0);
                const r2 = Number(p.pmgSaleRate ?? 0);
                if (r1 === r2 || r2 === 0) {
                  return (
                    <Info
                      label="%PMG_LK (CĐT trả BRE)"
                      value={fmtPctTight(r1)}
                      tooltip="Tỷ lệ hoa hồng CĐT trả cho BRE trên giá tính PMG."
                    />
                  );
                }
                return (
                  <>
                    <Info
                      label="%PMG_LK (CĐT trả BRE)"
                      value={fmtPctTight(r1)}
                      tooltip="Tỷ lệ CĐT chuyển cho BRE (bao gồm phần thưởng gộp)."
                    />
                    <Info
                      label="%PMG_LK_sale (base HH sale + KPI)"
                      value={fmtPctTight(r2)}
                      tooltip="Base BRE dùng để tính HH sale + KPI. Chênh so với %PMG_LK = phần BRE giữ (thưởng manager + cty giữ)."
                    />
                  </>
                );
              })()}
              <Info
                label="%HH sale (NVKD)"
                value={fmtPctTight(effRate(p.saleCommissionRate, "sale_commission"))}
              />
              <Info label="%KPI CEO" value={fmtPctTight(effRate(p.kpiCeoRate, "kpi_ceo"))} />
              <Info label="%KPI TPKD" value={fmtPctTight(effRate(p.kpiTpkdRate, "kpi_tpkd"))} />
              <Info label="%KPI Admin" value={fmtPctTight(effRate(p.kpiAdminRate, "kpi_admin"))} />
              <Info label="%phí khác" value={fmtPctTight(p.otherFeePct)} />
            </div>
          </div>
        )}

        {(() => {
          const support = effAmount(p.customerSupport, "customer_support");
          const bonusSale = effAmount(p.bonusSale, "bonus_sale");
          const bonusMgr = effAmount(p.bonusManager, "bonus_manager");
          const cdtBonusSale = Number(p.cdtBonusSale ?? 0);
          const cdtBonusMgr = Number(p.cdtBonusManager ?? 0);
          const adminFeeSale = effAdminFeeSale;
          const otherCost = Number(p.otherCost ?? 0);
          const items: Array<[string, number]> = isSecondary
            ? [
                ["Hỗ trợ khách", support],
                ["Thưởng NVKD (CTY)", bonusSale],
                ["Thưởng TPKD (CTY)", bonusMgr],
                ["CP giá vốn khác", otherCost],
              ]
            : [
                ["Hỗ trợ khách", support],
                ["Thưởng NVKD (CTY)", bonusSale],
                ["Thưởng TPKD (CTY)", bonusMgr],
                ["Thưởng sale (CĐT)", cdtBonusSale],
                ["Thưởng TPKD (CĐT)", cdtBonusMgr],
                ["Phí admin sale", adminFeeSale],
                ["CP giá vốn khác", otherCost],
              ];
          const visible = items.filter(([, v]) => v !== 0);
          if (visible.length === 0) return null;
          return (
            <div className="border-t border-slate-200 mt-3 pt-3">
              <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
                Khoản thưởng / hỗ trợ
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {visible.map(([label, val]) => (
                  <Info key={label} label={label} value={fmtMoney(val)} />
                ))}
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
            : "3. Cơ cấu phân bổ tiền (dự kiến khi thu đủ 100%)"
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
                        DT − Tổng chi = {profitPct.toFixed(1)}% biên
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
          const totalCost = Number(p.totalCost ?? 0);

          // Business logic (2026-07-07 confirmed):
          // - CĐT/F1 trả BRE: pmgBase × pmgRate + cdtBonus - adminFee
          // - Base tính HH sale + KPI: Q_sale = pmgBase × pmgSaleRate
          // - BRE giữ chênh: pmgBase × (pmgRate − pmgSaleRate) = thưởng manager + cty giữ
          // - CĐT thưởng NVKD/QL = transit (chuyển tiếp cho NV/manager)
          const grossFeeFromCDT = pmgBase * pmgRate;
          const Q_sale = pmgBase * pmgSaleRate;
          const chenh = pmgBase * (pmgRate - pmgSaleRate); // BRE giữ (cty + thưởng manager)

          // % lấy từ actual cost_recons trước, fallback config
          const hhSaleRate =
            derivedRateByType.get("sale_commission") || Number(p.saleCommissionRate ?? 0);
          const kpiCeoRate =
            derivedRateByType.get("kpi_ceo") || Number(p.kpiCeoRate ?? 0);
          const kpiTpkdRate =
            derivedRateByType.get("kpi_tpkd") || Number(p.kpiTpkdRate ?? 0);
          const kpiAdminRate =
            derivedRateByType.get("kpi_admin") || Number(p.kpiAdminRate ?? 0);

          const hhSaleAmt = Q_sale * hhSaleRate;
          const kpiCeoAmt = Q_sale * kpiCeoRate;
          const kpiTpkdAmt = Q_sale * kpiTpkdRate;
          const kpiAdminAmt = Q_sale * kpiAdminRate;
          const adminFeeSaleAmt = Number(p.adminFeeSale ?? 0);
          const supportAmt =
            derivedFlatByType.get("customer_support") || Number(p.customerSupport ?? 0);
          const bonusSaleCtyAmt =
            derivedFlatByType.get("bonus_sale") || Number(p.bonusSale ?? 0);
          const bonusMgrCtyAmt =
            derivedFlatByType.get("bonus_manager") || Number(p.bonusManager ?? 0);
          const otherCostAmt = Number(p.otherCost ?? 0);

          const chiTuQSale =
            hhSaleAmt +
            kpiCeoAmt +
            kpiTpkdAmt +
            kpiAdminAmt +
            adminFeeSaleAmt +
            supportAmt +
            bonusSaleCtyAmt +
            otherCostAmt;
          const conLaiQSale = Q_sale - chiTuQSale; // Q_sale còn dư sau khi trả HH + KPI + chi khác
          const chenhSauThuongMgr = chenh - bonusMgrCtyAmt; // Chênh còn lại sau thưởng manager
          const breProfit = conLaiQSale + chenhSauThuongMgr;
          const totalReceived = grossFeeFromCDT - adminFee;
          const breProfitPct = totalReceived > 0 ? (breProfit / totalReceived) * 100 : 0;

          const acctProfit = totalRevenue > 0 && totalCost > 0 ? totalRevenue / 1.1 - totalCost : null;

          return (
            <div className="text-sm">
              {/* Bước 1: CĐT trả BRE tổng cộng */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 mb-3">
                <div className="text-xs uppercase text-blue-700 font-semibold mb-2">
                  Bước 1 · CĐT / F1 trả BRE
                </div>
                <Row label="Giá tính PMG" value={fmtMoney(pmgBase)} />
                <Row
                  label={`× %PMG_LK (${fmtPctTight(pmgRate)}) — HH thô`}
                  value={fmtMoney(grossFeeFromCDT)}
                />
                {cdtBonusSale > 0 && (
                  <Row label="+ CĐT thưởng NVKD (chuyển tiếp)" value={fmtMoney(cdtBonusSale)} />
                )}
                {cdtBonusMgr > 0 && (
                  <Row label="+ CĐT thưởng TPKD (chuyển tiếp)" value={fmtMoney(cdtBonusMgr)} />
                )}
                {adminFee > 0 && (
                  <Row
                    label="− Phí admin CĐT giữ (BRE ko nhận)"
                    value={`− ${fmtMoney(adminFee)}`}
                    color="red"
                  />
                )}
                <Row
                  label="= Tổng doanh thu (P)"
                  value={fmtMoney(totalRevenue || grossFeeFromCDT + cdtBonusSale + cdtBonusMgr - adminFee)}
                  bold
                  color="green"
                />
              </div>

              {/* Bước 2: Chia pool */}
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 mb-3">
                <div className="text-xs uppercase text-green-700 font-semibold mb-2">
                  Bước 2 · Chia thành 2 pool
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  Base chia HH sale + KPI dùng %PMG_LK_sale, không dùng %PMG_LK (nếu CĐT/F1 offer
                  mức tốt hơn thì BRE giữ lại chênh lệch).
                </div>
                <Row
                  label={`Pool A · Q_sale (base HH sale + KPI) = Giá PMG × ${fmtPctTight(pmgSaleRate)}`}
                  value={fmtMoney(Q_sale)}
                  bold
                  color="green"
                />
                {chenh > 0 && (
                  <Row
                    label={`Pool B · BRE giữ chênh = Giá PMG × ${fmtPctTight(pmgRate - pmgSaleRate)}`}
                    value={fmtMoney(chenh)}
                    bold
                    color="green"
                    sub="cty giữ + thưởng manager"
                  />
                )}
              </div>

              {/* Bước 3a: Chi từ Q_sale */}
              <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 mb-3">
                <div className="text-xs uppercase text-orange-700 font-semibold mb-2">
                  Bước 3 · Chi từ Q_sale
                </div>
                {hhSaleRate > 0 && (
                  <Row
                    label={`HH NVKD (${fmtPctTight(hhSaleRate)} × Q_sale)`}
                    value={`− ${fmtMoney(hhSaleAmt)}`}
                    color="red"
                  />
                )}
                {kpiCeoRate > 0 && (
                  <Row
                    label={`KPI CEO (${fmtPctTight(kpiCeoRate)} × Q_sale)`}
                    value={`− ${fmtMoney(kpiCeoAmt)}`}
                    color="red"
                  />
                )}
                {kpiTpkdRate > 0 && (
                  <Row
                    label={`KPI TPKD (${fmtPctTight(kpiTpkdRate)} × Q_sale)`}
                    value={`− ${fmtMoney(kpiTpkdAmt)}`}
                    color="red"
                  />
                )}
                {kpiAdminRate > 0 && (
                  <Row
                    label={`KPI Admin (${fmtPctTight(kpiAdminRate)} × Q_sale)`}
                    value={`− ${fmtMoney(kpiAdminAmt)}`}
                    color="red"
                  />
                )}
                {adminFeeSaleAmt > 0 && (
                  <Row
                    label="Phí admin sale"
                    value={`− ${fmtMoney(adminFeeSaleAmt)}`}
                    color="red"
                  />
                )}
                {supportAmt > 0 && (
                  <Row label="Hỗ trợ khách" value={`− ${fmtMoney(supportAmt)}`} color="red" />
                )}
                {bonusSaleCtyAmt > 0 && (
                  <Row
                    label="Thưởng NVKD (CTY)"
                    value={`− ${fmtMoney(bonusSaleCtyAmt)}`}
                    color="red"
                  />
                )}
                {otherCostAmt !== 0 && (
                  <Row
                    label="Chi phí khác"
                    value={`− ${fmtMoney(otherCostAmt)}`}
                    color="red"
                  />
                )}
                <div className="border-t border-orange-200 mt-1 pt-1">
                  <Row
                    label="Còn lại từ Q_sale"
                    value={fmtMoney(conLaiQSale)}
                    bold
                    color={conLaiQSale >= 0 ? "green" : "red"}
                  />
                </div>
              </div>

              {/* Bước 3b: Chi từ Pool B (chênh) */}
              {chenh > 0 && (
                <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 mb-3">
                  <div className="text-xs uppercase text-purple-700 font-semibold mb-2">
                    Bước 4 · Chi từ Pool B (chênh)
                  </div>
                  {bonusMgrCtyAmt > 0 && (
                    <Row
                      label="Thưởng TPKD/Manager (CTY)"
                      value={`− ${fmtMoney(bonusMgrCtyAmt)}`}
                      color="red"
                    />
                  )}
                  <div className="border-t border-purple-200 mt-1 pt-1">
                    <Row
                      label="Còn lại từ Pool B = Cty giữ"
                      value={fmtMoney(chenhSauThuongMgr)}
                      bold
                      color={chenhSauThuongMgr >= 0 ? "green" : "red"}
                    />
                  </div>
                </div>
              )}

              {/* Bước 5: Lợi nhuận */}
              <div
                className={`rounded-lg border-2 p-4 ${
                  breProfit >= 0 ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs uppercase font-semibold text-slate-600">
                      {chenh > 0 ? "Bước 5" : "Bước 4"} · Lợi nhuận công ty (dự kiến)
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Còn Q_sale + Còn Pool B = {breProfitPct.toFixed(1)}% biên (trên DT thuần)
                    </div>
                  </div>
                  <div
                    className={`text-2xl font-bold tabular-nums ${
                      breProfit >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {fmtMoney(breProfit)}
                  </div>
                </div>
                {acctProfit !== null && Math.abs(acctProfit - breProfit) > 10000 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-slate-500">
                    Kế toán tính (P÷1,1 − R từ Excel):{" "}
                    <b>{fmtMoney(acctProfit)}</b> (chênh do CĐT thưởng transit + VAT logic)
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500 mt-3 italic">
                Đây là <b>cơ cấu dự kiến</b> khi thu đủ 100% phí. Số thực đã trả (có thể khác
                do đàm phán) xem ở mục 5 — <b>{costRecs.length}</b> dòng đối chiếu, tổng đã
                trả <b>{fmtMoney(totalCostPayable)}</b>.
              </div>
            </div>
          );
        })()}
      </SectionCard>

      {/* === 4. THU PHÍ TỪ CĐT === (chỉ áp dụng cho sơ cấp) */}
      {!isSecondary && (
      <SectionCard title="4. Thu phí HH từ CĐT" icon="💰">
        {/* Lịch sử %HH nếu có nhiều mốc */}
        {pmgHistory.length > 1 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs">
            <div className="font-semibold text-amber-900 mb-1">
              📈 Lịch sử thay đổi %PMG_LK (hồi tố)
            </div>
            <div className="flex flex-wrap gap-2">
              {pmgHistory.map((h, i) => (
                <span
                  key={h.rate}
                  className={`px-2 py-1 rounded ${i === pmgHistory.length - 1 ? "bg-amber-200 text-amber-900 font-semibold" : "bg-white text-amber-700"}`}
                >
                  {(h.rate * 100).toFixed(2)}%{" "}
                  <span className="text-amber-600">({fmtDate(h.date)})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* HH sale */}
        <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
          HH sale (theo %PMG_LK mới nhất: {(latestPmgRate * 100).toFixed(2)}%)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Info
            label="Dự kiến"
            value={fmtMoney(expectedHHSale)}
            tooltip={`= pmg_base × %PMG_LK − admin. Với %PMG_LK ${(latestPmgRate * 100).toFixed(2)}% hiện tại: ${fmtMoney(expectedHHSaleGross)} − ${fmtMoney(p.adminFee)} = ${fmtMoney(expectedHHSale)}`}
          />
          <Info
            label="Đã nhận"
            value={fmtMoney(receivedHH)}
            tooltip="Tổng các đợt ĐC đã lập (cộng cả hồi tố). Vd căn A1-12A-07: 125.629.179 (đợt 1) + 4.795.525 (đợt 3 hồi tố) = 130.424.704"
            accent="green"
          />
          <Info
            label="Còn phải nhận"
            value={fmtMoney(Math.max(0, expectedHHSale - receivedHH))}
            tooltip="Dự kiến − Đã nhận"
            accent="orange"
          />
          <Info
            label="% đã nhận"
            value={
              expectedHHSale > 0 ? `${((receivedHH / expectedHHSale) * 100).toFixed(1)}%` : "—"
            }
          />
        </div>

        {/* Thưởng nóng (nếu có) */}
        {(expectedBonus > 0 || receivedBonus > 0) && (
          <>
            <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
              Thưởng nóng CĐT (transit)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Info label="Dự kiến" value={fmtMoney(expectedBonus)} />
              <Info label="Đã nhận" value={fmtMoney(receivedBonus)} accent="green" />
              <Info
                label="Còn phải nhận"
                value={fmtMoney(Math.max(0, expectedBonus - receivedBonus))}
                accent="orange"
              />
              <Info
                label="% đã nhận"
                value={
                  expectedBonus > 0 ? `${((receivedBonus / expectedBonus) * 100).toFixed(1)}%` : "—"
                }
              />
            </div>
          </>
        )}

        {/* Tổng đã thực nhận vào TK bank (từ payments_in) */}
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50/60 p-3 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm font-semibold text-blue-900">
                💰 Đã thực nhận vào TK bank (payments_in)
              </div>
              <div className="text-xs text-blue-700 mt-0.5">
                Số tiền CĐT thực chuyển vào ngân hàng — khác với "Đã nhận" ở trên (là số ghi
                nhận trên biên bản ĐC/HĐ, có thể chưa vào TK)
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums text-blue-900">
              {fmtMoney(totalPaidInCash)}
            </div>
          </div>
        </div>

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
                <th className="text-right p-2 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {revRecs.map(({ rec, invoice }) => (
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
                  <td className="p-2 text-right">
                    <Link
                      href={`/revenues/${rec.id}/edit`}
                      className="text-blue-600 hover:underline"
                    >
                      Sửa
                    </Link>
                  </td>
                </tr>
              ))}
              {revRecs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-500">
                    Chưa có đợt đối chiếu nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {revPayments.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
              Đã nhận thanh toán ({revPayments.length})
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
                    <td className="p-2">Tổng đã thu (payment_in)</td>
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
      <SectionCard title={isSecondary ? "4. Trả phí NVKD" : "5. Trả phí nội bộ (HH sale, KPI, thưởng)"} icon="🏦">
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
              {hasExplicitPayments && (
                <>
                  <Info label="Ghi nhận thanh toán riêng" value={fmtMoney(totalPaidOut)} />
                  <Info
                    label="Còn phải trả"
                    value={fmtMoney(Math.max(0, totalCostPayable - totalPaidOut))}
                    accent="orange"
                  />
                </>
              )}
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

        {/* Completeness check per loại chi phí */}
        {(() => {
          const pmgBase = Number(p.pmgBasePrice ?? 0);
          const pmgSaleRate = Number(p.pmgSaleRate ?? 0) || Number(p.pmgRate ?? 0);
          const Q_sale = pmgBase * pmgSaleRate;

          type Row = { key: string; label: string; target: number; actual: number };
          const rows: Row[] = [];
          const addRow = (key: string, label: string, target: number) => {
            const actual = costRecs
              .filter((r) => r.costType === key)
              .reduce((s, r) => s + Number(r.amountPayableThisTime ?? 0), 0);
            if (target > 0 || actual !== 0) {
              rows.push({ key, label, target, actual });
            }
          };

          addRow("sale_commission", "HH sale (NVKD)", Q_sale * Number(p.saleCommissionRate ?? 0));
          addRow("kpi_ceo", "KPI CEO", Q_sale * Number(p.kpiCeoRate ?? 0));
          addRow("kpi_tpkd", "KPI TPKD", Q_sale * Number(p.kpiTpkdRate ?? 0));
          addRow("kpi_admin", "KPI Admin", Q_sale * Number(p.kpiAdminRate ?? 0));
          addRow("customer_support", "Hỗ trợ khách", Number(p.customerSupport ?? 0));
          addRow("bonus_sale", "Thưởng NVKD (CTY)", Number(p.bonusSale ?? 0));
          addRow("bonus_manager", "Thưởng TPKD (CTY)", Number(p.bonusManager ?? 0));
          addRow("cdt_bonus_sale", "Thưởng nóng CĐT (NVKD)", Number(p.cdtBonusSale ?? 0));
          addRow("cdt_bonus_manager", "Thưởng nóng CĐT (TPKD)", Number(p.cdtBonusManager ?? 0));

          if (rows.length === 0) return null;
          return (
            <div className="mb-4">
              <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
                Kiểm tra hoàn thành (Target vs Đã chi)
              </div>
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left p-2">Loại</th>
                      <th className="text-right p-2">Target</th>
                      <th className="text-right p-2">Đã chi</th>
                      <th className="text-right p-2">Còn / Vượt</th>
                      <th className="text-right p-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const diff = row.actual - row.target;
                      const pct = row.target > 0 ? (row.actual / row.target) * 100 : 0;
                      const isDone = row.target > 0 && Math.abs(diff) < 1000;
                      const isOver = row.target > 0 && diff > 1000;
                      const isUnder = row.target > 0 && diff < -1000;
                      return (
                        <tr key={row.key} className="border-t border-slate-100">
                          <td className="p-2">{row.label}</td>
                          <td className="p-2 text-right tabular-nums">
                            {row.target > 0 ? fmtMoney(row.target) : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">{fmtMoney(row.actual)}</td>
                          <td
                            className={`p-2 text-right tabular-nums font-medium ${
                              isDone
                                ? "text-slate-400"
                                : isOver
                                  ? "text-purple-700"
                                  : "text-orange-700"
                            }`}
                          >
                            {row.target === 0 ? "—" : isDone ? "✓" : fmtMoney(diff)}
                          </td>
                          <td
                            className={`p-2 text-right tabular-nums font-semibold ${
                              isDone
                                ? "text-green-700"
                                : isOver
                                  ? "text-purple-700"
                                  : isUnder
                                    ? "text-amber-700"
                                    : "text-slate-400"
                            }`}
                          >
                            {row.target > 0 ? `${pct.toFixed(0)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Target dựa theo cấu hình căn (Q_sale × rate cho HH/KPI, số flat cho thưởng/hỗ trợ).
                Cột "Còn / Vượt": xanh xám ✓ = khớp, cam = còn thiếu, tím = chi quá.
              </div>
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
                <th className="text-right p-2 whitespace-nowrap">PMG đợt</th>
                <th className="text-right p-2 whitespace-nowrap">KPI đợt</th>
                <th className="text-right p-2 whitespace-nowrap">Phải trả</th>
                <th className="text-right p-2 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {costRecs.map((r) => {
                const payable = Number(r.amountPayableThisTime ?? 0);
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
                    <td className="p-2 text-right tabular-nums">{fmtMoney(r.pmgThisTime)}</td>
                    <td
                      className={`p-2 text-right tabular-nums ${Number(r.kpiAmount) < 0 ? "text-red-600" : ""}`}
                    >
                      {fmtMoney(r.kpiAmount)}
                    </td>
                    <td
                      className={`p-2 text-right tabular-nums font-semibold ${payable < 0 ? "text-red-600" : ""}`}
                      title={payable < 0 ? "Số âm = điều chỉnh / hoàn trả" : ""}
                    >
                      {fmtMoney(payable)}
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
                  <td colSpan={7} className="p-4 text-center text-slate-500">
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
  accent?: "green" | "orange";
  tooltip?: string;
}) {
  const valueCls = [
    "font-medium tabular-nums mt-1",
    small ? "text-xs" : "text-sm",
    mono ? "font-mono" : "",
    accent === "green" ? "text-green-700" : accent === "orange" ? "text-orange-700" : "",
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
