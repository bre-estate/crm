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
import { fmtMoney, fmtDate, fmtPct, fmtPctTight, costTypeLabel } from "@/lib/format";
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
  // Phí HH dự kiến BRE nhận từ CĐT (trước VAT, đã trừ admin, đã trừ CK)
  const expectedFee = isSecondary
    ? Number(p.totalRevenue ?? 0)
    : Math.max(
        0,
        (Number(p.totalRevenue ?? 0) - Number(p.adminFee ?? 0)) / 1.1 - Number(p.discountCk ?? 0),
      );
  const collectedFromCDT = revRecs.reduce(
    (s, r) => s + Number(r.rec.revenueThisTime ?? 0),
    0,
  );
  // Threshold: chênh lệch dưới 1.000 VND coi như thu đủ (Excel hay làm tròn số lẻ)
  const rawRemaining = expectedFee - collectedFromCDT;
  const remainingFromCDT = Math.abs(rawRemaining) < 1000 ? 0 : Math.max(0, rawRemaining);
  const pctCollected =
    expectedFee > 0
      ? remainingFromCDT === 0
        ? 100
        : (collectedFromCDT / expectedFee) * 100
      : 0;
  const invoiceCount = new Set(revRecs.map((r) => r.invoice?.id).filter(Boolean)).size;

  const totalPaidInCash = revPayments.reduce((s, r) => s + Number(r.payment.amount ?? 0), 0);
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
            <span className="text-slate-500">
              Đối tác: <b>{row.partner?.name ?? "—"}</b>
            </span>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          label="Giá tính PMG"
          value={fmtMoney(p.pmgBasePrice)}
          sub={`%PMG_LK: ${fmtPctTight(p.pmgRate)}`}
        />
        <Card
          label="Phí HH dự kiến BRE"
          value={fmtMoney(expectedFee)}
          sub={isSecondary ? "Đã ở scale phí về cty" : "= (DT − admin) / 1.1 − CK"}
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
          sub={
            remainingFromCDT > 0
              ? "Chưa thu đủ"
              : "Đã thu đủ"
          }
        />
      </div>

      {/* === 1. THÔNG TIN CĂN === */}
      <SectionCard title="1. Thông tin căn" icon="🏠">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Info label="Mã căn" value={p.unitCode} mono />
          <Info label="Mã SP" value={p.productCode} mono small />
          <Info label="Dự án" value={row.project?.name ?? "—"} />
          <Info label="Đối tác (CĐT)" value={row.partner?.name ?? "—"} />
          <Info label="Loại giao dịch" value={isSecondary ? "Thứ cấp" : "Sơ cấp"} />
          <Info label="Mô tả căn" value={p.unitDescription ?? "—"} />
          <Info label="Giá bán" value={fmtMoney(p.sellPrice)} />
          <Info label="Giá tính PMG" value={fmtMoney(p.pmgBasePrice)} />
          <Info label="Tổng DT (gồm VAT)" value={fmtMoney(p.totalRevenue)} />
          <Info label="Phí admin" value={fmtMoney(p.adminFee)} />
          <Info label="Chiết khấu (CK)" value={fmtMoney(p.discountCk)} />
          <Info label="Tháng ghi nhận DT" value={p.recognitionMonth ?? "—"} mono />
        </div>
      </SectionCard>

      {/* === 2. KHÁCH HÀNG & GIAO DỊCH === */}
      <SectionCard title="2. Khách hàng & tỷ lệ phí" icon="👤">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Info label="Tên khách" value={p.customerName ?? "—"} />
          <Info label="NVKD" value={p.salesPerson ?? "—"} />
          <Info label="Phòng KD" value={row.department?.name ?? p.deptName ?? "—"} />
          <Info label="Ngày cọc" value={fmtDate(p.depositDate)} />
          <Info label="Ngày HT dự kiến" value={fmtDate(p.expectedCompleteDate)} />
          <Info label="PTTT" value={p.paymentMethod ?? "—"} />
        </div>

        <div className="border-t border-slate-200 mt-3 pt-3">
          <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
            Tỷ lệ %
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            <Info label="%PMG_LK (BRE nhận)" value={fmtPctTight(p.pmgRate)} />
            <Info label="%PMG_LK_sale (trả F2)" value={fmtPctTight(p.pmgSaleRate)} />
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

        <div className="border-t border-slate-200 mt-3 pt-3">
          <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
            Khoản thưởng / hỗ trợ
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info
              label="Hỗ trợ khách"
              value={fmtMoney(effAmount(p.customerSupport, "customer_support"))}
            />
            <Info label="Thưởng NVKD (CTY)" value={fmtMoney(effAmount(p.bonusSale, "bonus_sale"))} />
            <Info
              label="Thưởng QL (CTY)"
              value={fmtMoney(effAmount(p.bonusManager, "bonus_manager"))}
            />
            <Info label="Thưởng sale (CĐT)" value={fmtMoney(p.cdtBonusSale)} />
            <Info label="Thưởng QL (CĐT)" value={fmtMoney(p.cdtBonusManager)} />
            <Info label="Phí admin sale" value={fmtMoney(effAdminFeeSale)} />
            <Info label="CP giá vốn khác" value={fmtMoney(p.otherCost)} />
          </div>
        </div>
      </SectionCard>

      {/* === 3. CƠ CẤU PHÂN BỔ TIỀN === */}
      <SectionCard title="3. Cơ cấu phân bổ tiền (dự kiến khi thu đủ 100%)" icon="📊">
        {(() => {
          const salePrice = Number(p.sellPrice ?? 0) || Number(p.pmgBasePrice ?? 0);
          const pmgBase = Number(p.pmgBasePrice ?? 0);
          const pmgRate = Number(p.pmgRate ?? 0);
          const adminFee = Number(p.adminFee ?? 0);
          const discountCk = Number(p.discountCk ?? 0);

          // HH thô CĐT trả BRE (gồm VAT + admin)
          const grossFee = pmgBase * pmgRate;
          const feeAfterAdminCk = grossFee - adminFee;
          const feeAfterVat = feeAfterAdminCk / 1.1;
          const netBreFee = isSecondary ? Number(p.totalRevenue ?? 0) : feeAfterVat - discountCk;

          // === DỰ KIẾN: % dựa trên rate (thực từ đối chiếu, fallback config) × netBreFee ===
          // Cho hiển thị "cơ cấu phân bổ" theo đúng logic user: 100% - 65% HH - 3.5% CEO = 31.5% cty
          // (Actual đã trả có thể khác — xem Section 5)
          const mkPct = (
            configRate: number | null,
            costType: string,
          ): { amount: number; rate: number; hasData: boolean } => {
            const rate =
              derivedRateByType.get(costType) || Number(configRate ?? 0) || 0;
            return { amount: netBreFee * rate, rate, hasData: rate > 0 };
          };
          const mkFlat = (
            configAmount: number | null,
            costType: string,
          ): { amount: number; rate: number; hasData: boolean } => {
            // Flat: ưu tiên actual (max qua các đợt vì lặp lại cùng số cho từng đợt)
            const actualSum = derivedFlatByType.get(costType) ?? 0;
            const cfg = Number(configAmount ?? 0);
            const amount = actualSum || cfg;
            return { amount, rate: 0, hasData: amount > 0 };
          };

          const hhSale = mkPct(p.saleCommissionRate, "sale_commission");
          const kpiCeo = mkPct(p.kpiCeoRate, "kpi_ceo");
          const kpiTpkd = mkPct(p.kpiTpkdRate, "kpi_tpkd");
          const kpiAdmin = mkPct(p.kpiAdminRate, "kpi_admin");
          const custSupport = mkFlat(p.customerSupport, "customer_support");
          const bonusSaleCty = mkFlat(p.bonusSale, "bonus_sale");
          const bonusMgrCty = mkFlat(p.bonusManager, "bonus_manager");
          const adminFeeSaleAmt = effAdminFeeSale;
          const otherCostAmt = Number(p.otherCost ?? 0);

          // CĐT thưởng — transit: CĐT chuyển cho BRE, BRE trả thẳng cho NVKD/QL.
          // Không ảnh hưởng lợi nhuận cty vì thu + chi = 0. Show tách biệt để rõ.
          const cdtBonusSaleTransit = derivedFlatByType.get("cdt_bonus_sale") ?? 0;
          const cdtBonusMgrTransit = derivedFlatByType.get("cdt_bonus_manager") ?? 0;

          const totalOut =
            hhSale.amount +
            kpiCeo.amount +
            kpiTpkd.amount +
            kpiAdmin.amount +
            custSupport.amount +
            bonusSaleCty.amount +
            bonusMgrCty.amount +
            adminFeeSaleAmt +
            otherCostAmt;

          const profit = netBreFee - totalOut;
          const profitPct = netBreFee > 0 ? (profit / netBreFee) * 100 : 0;

          return (
            <div className="text-sm">
              {/* Đầu vào */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 mb-3">
                <div className="text-xs uppercase text-blue-700 font-semibold mb-2">
                  Đầu vào
                </div>
                <Row label="Giá bán căn" value={fmtMoney(salePrice)} />
                <Row label="Giá tính PMG" value={fmtMoney(pmgBase)} />
              </div>

              {/* Vào cty */}
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 mb-3">
                <div className="text-xs uppercase text-green-700 font-semibold mb-2">
                  Phí HH BRE nhận từ CĐT
                </div>
                {!isSecondary && (
                  <>
                    <Row
                      label={`× %PMG_LK (${fmtPctTight(pmgRate)}) — HH thô CĐT trả BRE`}
                      value={fmtMoney(grossFee)}
                      color="green"
                    />
                    {adminFee > 0 && (
                      <Row
                        label="− Phí admin CĐT giữ"
                        value={`− ${fmtMoney(adminFee)}`}
                        color="red"
                      />
                    )}
                    <Row label="÷ 1,1 (loại VAT)" value={fmtMoney(feeAfterVat)} />
                    {discountCk > 0 && (
                      <Row
                        label="− Chiết khấu (CK, BRE chi ngoài)"
                        value={`− ${fmtMoney(discountCk)}`}
                        color="red"
                      />
                    )}
                  </>
                )}
                <Row
                  label="= Phí HH BRE nhận (net)"
                  value={fmtMoney(netBreFee)}
                  bold
                  color="green"
                />
              </div>

              {/* Ra khỏi cty */}
              <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 mb-3">
                <div className="text-xs uppercase text-orange-700 font-semibold mb-2">
                  BRE chi ra
                </div>
                {hhSale.hasData && (
                  <Row
                    label={`HH NVKD${hhSale.rate ? ` (${fmtPctTight(hhSale.rate)})` : ""}`}
                    value={`− ${fmtMoney(hhSale.amount)}`}
                    color="red"
                  />
                )}
                {custSupport.hasData && (
                  <Row
                    label="Hỗ trợ khách"
                    value={`− ${fmtMoney(custSupport.amount)}`}
                    color="red"
                  />
                )}
                {bonusSaleCty.hasData && (
                  <Row
                    label="Thưởng NVKD (CTY)"
                    value={`− ${fmtMoney(bonusSaleCty.amount)}`}
                    color="red"
                  />
                )}
                {bonusMgrCty.hasData && (
                  <Row
                    label="Thưởng QL (CTY)"
                    value={`− ${fmtMoney(bonusMgrCty.amount)}`}
                    color="red"
                  />
                )}
                {kpiCeo.hasData && (
                  <Row
                    label={`KPI CEO${kpiCeo.rate ? ` (${fmtPctTight(kpiCeo.rate)})` : ""}`}
                    value={`− ${fmtMoney(kpiCeo.amount)}`}
                    color="red"
                  />
                )}
                {kpiTpkd.hasData && (
                  <Row
                    label={`KPI TPKD${kpiTpkd.rate ? ` (${fmtPctTight(kpiTpkd.rate)})` : ""}`}
                    value={`− ${fmtMoney(kpiTpkd.amount)}`}
                    color="red"
                  />
                )}
                {kpiAdmin.hasData && (
                  <Row
                    label={`KPI Admin${kpiAdmin.rate ? ` (${fmtPctTight(kpiAdmin.rate)})` : ""}`}
                    value={`− ${fmtMoney(kpiAdmin.amount)}`}
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
                {otherCostAmt !== 0 && (
                  <Row
                    label="Chi phí khác"
                    value={`− ${fmtMoney(otherCostAmt)}`}
                    color="red"
                  />
                )}
                <div className="border-t border-orange-200 mt-1 pt-1">
                  <Row
                    label="Tổng chi ra"
                    value={`− ${fmtMoney(totalOut)}`}
                    bold
                    color="red"
                  />
                </div>
              </div>

              {/* CĐT thưởng (transit — không ảnh hưởng lợi nhuận) */}
              {(cdtBonusSaleTransit > 0 || cdtBonusMgrTransit > 0) && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-3">
                  <div className="text-xs uppercase text-slate-600 font-semibold mb-2">
                    CĐT thưởng nóng (transit — CĐT trả BRE rồi BRE chuyển thẳng cho NV,
                    không ảnh hưởng lợi nhuận)
                  </div>
                  {cdtBonusSaleTransit > 0 && (
                    <Row
                      label="CĐT thưởng NVKD (transit qua BRE)"
                      value={fmtMoney(cdtBonusSaleTransit)}
                    />
                  )}
                  {cdtBonusMgrTransit > 0 && (
                    <Row
                      label="CĐT thưởng QL sàn (transit qua BRE)"
                      value={fmtMoney(cdtBonusMgrTransit)}
                    />
                  )}
                </div>
              )}

              {/* Còn lại */}
              <div
                className={`rounded-lg border-2 p-4 ${
                  profit >= 0 ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs uppercase font-semibold text-slate-600">
                      Lợi nhuận công ty (dự kiến)
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Phí HH BRE − Tổng chi = {profitPct.toFixed(1)}% biên lợi nhuận
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

              <div className="text-xs text-slate-500 mt-3 italic">
                Đây là <b>cơ cấu dự kiến</b> khi thu đủ 100% phí: tỷ lệ × Phí HH BRE net. Số
                thực đã trả (có thể khác do đàm phán/nhiều đợt) xem ở mục 5 —{" "}
                <b>{costRecs.length}</b> dòng đối chiếu, tổng đã trả{" "}
                <b>{fmtMoney(totalCostPayable)}</b>.
              </div>
            </div>
          );
        })()}
      </SectionCard>

      {/* === 4. THU PHÍ TỪ CĐT === */}
      <SectionCard title="4. Thu phí HH từ CĐT" icon="💰">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Info label="Phí HH dự kiến" value={fmtMoney(expectedFee)} />
          <Info label="Đã thu" value={fmtMoney(collectedFromCDT)} accent="green" />
          <Info label="Còn phải thu" value={fmtMoney(remainingFromCDT)} accent="orange" />
          <Info label="% thu" value={`${pctCollected.toFixed(1)}%`} />
        </div>

        <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
          Các đợt đối chiếu với CĐT ({revRecs.length})
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
                </tr>
              ))}
              {revRecs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500">
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

      {/* === 4. TRẢ PHÍ NỘI BỘ === */}
      <SectionCard title="5. Trả phí nội bộ (HH sale, KPI, thưởng)" icon="🏦">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Info label="Tổng phải trả (đã ĐC)" value={fmtMoney(totalCostPayable)} />
          <Info label="Đã trả" value={fmtMoney(totalPaidOut)} accent="green" />
          <Info
            label="Còn phải trả"
            value={fmtMoney(Math.max(0, totalCostPayable - totalPaidOut))}
            accent="orange"
          />
        </div>

        <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
          Các dòng đối chiếu ({costRecs.length})
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
              </tr>
            </thead>
            <tbody>
              {costRecs.map((r) => {
                const payable = Number(r.amountPayableThisTime ?? 0);
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-2">{fmtDate(r.reconciliationDate)}</td>
                    <td className="p-2">{r.employeeName}</td>
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
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  accent?: "green" | "orange";
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
      <div className="text-xs text-slate-500">{label}</div>
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
