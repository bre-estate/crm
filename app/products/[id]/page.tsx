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
  productAdjustments,
  activityLogs,
  employees,
} from "@/lib/schema";
import { fmtMoney, fmtDate, fmtPct, fmtPctTight, fmtPctRaw, costTypeLabel, toTitleCase } from "@/lib/format";
import { Card as ShadCard } from "@/components/ui/card";
import { Badge as ShadBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { eq, desc } from "drizzle-orm";
import { asc } from "drizzle-orm";
import ActivityHistoryButton from "./ActivityHistoryButton";
import DeleteProductButton from "./DeleteProductButton";
import { deleteProduct } from "@/lib/actions/products";
import { hasPermission } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const returnTo =
    sp.returnTo && sp.returnTo.startsWith("/") && !sp.returnTo.startsWith("//")
      ? sp.returnTo
      : null;
  const editHref = returnTo
    ? `/products/${idStr}/edit?returnTo=${encodeURIComponent(returnTo)}`
    : `/products/${idStr}/edit`;
  // URL của trang detail này (kèm returnTo về list nếu có) — dùng cho
  // Sửa recon để save xong quay về đây
  const detailSelfUrl = returnTo
    ? `/products/${idStr}?returnTo=${encodeURIComponent(returnTo)}`
    : `/products/${idStr}`;
  const childEditQs = `?returnTo=${encodeURIComponent(detailSelfUrl)}`;
  const id = Number(idStr);
  const canDeleteProduct = await hasPermission("products", "delete");
  const canEditProduct = await hasPermission("products", "edit");
  if (!Number.isFinite(id)) notFound();

  // Parallel: 7 query độc lập (chỉ depend vào `id`) → chạy song song thay vì
  // tuần tự. Giảm ~40% wall-clock time trên Supabase pooler (~500ms → ~300ms).
  const [rowRes, revRecs, revPayments, costRecs, costPayments, adjustments, activities] =
    await Promise.all([
      db
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
        .where(eq(products.id, id)),
      db
        .select({ rec: revenueReconciliations, invoice: invoices })
        .from(revenueReconciliations)
        .leftJoin(invoices, eq(revenueReconciliations.invoiceId, invoices.id))
        .where(eq(revenueReconciliations.productId, id))
        .orderBy(asc(revenueReconciliations.phaseNumber)),
      db
        .select({ payment: paymentsIn })
        .from(paymentsIn)
        .innerJoin(
          revenueReconciliations,
          eq(paymentsIn.reconciliationId, revenueReconciliations.id),
        )
        .where(eq(revenueReconciliations.productId, id))
        .orderBy(asc(paymentsIn.paymentDate)),
      db
        .select()
        .from(costReconciliations)
        .where(eq(costReconciliations.productId, id))
        .orderBy(asc(costReconciliations.reconciliationDate)),
      db
        .select({ payment: paymentsOut })
        .from(paymentsOut)
        .innerJoin(
          costReconciliations,
          eq(paymentsOut.costReconciliationId, costReconciliations.id),
        )
        .where(eq(costReconciliations.productId, id)),
      db
        .select()
        .from(productAdjustments)
        .where(eq(productAdjustments.productId, id))
        .orderBy(asc(productAdjustments.effectiveDate)),
      db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.productId, id))
        .orderBy(desc(activityLogs.createdAt))
        .limit(50),
    ]);

  const [row] = rowRes;
  if (!row) notFound();
  const p = row.product;
  const isSecondary = p.saleType === "secondary";

  // Lookup NVKD trong employees để phân biệt CTV (chưa phân phòng)
  // → không hiển thị text Excel legacy misleading.
  const nvkdEmp = p.salesPerson
    ? await db
        .select({ position: employees.position, departmentId: employees.departmentId })
        .from(employees)
        .where(eq(employees.name, p.salesPerson))
        .then((r) => r[0] ?? null)
    : null;
  const isNvkdCtv = nvkdEmp?.position === "ctv";
  const nvkdCtvUnassigned = isNvkdCtv && !nvkdEmp?.departmentId;

  // === Compute derived values ===
  // Latest %PMG_LK — CANONICAL từ product config (updated bởi mọi adjustment
  // + auto-elevate từ recon cao hơn). Không dùng Math.max nữa vì nếu
  // adjustment mới hạ rate xuống, max sẽ giữ giá trị cũ (sai).
  const latestPmgRate = Number(p.pmgRate ?? 0);
  const expectedHHSaleGross = Number(p.pmgBasePrice ?? 0) * latestPmgRate;
  const expectedHHSale = isSecondary
    ? Number(p.totalRevenue ?? 0)
    : Math.max(0, expectedHHSaleGross - Number(p.adminFee ?? 0));
  const expectedBonus =
    Number(p.cdtBonusSale ?? 0) + Number(p.cdtBonusManager ?? 0);

  // Lịch sử %PMG_LK: gộp 3 nguồn, dedup theo (rate, date):
  //   1) product.pmgRateHistory (JSON manual — nếu user nhập explicit)
  //   2) product_adjustments (mỗi record có pmg_rate)
  //   3) revenue_reconciliations.pmg_cumulative_pct (theo tiến độ ĐC)
  // Dedup: nếu 2 nguồn cùng rate + cùng ngày → giữ 1. Ngày khác → giữ cả 2.
  const pmgHistory = ((): Array<{ date: string; rate: number; note?: string }> => {
    const entries: Array<{ date: string; rate: number; note?: string }> = [];
    try {
      if (p.pmgRateHistory) {
        const arr = JSON.parse(p.pmgRateHistory) as Array<{
          rate: number;
          date: string;
          note?: string;
        }>;
        if (Array.isArray(arr)) {
          for (const e of arr) {
            if (e.rate > 0) entries.push({ date: e.date, rate: e.rate, note: e.note });
          }
        }
      }
    } catch {
      // ignore
    }
    // Adjustments: mọi record có pmg_rate được ghi lại
    for (const a of adjustments) {
      const r = Number(a.pmgRate ?? 0);
      if (r > 0) {
        entries.push({
          date: a.effectiveDate,
          rate: r,
          note: a.note ?? "Điều chỉnh",
        });
      }
    }
    // Revenue recons: distinct pmgCumulativePct (mỗi lần rate tăng ghi 1 lần)
    const seenRate = new Map<number, string>();
    const sortedRev = [...revRecs].sort((a, b) =>
      (a.rec.reconciliationDate ?? "").localeCompare(b.rec.reconciliationDate ?? ""),
    );
    for (const r of sortedRev) {
      const rate = Number(r.rec.pmgCumulativePct ?? 0);
      if (rate > 0 && !seenRate.has(rate)) {
        seenRate.set(rate, r.rec.reconciliationDate ?? "");
      }
    }
    for (const [rate, date] of seenRate) entries.push({ date, rate });
    // Dedup: sort theo ngày (cũ → mới), chỉ giữ entry khi rate KHÁC entry
    // trước đó (chip consecutive cùng rate = nhiễu, không phải cột mốc).
    // Cùng ngày cùng rate → giữ 1 (ưu tiên entry có note).
    const uniqueByRateDate = new Map<string, { date: string; rate: number; note?: string }>();
    for (const e of entries) {
      const key = `${e.rate}@${e.date}`;
      const existing = uniqueByRateDate.get(key);
      if (!existing || (e.note && !existing.note)) {
        uniqueByRateDate.set(key, e);
      }
    }
    const sorted = Array.from(uniqueByRateDate.values()).sort((a, b) =>
      (a.date ?? "").localeCompare(b.date ?? ""),
    );
    const compacted: typeof sorted = [];
    for (const e of sorted) {
      const prev = compacted[compacted.length - 1];
      if (!prev || prev.rate !== e.rate) compacted.push(e);
    }
    return compacted;
  })();

  // Merge model: 1 recon có thể chứa cả HH + thưởng nóng cùng row.
  // Split payment theo tỷ lệ trong recon để không lệch "đã thu HH vs thưởng nóng".
  const paidPerRecon = new Map<number, number>();
  for (const p of revPayments) {
    const rid = p.payment.reconciliationId;
    if (rid == null) continue;
    paidPerRecon.set(rid, (paidPerRecon.get(rid) ?? 0) + Number(p.payment.amount ?? 0));
  }
  let paidHHSale = 0;
  let paidBonus = 0;
  let receivedHH = 0;
  let receivedBonus = 0;
  let sumReconCdtSale = 0;
  let sumReconCdtMgr = 0;
  for (const { rec } of revRecs) {
    // BUG FIX 2026-08-05: revenue_this_time đôi khi lũy kế (VD rr#3970 = 72.9M
    // trong khi total_receivable_this_time = 2.74M đợt này). Dùng total − bonus
    // để tính HH đợt này (đúng) thay vì rev field.
    //
    // BUG FIX 2026-08-11: recon reversal (total < 0) → không dùng Math.max(0, ...)
    // và split ratio dùng total !== 0 thay vì total > 0. Trước khi fix, payment
    // âm bị dồn nhầm vào paidHHSale khi recon là bonus_sale reversal
    // (VD căn A2-06-17: bonus_sale -11M nhưng UI hiện HH -11M).
    const bs = Number(rec.cdtBonusSale ?? 0);
    const bm = Number(rec.cdtBonusManager ?? 0);
    const total = Number(rec.totalReceivableThisTime ?? 0);
    const hhThisTime = total - bs - bm;
    receivedHH += hhThisTime;
    receivedBonus += bs + bm;
    sumReconCdtSale += bs;
    sumReconCdtMgr += bm;
    const paid = paidPerRecon.get(rec.id) ?? 0;
    if (total !== 0) {
      paidHHSale += paid * (hhThisTime / total);
      paidBonus += paid * ((bs + bm) / total);
    } else {
      paidHHSale += paid;
    }
  }
  const totalPaidInCash = paidHHSale + paidBonus;
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
    <div className="space-y-4">
      {/* Breadcrumb + title */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Link href={returnTo ?? "/products"} className="text-blue-600 hover:underline">
            ← Giao dịch
          </Link>
          <span className="text-slate-400">/</span>
          <span className="font-mono">{p.productCode}</span>
        </div>
        <ActivityHistoryButton activities={activities} />
      </div>

      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="font-mono">{p.unitCode}</span>
            <span className="text-slate-400 mx-2">·</span>
            {row.project?.name}
          </h1>
          <div className="flex gap-2 mt-1.5 text-xs items-center flex-wrap">
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
        <div className="flex items-center gap-2 shrink-0">
          {canDeleteProduct && (
            <DeleteProductButton
              unitCode={p.unitCode}
              onDelete={async () => {
                "use server";
                await deleteProduct(id);
              }}
            />
          )}
          {canEditProduct && (
            <Button
              render={<Link href={editHref} />}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Sửa giao dịch
            </Button>
          )}
        </div>
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

      {/* Data quality warnings — 2 case: chưa nhập config vs config < đã ĐC */}
      {hasMissingCdtBonusCfg && (() => {
        // Cùng field có 2 case:
        //   (1) product.cdtBonus* = 0 → chưa nhập config
        //   (2) product.cdtBonus* > 0 nhưng < sum đã ĐC → cấu hình lệch
        const cfgSaleValue = Number(p.cdtBonusSale ?? 0);
        const cfgMgrValue = Number(p.cdtBonusManager ?? 0);
        const missingSale = missingCfgSale >= 1000 && cfgSaleValue === 0;
        const missingMgr = missingCfgMgr >= 1000 && cfgMgrValue === 0;
        const lowerSale = missingCfgSale >= 1000 && cfgSaleValue > 0;
        const lowerMgr = missingCfgMgr >= 1000 && cfgMgrValue > 0;

        return (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex gap-3 items-start">
            <div className="text-2xl leading-none">⚠️</div>
            <div className="flex-1 space-y-2 text-sm">
              {(missingSale || missingMgr) && (
                <div className="text-amber-900">
                  <b>Chưa nhập config trên căn</b>
                  {missingSale && (
                    <span>
                      : &quot;CĐT thưởng sale&quot; (đã ĐC {fmtMoney(sumReconCdtSale)})
                    </span>
                  )}
                  {missingSale && missingMgr && <span>;</span>}
                  {missingMgr && (
                    <span>
                      {" "}
                      &quot;CĐT thưởng quản lý&quot; (đã ĐC {fmtMoney(sumReconCdtMgr)})
                    </span>
                  )}
                  .
                </div>
              )}
              {(lowerSale || lowerMgr) && (
                <div className="text-amber-900">
                  <b>Config KHÔNG KHỚP số đã ĐC</b>
                  {lowerSale && (
                    <span>
                      : CĐT thưởng sale config <b>{fmtMoney(cfgSaleValue)}</b> nhưng đã ĐC{" "}
                      <b>{fmtMoney(sumReconCdtSale)}</b> (chênh {fmtMoney(missingCfgSale)})
                    </span>
                  )}
                  {lowerSale && lowerMgr && <span>;</span>}
                  {lowerMgr && (
                    <span>
                      {lowerSale ? "; " : ": "}CĐT thưởng quản lý config{" "}
                      <b>{fmtMoney(cfgMgrValue)}</b> nhưng đã ĐC{" "}
                      <b>{fmtMoney(sumReconCdtMgr)}</b> (chênh {fmtMoney(missingCfgMgr)})
                    </span>
                  )}
                  .
                  <div className="mt-1 text-xs text-amber-700">
                    Không thể giảm config bên dưới số đã ĐC. Nếu đợt ĐC sai → vào Doanh thu sửa/xoá đợt trước, rồi mới giảm config.
                  </div>
                </div>
              )}
              <div>
                <Link
                  href={editHref}
                  className="text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700"
                >
                  Sửa thông tin căn →
                </Link>
              </div>
            </div>
          </div>
        );
      })()}

      {/* === 1. THÔNG TIN CĂN === (bỏ mã căn/mã SP/loại giao dịch/dự án/đối tác
           vì đã hiện ở header title/breadcrumb/badge) */}
      <SectionCard title="1. Thông tin căn" icon="🏠">
        {(() => {
          const tpkdName = nvkdCtvUnassigned
            ? null
            : toTitleCase(p.deptLeaderName) || toTitleCase(row.department?.leaderName) || null;
          const deptName =
            row.department?.name ??
            (nvkdCtvUnassigned ? "CTV (chưa phân phòng)" : p.deptName ?? null);
          const deptCombo = deptName
            ? tpkdName
              ? `${deptName} · TPKD ${tpkdName}`
              : deptName
            : "—";
          const nvkdCombo =
            (toTitleCase(p.salesPerson) || "—") + (isNvkdCtv ? " · CTV" : "");
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <Field label="Mô tả căn" value={p.unitDescription ?? "—"} />
              <Field label="Tên khách" value={toTitleCase(p.customerName) || "—"} />
              <Field label="Ngày cọc" value={fmtDate(p.depositDate) || "—"} />
              <Field label="NVKD" value={nvkdCombo} />
              <Field label="Phòng KD" value={deptCombo} />
            </div>
          );
        })()}
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
          {/* Info blocks: chuẩn grid 1/2/4 responsive — nhất quán với section giá vốn */}
          {(() => {
            const feeReal = Number(p.adminFee ?? 0);
            const feeSale = Number(p.adminFeeSale ?? 0);
            const sameFee = Math.abs(feeReal - feeSale) < 1000;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <Info
                  label="Giá tính PMG (= giá bán)"
                  value={fmtMoney(p.pmgBasePrice)}
                />
                {sameFee ? (
                  <Info
                    label="Phí admin"
                    value={fmtMoney(feeReal)}
                    tooltip="Số CĐT trừ khỏi PMG trước khi trả BRE. Đồng thời cũng là số dùng khi tính HH sale."
                  />
                ) : (
                  <>
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
                  </>
                )}
                <Info label="CĐT thưởng nóng cho sale" value={fmtMoney(p.cdtBonusSale)} />
                <Info label="CĐT thưởng nóng cho QL" value={fmtMoney(p.cdtBonusManager)} />
              </div>
            );
          })()}

          {/* Lịch sử %PMG_LK — full width block riêng vì chứa nhiều chip */}
          <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3">
            <div className="text-xs text-slate-500 mb-1">Lịch sử %PMG_LK</div>
            <div className="flex flex-wrap gap-1.5">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
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
          // hhSaleAmt: ưu tiên số THỰC từ cost_reconciliations (BCDT source of truth).
          // Fallback baseNet × hhRate nếu chưa có cost_recon.
          const actualHHFromRecon = costRecs
            .filter((r) => r.costType === "sale_commission")
            .reduce((s, r) => s + Number(r.amountPayableThisTime ?? 0), 0);
          const hhSaleAmt = actualHHFromRecon > 0 ? actualHHFromRecon : baseNet * hhRate;
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
              {/* Breakdown per loại — table gọn, hiển thị explicit không cần hover tooltip */}
              {(() => {
                const bonusSaleExpected = Number(p.cdtBonusSale ?? 0);
                const bonusMgrExpected = Number(p.cdtBonusManager ?? 0);
                // Build paid map per recon từ revPayments
                const paidPerRecon = new Map<number, number>();
                for (const p of revPayments) {
                  const rid = p.payment.reconciliationId;
                  if (rid == null) continue;
                  paidPerRecon.set(rid, (paidPerRecon.get(rid) ?? 0) + Number(p.payment.amount ?? 0));
                }
                // Đã nhận per loại: hiện paidHH = payments của HH-recon (revenue > 0),
                // paidBonus = payments của bonus-recon (cdt > 0, revenue = 0). Với merge
                // model, 1 recon có thể có cả 2 → payment không phân được. Fallback:
                // paidHH = paidHHSale (recon dominant HH), paidBonus = paidBonus.
                type BreakdownRow = { label: string; expected: number; paid: number; cls: string };
                const breakdown: BreakdownRow[] = [
                  {
                    label: "Hoa hồng sale",
                    expected: expectedHHSale,
                    paid: paidHHSale,
                    cls: "text-blue-700",
                  },
                ];
                if (bonusSaleExpected > 0) {
                  const bsPaid = revRecs
                    .filter((r) => Number(r.rec.cdtBonusSale ?? 0) > 0)
                    .reduce((s, r) => {
                      const p = paidPerRecon.get(r.rec.id) ?? 0;
                      const totalRec = Number(r.rec.totalReceivableThisTime ?? 0);
                      const bsShare =
                        totalRec > 0
                          ? Number(r.rec.cdtBonusSale ?? 0) / totalRec
                          : 0;
                      return s + p * bsShare;
                    }, 0);
                  breakdown.push({
                    label: "Thưởng nóng sale",
                    expected: bonusSaleExpected,
                    paid: bsPaid,
                    cls: "text-amber-700",
                  });
                }
                if (bonusMgrExpected > 0) {
                  const bmPaid = revRecs
                    .filter((r) => Number(r.rec.cdtBonusManager ?? 0) > 0)
                    .reduce((s, r) => {
                      const p = paidPerRecon.get(r.rec.id) ?? 0;
                      const totalRec = Number(r.rec.totalReceivableThisTime ?? 0);
                      const bmShare =
                        totalRec > 0
                          ? Number(r.rec.cdtBonusManager ?? 0) / totalRec
                          : 0;
                      return s + p * bmShare;
                    }, 0);
                  breakdown.push({
                    label: "Thưởng nóng QL",
                    expected: bonusMgrExpected,
                    paid: bmPaid,
                    cls: "text-purple-700",
                  });
                }
                if (breakdown.length === 1) return null;
                return (
                  <div className="bg-card rounded-lg ring-1 ring-foreground/10 overflow-hidden mb-4">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-1.5">Loại</th>
                          <th className="text-right px-3 py-1.5">Dự kiến</th>
                          <th className="text-right px-3 py-1.5">Đã nhận</th>
                          <th className="text-right px-3 py-1.5">Còn phải nhận</th>
                          <th className="text-right px-3 py-1.5">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.map((row) => {
                          const rowRemain = Math.max(0, row.expected - row.paid);
                          const rowPct =
                            row.expected > 0 ? (row.paid / row.expected) * 100 : 0;
                          const rowDone = rowRemain < 1000 && row.expected > 0;
                          return (
                            <tr key={row.label} className="border-t border-slate-100">
                              <td className={`px-3 py-1.5 font-medium ${row.cls}`}>
                                {row.label}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {fmtMoney(row.expected)}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-green-700">
                                {fmtMoney(row.paid)}
                              </td>
                              <td
                                className={`px-3 py-1.5 text-right tabular-nums ${
                                  rowRemain < 1000 ? "text-slate-400" : "text-red-600 font-semibold"
                                }`}
                              >
                                {fmtMoney(rowRemain)}
                              </td>
                              <td
                                className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
                                  rowDone ? "text-green-700" : "text-slate-600"
                                }`}
                              >
                                {row.expected > 0 ? `${rowPct.toFixed(0)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              {/* Warning cũ khi có gap giữa ĐC vs chưa ĐC */}
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
            className="text-xs bg-orange-500 text-white px-2.5 py-1 rounded hover:bg-orange-600"
          >
            + Thêm đợt
          </Link>
        </div>
        <div className="bg-card rounded-lg ring-1 ring-foreground/10 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-center p-2 whitespace-nowrap">Đợt</th>
                <th className="text-left p-2 whitespace-nowrap">Loại</th>
                <th className="text-left p-2 whitespace-nowrap">Ngày ĐC</th>
                <th className="text-left p-2 whitespace-nowrap">Số HĐ</th>
                <th className="text-left p-2 whitespace-nowrap">Ngày HĐ</th>
                <th className="text-right p-2 whitespace-nowrap" title="Commission rate BRE nhận từ CĐT">% PMG_LK</th>
                <th className="text-right p-2 whitespace-nowrap">Số tiền đợt</th>
                <th className="text-right p-2 whitespace-nowrap">Phải thu</th>
                <th className="text-left p-2 whitespace-nowrap">Trạng thái</th>
                <th className="text-right p-2 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {revRecs.map(({ rec, invoice }) => {
                const hasDate = !!rec.reconciliationDate;
                const revenueAmt = Number(rec.revenueThisTime ?? 0);
                const bonusSaleAmt = Number(rec.cdtBonusSale ?? 0);
                const bonusMgrAmt = Number(rec.cdtBonusManager ?? 0);
                const hasInvoice = !!invoice?.invoiceNumber;
                const notes = (rec.notes as Record<string, string> | null) ?? {};
                return (
                  <tr key={rec.id} className="border-t border-slate-100">
                    <td className="p-2 text-center font-semibold text-xs">
                      {rec.phaseNumber ? `Đợt ${rec.phaseNumber}` : "—"}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {revenueAmt > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 whitespace-nowrap"
                            title={notes.commission ?? "Hoa hồng"}
                          >
                            HH: {fmtMoney(revenueAmt)}
                          </span>
                        )}
                        {bonusSaleAmt > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap"
                            title={notes.bonus_sale ?? "Thưởng nóng CĐT cho sale"}
                          >
                            T.nóng sale: {fmtMoney(bonusSaleAmt)}
                          </span>
                        )}
                        {bonusMgrAmt > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 whitespace-nowrap"
                            title={notes.bonus_manager ?? "Thưởng nóng CĐT cho QL sàn"}
                          >
                            T.nóng QL: {fmtMoney(bonusMgrAmt)}
                          </span>
                        )}
                        {revenueAmt === 0 && bonusSaleAmt === 0 && bonusMgrAmt === 0 && (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap">{fmtDate(rec.reconciliationDate)}</td>
                    <td className="p-2 font-mono">{invoice?.invoiceNumber ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">{fmtDate(invoice?.invoiceDate)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {rec.pmgCumulativePct ? fmtPct(rec.pmgCumulativePct) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums font-medium">
                      {fmtMoney(rec.revenueThisTime)}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold">
                      {fmtMoney(rec.totalReceivableThisTime)}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <div className="inline-flex gap-1 items-center">
                        {hasDate ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-yellow-100 text-yellow-700">
                            Đã ĐC
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-slate-500">
                            Chưa ĐC
                          </span>
                        )}
                        {hasInvoice && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-green-100 text-green-700">
                            Đã có HĐ
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      <Link
                        href={`/revenues/${rec.id}/edit${childEditQs}`}
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
                  <td colSpan={10} className="p-4 text-center text-slate-500">
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
            <div className="bg-card rounded-lg ring-1 ring-foreground/10 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left p-2">Ngày nhận</th>
                    <th className="text-left p-2">Loại</th>
                    <th className="text-right p-2">Số tiền thực nhận</th>
                    <th className="text-left p-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {revPayments.map((r) => {
                    const parentRec = revRecs.find((x) => x.rec.id === r.payment.reconciliationId)?.rec;
                    // Bug fix 2026-08-11: reversal recon có cdt_bonus_sale ÂM
                    // (VD -11M) → check !== 0 để catch cả reversal, không phải chỉ > 0.
                    const pIsBonusSale = Number(parentRec?.cdtBonusSale ?? 0) !== 0;
                    const pIsBonusMgr = Number(parentRec?.cdtBonusManager ?? 0) !== 0;
                    const pIsBonus = pIsBonusSale || pIsBonusMgr;
                    return (
                      <tr key={r.payment.id} className="border-t border-slate-100">
                        <td className="p-2">{fmtDate(r.payment.paymentDate)}</td>
                        <td className="p-2">
                          {pIsBonus ? (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap"
                              title={
                                pIsBonusMgr
                                  ? "Thưởng nóng CĐT cho QL sàn"
                                  : "Thưởng nóng CĐT cho sale"
                              }
                            >
                              Thưởng nóng
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 whitespace-nowrap">
                              HH
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums font-medium text-green-700">
                          {fmtMoney(r.payment.amount)}
                        </td>
                        <td className="p-2 text-slate-500">{r.payment.note ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary progress cards — tách HH vs Thưởng nóng cho dễ đọc */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(() => {
                const hhPct = expectedHHSale > 0 ? Math.min(100, (paidHHSale / expectedHHSale) * 100) : 0;
                const bnPct = expectedBonus > 0 ? Math.min(100, (paidBonus / expectedBonus) * 100) : 0;
                return (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xs font-semibold text-blue-800">🔵 HH sale</span>
                        <span className="text-xs text-slate-600">
                          <b className="text-blue-700 tabular-nums">{fmtMoney(paidHHSale)}</b>
                          {" / "}
                          <span className="tabular-nums">{fmtMoney(expectedHHSale)}</span>
                        </span>
                      </div>
                      <div className="h-2 bg-blue-100 rounded overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${hhPct}%` }} />
                      </div>
                      <div className="text-right text-xs mt-1 tabular-nums text-blue-700 font-semibold">
                        {expectedHHSale > 0 ? Math.round((paidHHSale / expectedHHSale) * 100) : 0}%
                      </div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xs font-semibold text-amber-800">🟡 Thưởng nóng CĐT</span>
                        <span className="text-xs text-slate-600">
                          <b className="text-amber-700 tabular-nums">{fmtMoney(paidBonus)}</b>
                          {" / "}
                          <span className="tabular-nums">{fmtMoney(expectedBonus)}</span>
                        </span>
                      </div>
                      <div className="h-2 bg-amber-100 rounded overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${bnPct}%` }} />
                      </div>
                      <div className="text-right text-xs mt-1 tabular-nums text-amber-700 font-semibold">
                        {expectedBonus > 0 ? Math.round((paidBonus / expectedBonus) * 100) : 0}%
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="mt-2 flex items-center justify-between px-3 py-2 bg-slate-100 rounded-lg">
              <span className="text-sm font-semibold text-slate-700">TỔNG đã thu</span>
              <span className="text-lg font-bold tabular-nums text-green-700">
                {fmtMoney(totalPaidInCash)}
              </span>
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
            className="text-xs bg-orange-500 text-white px-2.5 py-1 rounded hover:bg-orange-600"
          >
            + Thêm dòng
          </Link>
        </div>
        <div className="bg-card rounded-lg ring-1 ring-foreground/10 overflow-x-auto">
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
                        href={`/costs/${r.id}/edit${childEditQs}`}
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
      ? "bg-sky-100 text-sky-700 border-sky-200"
      : color === "orange"
        ? "bg-orange-100 text-orange-700 border-orange-200"
        : "bg-blue-100 text-blue-700 border-blue-200";
  return <ShadBadge className={cn("rounded px-2 py-0.5", cls)}>{children}</ShadBadge>;
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
  const variantCls = warn
    ? "bg-orange-50 ring-orange-300"
    : highlight
      ? "bg-green-50 ring-green-300"
      : undefined;
  return (
    <ShadCard className={cn("[--card-spacing:0.625rem] px-3 py-2.5 gap-0.5", variantCls)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </ShadCard>
  );
}

/**
 * Compact 1-dòng cho các field text ngắn (metadata căn):
 *   [label ......................... value]
 * Dùng ở Section "Thông tin căn". Section số liệu vẫn dùng Info (2-dòng, ô có bg).
 */
function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span
        className={`ml-auto text-right text-sm text-slate-800 ${mono ? "font-mono" : "font-medium"} truncate`}
        title={value}
      >
        {value}
      </span>
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
    "font-medium tabular-nums mt-0.5",
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
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="text-xs text-slate-500 flex items-center gap-1">
        <span>{label}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-300 text-white text-[10px] cursor-help select-none">
                  ?
                </span>
              }
            />
            <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
          </Tooltip>
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
    <ShadCard className="[--card-spacing:1rem] px-4 gap-2">
      <div className="text-sm font-semibold text-slate-800 pb-1.5 border-b border-slate-100">
        {icon && <span className="mr-1.5">{icon}</span>}
        {title}
      </div>
      {children}
    </ShadCard>
  );
}
