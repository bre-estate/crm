import { db } from "@/lib/db";
import {
  revenueReconciliations,
  costReconciliations,
  paymentsIn,
  paymentsOut,
  financialTransactions,
  products,
} from "@/lib/schema";
import { OPEX_MGMT_CATEGORIES } from "@/lib/accounting/categories";
import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql, inArray, eq, and, isNull, gt } from "drizzle-orm";
import Link from "next/link";
import { fmtMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "warn" | "fail";
type CheckResult = {
  category: string;
  title: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
  link?: { href: string; label: string };
};

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // ============================================================================
  // Nhóm 1 — Nghĩa vụ vs Thanh toán (integrity)
  // ============================================================================

  // 1.1 Recon giá vốn overpaid (paid > payable + 1000 tolerance)
  const overpaidCost = await db
    .select({
      recId: costReconciliations.id,
      productId: costReconciliations.productId,
      costType: costReconciliations.costType,
      employeeName: costReconciliations.employeeName,
      payable: costReconciliations.amountPayableThisTime,
      paid: sql<number>`coalesce(sum(${paymentsOut.amount}), 0)::float8`,
    })
    .from(costReconciliations)
    .leftJoin(paymentsOut, eq(paymentsOut.costReconciliationId, costReconciliations.id))
    .groupBy(costReconciliations.id)
    .having(sql`coalesce(sum(${paymentsOut.amount}), 0) > ${costReconciliations.amountPayableThisTime} + 1000`);
  checks.push({
    category: "Nghĩa vụ vs Thanh toán",
    title: "Không có ĐC giá vốn nào đang chi > nghĩa vụ",
    status: overpaidCost.length === 0 ? "pass" : "fail",
    detail:
      overpaidCost.length === 0
        ? "Không có case nào trả nhiều hơn số phải trả."
        : `${overpaidCost.length} ĐC đang chi quá nghĩa vụ. VD: căn #${overpaidCost[0].productId} ${overpaidCost[0].costType} (payable ${fmt(Number(overpaidCost[0].payable ?? 0))}, paid ${fmt(overpaidCost[0].paid)}).`,
    hint: "Có thể là bug import (attach payment sai recon) hoặc data nhập sai. Vào /costs sửa từng dòng.",
    link: overpaidCost.length > 0 ? { href: "/costs", label: "Xem /costs" } : undefined,
  });

  // 1.2 Recon doanh thu overpaid
  const overpaidRev = await db
    .select({
      recId: revenueReconciliations.id,
      productId: revenueReconciliations.productId,
      receivable: revenueReconciliations.totalReceivableThisTime,
      paid: sql<number>`coalesce(sum(${paymentsIn.amount}), 0)::float8`,
    })
    .from(revenueReconciliations)
    .leftJoin(paymentsIn, eq(paymentsIn.reconciliationId, revenueReconciliations.id))
    .groupBy(revenueReconciliations.id)
    .having(sql`coalesce(sum(${paymentsIn.amount}), 0) > ${revenueReconciliations.totalReceivableThisTime} + 1000`);
  checks.push({
    category: "Nghĩa vụ vs Thanh toán",
    title: "Không có ĐC doanh thu nào đang thu > nghĩa vụ",
    status: overpaidRev.length === 0 ? "pass" : "fail",
    detail:
      overpaidRev.length === 0
        ? "Không có case nào CĐT trả nhiều hơn số ĐC."
        : `${overpaidRev.length} ĐC đang thu quá nghĩa vụ. VD: căn #${overpaidRev[0].productId} (receivable ${fmt(Number(overpaidRev[0].receivable ?? 0))}, paid ${fmt(overpaidRev[0].paid)}).`,
    hint: "Có thể payment attach sai recon. Vào /revenues sửa.",
    link: overpaidRev.length > 0 ? { href: "/revenues", label: "Xem /revenues" } : undefined,
  });

  // 1.3 Payment orphan (không link tới recon nào)
  const [orphanPayIn] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(paymentsIn)
    .where(isNull(paymentsIn.reconciliationId));
  checks.push({
    category: "Nghĩa vụ vs Thanh toán",
    title: "Không có payment_in nào orphan (không link recon)",
    status: Number(orphanPayIn?.c ?? 0) === 0 ? "pass" : "fail",
    detail:
      Number(orphanPayIn?.c ?? 0) === 0
        ? "Tất cả payment_in đều link tới revenue_reconciliation."
        : `${orphanPayIn?.c} payment_in không có reconciliation_id. Không thấy được ở dashboard nào.`,
    hint: "Sửa bằng cách link vào ĐC tương ứng hoặc xóa.",
  });

  const [orphanPayOut] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(paymentsOut)
    .where(isNull(paymentsOut.costReconciliationId));
  checks.push({
    category: "Nghĩa vụ vs Thanh toán",
    title: "Không có payment_out nào orphan (không link recon)",
    status: Number(orphanPayOut?.c ?? 0) === 0 ? "pass" : "fail",
    detail:
      Number(orphanPayOut?.c ?? 0) === 0
        ? "Tất cả payment_out đều link tới cost_reconciliation."
        : `${orphanPayOut?.c} payment_out không có cost_reconciliation_id.`,
  });

  // ============================================================================
  // Nhóm 2 — Double count risk (6417 bug)
  // ============================================================================

  // 2.0 Missed cash inflow — financial_transactions direction='in'. Nếu > 0 →
  // có khoản tiền vào ghi nhầm chỗ (nên ở payments_in) → CFS âm giả.
  const [inTxn] = await db
    .select({
      c: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(amount), 0)::float8`,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.direction, "in"));
  const hasInTxn = Number(inTxn?.c ?? 0) > 0;
  checks.push({
    category: "Double count risk",
    title: "financial_transactions direction=in (tiền vào ghi nhầm chỗ?)",
    status: hasInTxn ? "warn" : "pass",
    detail: hasInTxn
      ? `${inTxn?.c} rows, tổng ${fmt(Number(inTxn?.total ?? 0))} VND. Tiền vào từ CĐT phải ghi ở payments_in để CFS Section I catch. Ghi ở financial_transactions direction='in' → CFS undercount inflow → âm giả.`
      : "Không có row nào direction='in' — tiền vào chỉ ở payments_in (chuẩn).",
    hint: hasInTxn
      ? "Nếu là tiền CĐT trả HH → di chuyển sang payments_in link với revenue_reconciliation tương ứng."
      : undefined,
    link: hasInTxn
      ? { href: "/finance/transactions", label: "Xem /finance" }
      : undefined,
  });

  // 2.01 YCTV pass-through — hoàn cọc (leg 4) không có inflow tương ứng
  // (leg 1-3 do admin theo dõi sổ riêng, chưa import CRM)
  const [yctvOut] = await db
    .select({
      c: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(amount), 0)::float8`,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "3411"),
        eq(financialTransactions.direction, "out"),
      ),
    );
  const [yctvIn] = await db
    .select({
      total: sql<number>`coalesce(sum(amount), 0)::float8`,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.categoryCode, "3411"),
        eq(financialTransactions.direction, "in"),
      ),
    );
  const yctvOutTotal = Number(yctvOut?.total ?? 0);
  const yctvInTotal = Number(yctvIn?.total ?? 0);
  const yctvGap = yctvOutTotal - yctvInTotal;
  checks.push({
    category: "Double count risk",
    title: "YCTV pass-through — inflow khớp outflow",
    status: yctvOutTotal === 0 ? "pass" : yctvGap === 0 ? "pass" : "warn",
    detail:
      yctvOutTotal === 0
        ? "Không có hoàn cọc YCTV nào."
        : `OUT (hoàn cọc cho khách): ${fmt(yctvOutTotal)}. IN (CĐT hoàn về cty): ${fmt(yctvInTotal)}. Gap: ${fmt(yctvGap)}.`,
    hint:
      yctvGap > 0
        ? "CFS đã loại YCTV out khỏi Section III để không âm giả. Kim confirm sổ chính có ghi 4 leg trong section 'thu hộ/chi hộ' — xin Kim gửi file thanh-toan bao gồm section này rồi update import script."
        : undefined,
  });

  // 2.05 Consistency check — tổng tiền vào từ CĐT (payments_in) vs tổng doanh
  // thu đã ĐC (revenue_reconciliations.totalReceivableThisTime). Nếu paid_in
  // << receivable → có tiền chưa về (bình thường, đó là phải thu). Nếu paid_in
  // >> receivable đáng kể → có tiền lẻ không link recon hoặc double record.
  const [paidInTotal] = await db
    .select({ s: sql<number>`coalesce(sum(amount), 0)::float8` })
    .from(paymentsIn);
  const [revReceivable] = await db
    .select({ s: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8` })
    .from(revenueReconciliations);
  const paidIn = Number(paidInTotal?.s ?? 0);
  const receivable = Number(revReceivable?.s ?? 0);
  const collectionRate = receivable > 0 ? (paidIn / receivable) * 100 : 0;
  checks.push({
    category: "Sanity check",
    title: "Tỷ lệ thu hồi CĐT (payments_in / receivable)",
    status: receivable === 0 ? "warn" : collectionRate >= 30 ? "pass" : "fail",
    detail:
      receivable === 0
        ? "Chưa có ĐC doanh thu nào."
        : `Đã thu ${fmt(paidIn)} / phải thu ${fmt(receivable)} = ${collectionRate.toFixed(1)}%. Phải thu còn lại ${fmt(receivable - paidIn)}.`,
    hint:
      receivable > 0 && collectionRate < 30
        ? "Nếu cty đang 'tự nuôi' (không cần founder chi hộ) thì tỷ lệ này phải cao (>60-70%). Thấp = payments_in đang thiếu → CFS âm giả. Verify với sao kê bank."
        : undefined,
  });

  // 2.1 Số financial_transactions có category=6417 (HH sale). Nếu > 0 → potential double count.
  const [count6417] = await db
    .select({
      c: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(amount), 0)::float8`,
    })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.categoryCode, "6417"), eq(financialTransactions.direction, "out")));
  const has6417 = Number(count6417?.c ?? 0) > 0;
  checks.push({
    category: "Double count risk",
    title: "6417 rows trong financial_transactions (HH sale bank)",
    status: has6417 ? "warn" : "pass",
    detail: has6417
      ? `${count6417?.c} rows, tổng ${fmt(Number(count6417?.total ?? 0))} VND. Các row này ĐÃ được LOẠI khỏi OPEX quản trị (fix Bug 1). Cross-check với cost_reconciliations để bảo đảm không thiếu ĐC nào.`
      : "Không có row 6417.",
    hint: has6417
      ? "Nếu tổng 6417 ≈ tổng payments_out cho sale_commission thì OK — cùng khoản, ghi 2 nguồn. Nếu chênh lệch lớn → có ĐC thiếu trong /costs hoặc bank row thừa."
      : undefined,
  });

  // ============================================================================
  // Nhóm 3 — Data hygiene
  // ============================================================================

  // 3.1 Unclassified financial_transactions
  const [unclassified] = await db
    .select({
      c: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(amount), 0)::float8`,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.categoryCode, "unclassified"));
  checks.push({
    category: "Data hygiene",
    title: "Không có financial_transactions nào unclassified",
    status: Number(unclassified?.c ?? 0) === 0 ? "pass" : "fail",
    detail:
      Number(unclassified?.c ?? 0) === 0
        ? "Tất cả giao dịch tài chính đã được phân loại."
        : `${unclassified?.c} rows (tổng ${fmt(Number(unclassified?.total ?? 0))}) chưa phân loại → không vào P&L / cash flow. Cần review.`,
    link:
      Number(unclassified?.c ?? 0) > 0
        ? { href: "/finance/transactions?category=unclassified", label: "Xem /finance" }
        : undefined,
  });

  // 3.2 Products không có project_id
  const [productNoProject] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(products)
    .where(isNull(products.projectId));
  checks.push({
    category: "Data hygiene",
    title: "Tất cả căn có project_id",
    status: Number(productNoProject?.c ?? 0) === 0 ? "pass" : "warn",
    detail:
      Number(productNoProject?.c ?? 0) === 0
        ? "Mọi căn đều gắn dự án."
        : `${productNoProject?.c} căn chưa gắn dự án — sẽ không xuất hiện trong báo cáo theo dự án.`,
  });

  // 3.3 Revenue reconciliations không link product
  const [revNoProduct] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(revenueReconciliations)
    .where(isNull(revenueReconciliations.productId));
  checks.push({
    category: "Data hygiene",
    title: "Tất cả ĐC doanh thu link tới căn",
    status: Number(revNoProduct?.c ?? 0) === 0 ? "pass" : "fail",
    detail:
      Number(revNoProduct?.c ?? 0) === 0
        ? "Mọi ĐC doanh thu có productId."
        : `${revNoProduct?.c} ĐC doanh thu không link căn — báo cáo per-căn/dự án sẽ miss.`,
  });

  // 3.4 Financial txn với amount <= 0 (should be > 0, direction encodes signal)
  const [zeroTxn] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(financialTransactions)
    .where(sql`amount <= 0`);
  checks.push({
    category: "Data hygiene",
    title: "Không có giao dịch amount ≤ 0",
    status: Number(zeroTxn?.c ?? 0) === 0 ? "pass" : "fail",
    detail:
      Number(zeroTxn?.c ?? 0) === 0
        ? "Amount luôn dương (dấu chi/thu lấy từ direction)."
        : `${zeroTxn?.c} giao dịch có amount ≤ 0 — không đúng convention.`,
  });

  // ============================================================================
  // Nhóm 4 — Sanity check (bức tranh có bất thường không)
  // ============================================================================

  // 4.1 Biên lãi gộp trong khoảng bình thường (BRE broker: 20-60%)
  const [revTotal] = await db
    .select({ s: sql<number>`coalesce(sum(${revenueReconciliations.totalReceivableThisTime}), 0)::float8` })
    .from(revenueReconciliations);
  const [costTotal] = await db
    .select({ s: sql<number>`coalesce(sum(${costReconciliations.amountPayableThisTime}), 0)::float8` })
    .from(costReconciliations);
  const rev = Number(revTotal?.s ?? 0);
  const cost = Number(costTotal?.s ?? 0);
  const grossMargin = rev > 0 ? ((rev / 1.1 - cost) / (rev / 1.1)) * 100 : 0;
  const marginOk = rev > 0 && grossMargin >= 15 && grossMargin <= 65;
  checks.push({
    category: "Sanity check",
    title: "Biên lãi gộp trong khoảng bình thường (15-65%)",
    status: rev === 0 ? "warn" : marginOk ? "pass" : "warn",
    detail:
      rev === 0
        ? "Chưa có doanh thu để tính."
        : `Biên gộp hiện tại = ${grossMargin.toFixed(1)}% (rev/1.1 − cost) / (rev/1.1).`,
    hint: !marginOk && rev > 0
      ? "Ngoài khoảng 15-65% có thể do: (a) chưa ĐC hết HH sale (biên cao giả), (b) thiếu revenue recon, (c) formula bug."
      : undefined,
  });

  // 4.2 OPEX monthly spike detection (max > 3x median)
  const opexPerMonth = await db
    .select({
      month: financialTransactions.accrualMonth,
      s: sql<number>`sum(amount)::float8`,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.direction, "out"),
        inArray(financialTransactions.categoryCode, OPEX_MGMT_CATEGORIES),
      ),
    )
    .groupBy(financialTransactions.accrualMonth);
  const opexNums = opexPerMonth.map((r) => Number(r.s)).filter((n) => n > 0).sort((a, b) => a - b);
  const median = opexNums.length > 0 ? opexNums[Math.floor(opexNums.length / 2)] : 0;
  const maxOpex = opexNums.length > 0 ? opexNums[opexNums.length - 1] : 0;
  const maxRow = opexPerMonth.reduce(
    (best, r) => (Number(r.s) > Number(best.s) ? r : best),
    opexPerMonth[0] ?? { month: "", s: 0 },
  );
  const spike = median > 0 && maxOpex > 3 * median;
  checks.push({
    category: "Sanity check",
    title: "OPEX quản trị không có spike bất thường (>3x median)",
    status: opexNums.length === 0 ? "warn" : spike ? "warn" : "pass",
    detail:
      opexNums.length === 0
        ? "Chưa có OPEX để tính."
        : spike
          ? `${maxRow.month} OPEX = ${fmt(maxOpex)}, gấp ${(maxOpex / median).toFixed(1)}x median (${fmt(median)}).`
          : `OPEX max = ${fmt(maxOpex)}, median = ${fmt(median)} — bình thường.`,
    hint: spike
      ? "Có thể là 1 khoản lớn 1 lần (thuế truy thu, thanh toán dồn dây). Kiểm tra tháng đó ở /finance/transactions."
      : undefined,
    link:
      spike && maxRow.month
        ? { href: `/reports/management/${maxRow.month}`, label: `Xem T${maxRow.month}` }
        : undefined,
  });

  // 4.3 Căn có revenue recon nhưng không có cost recon (thiếu HH sale)
  const missingCost = await db
    .select({
      productId: revenueReconciliations.productId,
      revCount: sql<number>`count(*)::int`,
    })
    .from(revenueReconciliations)
    .leftJoin(
      costReconciliations,
      eq(costReconciliations.productId, revenueReconciliations.productId),
    )
    .where(isNull(costReconciliations.id))
    .groupBy(revenueReconciliations.productId);
  checks.push({
    category: "Sanity check",
    title: "Căn có ĐC doanh thu → có ĐC giá vốn",
    status: missingCost.length === 0 ? "pass" : "warn",
    detail:
      missingCost.length === 0
        ? "Mọi căn có DT đều có ít nhất 1 ĐC giá vốn."
        : `${missingCost.length} căn có DT nhưng chưa ĐC HH sale nào — pending? hay quên?`,
    hint:
      missingCost.length > 0
        ? "Nếu đúng chưa chi HH → OK. Nếu quên nhập → biên gộp bị thổi lên. Vào /products lọc căn không có ĐC giá vốn."
        : undefined,
  });

  return checks;
}

export default async function DataChecksPage() {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  const checks = await runChecks();
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const passCount = checks.filter((c) => c.status === "pass").length;

  const byCategory = new Map<string, CheckResult[]>();
  for (const c of checks) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    byCategory.get(c.category)!.push(c);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs">
          <Link href="/" className="text-blue-600 hover:underline">← Trang chủ</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">🩺 Kiểm tra dữ liệu</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chạy tự động các invariant check để bắt bug + data lỗi trước khi ra báo cáo.
          Trang này chạy lại mỗi lần load — refresh để cập nhật.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatBox label="✅ PASS" count={passCount} color="green" />
        <StatBox label="⚠️ WARN" count={warnCount} color="amber" />
        <StatBox label="❌ FAIL" count={failCount} color="red" />
      </div>

      {failCount === 0 && warnCount === 0 && (
        <Card className="bg-green-50 ring-green-200 [--card-spacing:1.5rem] px-6 text-center items-center">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-green-800 font-semibold">Tất cả check PASS — data OK</div>
        </Card>
      )}

      {Array.from(byCategory.entries()).map(([cat, list]) => (
        <div key={cat}>
          <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider mb-2">
            {cat}
          </div>
          <div className="space-y-2">
            {list.map((c, i) => (
              <CheckRow key={i} check={c} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatBox({ label, count, color }: { label: string; count: number; color: "green" | "amber" | "red" }) {
  const cls =
    color === "green"
      ? "bg-green-50 ring-green-200 text-green-800"
      : color === "amber"
        ? "bg-amber-50 ring-amber-200 text-amber-800"
        : "bg-red-50 ring-red-200 text-red-800";
  return (
    <Card className={cn("px-4", cls)}>
      <div className="text-xs uppercase font-semibold">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{count}</div>
    </Card>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const cfg = {
    pass: { icon: "✅", ring: "ring-green-200", bg: "bg-green-50/40" },
    warn: { icon: "⚠️", ring: "ring-amber-300", bg: "bg-amber-50" },
    fail: { icon: "❌", ring: "ring-red-300", bg: "bg-red-50" },
  }[check.status];
  return (
    <Card className={cn("px-4", cfg.ring, cfg.bg)}>
      <div className="flex items-start gap-3">
        <div className="text-lg">{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800">{check.title}</div>
          <div className="text-sm text-slate-700 mt-1">{check.detail}</div>
          {check.hint && (
            <div className="text-xs text-slate-500 mt-1 italic">💡 {check.hint}</div>
          )}
          {check.link && (
            <Link
              href={check.link.href}
              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
            >
              {check.link.label} →
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
