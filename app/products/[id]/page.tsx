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
            <Info label="%HH sale (NVKD)" value={fmtPctTight(p.saleCommissionRate)} />
            <Info label="%KPI CEO" value={fmtPctTight(p.kpiCeoRate)} />
            <Info label="%KPI TPKD" value={fmtPctTight(p.kpiTpkdRate)} />
            <Info label="%KPI Admin" value={fmtPctTight(p.kpiAdminRate)} />
            <Info label="%phí khác" value={fmtPctTight(p.otherFeePct)} />
          </div>
        </div>

        <div className="border-t border-slate-200 mt-3 pt-3">
          <div className="text-xs text-slate-500 uppercase font-semibold mb-2">
            Khoản thưởng / hỗ trợ
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info label="Hỗ trợ khách" value={fmtMoney(p.customerSupport)} />
            <Info label="Thưởng NVKD (CTY)" value={fmtMoney(p.bonusSale)} />
            <Info label="Thưởng QL (CTY)" value={fmtMoney(p.bonusManager)} />
            <Info label="Thưởng sale (CĐT)" value={fmtMoney(p.cdtBonusSale)} />
            <Info label="Thưởng QL (CĐT)" value={fmtMoney(p.cdtBonusManager)} />
            <Info label="Phí admin sale" value={fmtMoney(p.adminFeeSale)} />
            <Info label="CP giá vốn khác" value={fmtMoney(p.otherCost)} />
          </div>
        </div>
      </SectionCard>

      {/* === 3. THU PHÍ TỪ CĐT === */}
      <SectionCard title="3. Thu phí HH từ CĐT" icon="💰">
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

      {/* === 5. CƠ CẤU PHÂN BỔ TIỀN === */}
      <SectionCard title="5. Cơ cấu phân bổ tiền (dự kiến — theo tỷ lệ config)" icon="📊">
        {(() => {
          const salePrice = Number(p.sellPrice ?? 0) || Number(p.pmgBasePrice ?? 0);
          const pmgBase = Number(p.pmgBasePrice ?? 0);
          const pmgRate = Number(p.pmgRate ?? 0);
          const adminFee = Number(p.adminFee ?? 0);
          const discountCk = Number(p.discountCk ?? 0);

          // HH thô CĐT trả BRE (gồm VAT + admin)
          const grossFee = pmgBase * pmgRate;
          // Sau khi trừ admin (CĐT giữ) + CK (BRE trả) rồi chia VAT
          const feeAfterAdminCk = grossFee - adminFee;
          const feeAfterVat = feeAfterAdminCk / 1.1;
          const netBreFee = isSecondary ? Number(p.totalRevenue ?? 0) : feeAfterVat - discountCk;

          // Chi phí BRE trả nội bộ (dự kiến theo config)
          const hhSaleRate = Number(p.saleCommissionRate ?? 0);
          const hhSale = netBreFee * hhSaleRate;
          const kpiCeo = netBreFee * Number(p.kpiCeoRate ?? 0);
          const kpiTpkd = netBreFee * Number(p.kpiTpkdRate ?? 0);
          const kpiAdmin = netBreFee * Number(p.kpiAdminRate ?? 0);
          const custSupport = Number(p.customerSupport ?? 0);
          const bonusSaleCty = Number(p.bonusSale ?? 0);
          const bonusMgrCty = Number(p.bonusManager ?? 0);
          const adminFeeSale = Number(p.adminFeeSale ?? 0);
          const otherCost = Number(p.otherCost ?? 0);

          const totalOut =
            hhSale +
            kpiCeo +
            kpiTpkd +
            kpiAdmin +
            custSupport +
            bonusSaleCty +
            bonusMgrCty +
            adminFeeSale +
            otherCost;

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
                {hhSaleRate > 0 && (
                  <Row
                    label={`HH NVKD (${fmtPctTight(hhSaleRate)})`}
                    value={`− ${fmtMoney(hhSale)}`}
                    color="red"
                    sub={`${fmtPctTight(hhSaleRate)} × Phí HH BRE net`}
                  />
                )}
                {custSupport > 0 && (
                  <Row label="Hỗ trợ khách" value={`− ${fmtMoney(custSupport)}`} color="red" />
                )}
                {bonusSaleCty > 0 && (
                  <Row
                    label="Thưởng NVKD (CTY)"
                    value={`− ${fmtMoney(bonusSaleCty)}`}
                    color="red"
                  />
                )}
                {bonusMgrCty > 0 && (
                  <Row label="Thưởng QL (CTY)" value={`− ${fmtMoney(bonusMgrCty)}`} color="red" />
                )}
                {kpiCeo > 0 && (
                  <Row
                    label={`KPI CEO (${fmtPctTight(p.kpiCeoRate)})`}
                    value={`− ${fmtMoney(kpiCeo)}`}
                    color="red"
                  />
                )}
                {kpiTpkd > 0 && (
                  <Row
                    label={`KPI TPKD (${fmtPctTight(p.kpiTpkdRate)})`}
                    value={`− ${fmtMoney(kpiTpkd)}`}
                    color="red"
                  />
                )}
                {kpiAdmin > 0 && (
                  <Row
                    label={`KPI Admin (${fmtPctTight(p.kpiAdminRate)})`}
                    value={`− ${fmtMoney(kpiAdmin)}`}
                    color="red"
                  />
                )}
                {adminFeeSale > 0 && (
                  <Row
                    label="Phí admin sale"
                    value={`− ${fmtMoney(adminFeeSale)}`}
                    color="red"
                  />
                )}
                {otherCost !== 0 && (
                  <Row
                    label="Chi phí khác"
                    value={`− ${fmtMoney(otherCost)}`}
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
                Số dự kiến tính từ tỷ lệ cấu hình trong tab Giao dịch. Số thực đã trả xem ở
                mục 4 (bảng dòng đối chiếu). Chênh lệch nếu có = điều chỉnh do đàm phán / hoàn
                trả.
              </div>
            </div>
          );
        })()}
      </SectionCard>

      {/* === 4. TRẢ PHÍ NỘI BỘ === */}
      <SectionCard title="4. Trả phí nội bộ (HH sale, KPI, thưởng)" icon="🏦">
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
