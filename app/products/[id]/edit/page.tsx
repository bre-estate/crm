import { db } from "@/lib/db";
import { products, projects, partners, departments, productAdjustments } from "@/lib/schema";
import { asc, desc, eq } from "drizzle-orm";
import { fmtMoney, fmtDate, fmtPctTight } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProductForm from "../../ProductForm";
import AdjustmentDialog from "../AdjustmentDialog";
import { updateProduct, deleteProduct, createProductAdjustment } from "@/lib/actions/products";

export default async function EditProductPage({
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
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) notFound();

  const allProjects = await db
    .select({
      id: projects.id,
      code: projects.code,
      fullCode: projects.fullCode,
      name: projects.name,
      partnerId: projects.partnerId,
      breRole: projects.breRole,
      linkedF1PartnerId: projects.linkedF1PartnerId,
      contractInfo: projects.contractInfo,
      contractStatus: projects.contractStatus,
      contractDocs: projects.contractDocs,
      brokerageRate: projects.brokerageRate,
      brokerageRateSale: projects.brokerageRateSale,
      adminFee: projects.adminFee,
      adminFeeSale: projects.adminFeeSale,
      paymentPhases: projects.paymentPhases,
      phaseRate1: projects.phaseRate1,
      phaseRate2: projects.phaseRate2,
      phaseRate3: projects.phaseRate3,
      phaseRate4: projects.phaseRate4,
      phaseRate5: projects.phaseRate5,
      cdtBonusSale: projects.cdtBonusSale,
      cdtBonusManager: projects.cdtBonusManager,
      otherFeePct: projects.otherFeePct,
      otherRevenue: projects.otherRevenue,
      revenueReduction: projects.revenueReduction,
      ctyBonusSale: projects.ctyBonusSale,
      ctyBonusManager: projects.ctyBonusManager,
      paymentDocs: projects.paymentDocs,
      note: projects.note,
      createdAt: projects.createdAt,
      partnerName: partners.name,
    })
    .from(projects)
    .leftJoin(partners, eq(projects.partnerId, partners.id))
    .orderBy(asc(projects.name));

  const allPartners = await db.select().from(partners).orderBy(asc(partners.name));
  const allDepts = await db.select().from(departments).orderBy(asc(departments.name));

  const adjustments = await db
    .select()
    .from(productAdjustments)
    .where(eq(productAdjustments.productId, id))
    .orderBy(desc(productAdjustments.effectiveDate), desc(productAdjustments.id));

  const isSecondary = product.saleType === "secondary";

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/products" className="text-blue-600 hover:underline">
          ← Giao dịch
        </Link>
        <span className="text-slate-400">/</span>
        <Link href={`/products/${id}`} className="text-blue-600 hover:underline font-mono">
          {product.productCode}
        </Link>
        <span className="text-slate-400">/</span>
        <span>Sửa</span>
      </div>
      <h1 className="text-2xl font-bold">Sửa giao dịch</h1>
      <ProductForm
        product={product}
        projects={allProjects}
        partners={allPartners}
        departments={allDepts}
        returnTo={returnTo}
        onSave={async (fd) => {
          "use server";
          await updateProduct(id, fd);
        }}
        onDelete={async () => {
          "use server";
          await deleteProduct(id);
        }}
      />

      {!isSecondary && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                ⚙️ Điều chỉnh thông tin căn
              </h2>
              <div className="text-xs text-slate-500 mt-1">
                Khi CĐT tăng %HH, sửa giá, hoặc đổi phí admin — dùng nút bên phải để giữ
                lịch sử điều chỉnh. Recon cũ vẫn giữ nguyên; recon mới dùng giá trị mới nhất.
              </div>
            </div>
            <AdjustmentDialog
              product={{
                id: product.id,
                pmgBasePrice: Number(product.pmgBasePrice ?? 0),
                pmgRate: Number(product.pmgRate ?? 0),
                adminFee: Number(product.adminFee ?? 0),
              }}
              action={async (fd) => {
                "use server";
                await createProductAdjustment(product.id, fd);
              }}
            />
          </div>

          {adjustments.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-4 text-center border border-dashed border-slate-200 rounded-lg">
              Chưa có lần điều chỉnh nào.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left p-2 whitespace-nowrap">Ngày điều chỉnh</th>
                    <th className="text-left p-2">Các trường thay đổi</th>
                    <th className="text-left p-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((a) => {
                    const changes: string[] = [];
                    if (a.pmgBasePrice != null) changes.push(`Giá tính PMG = ${fmtMoney(a.pmgBasePrice)}`);
                    if (a.pmgRate != null) changes.push(`%PMG_LK = ${fmtPctTight(a.pmgRate)}`);
                    if (a.adminFee != null) changes.push(`Phí admin = ${fmtMoney(a.adminFee)}`);
                    return (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="p-2 whitespace-nowrap font-medium">
                          {fmtDate(a.effectiveDate)}
                        </td>
                        <td className="p-2 text-slate-700">
                          {changes.length > 0 ? changes.join(" · ") : "—"}
                        </td>
                        <td className="p-2 text-slate-500">{a.note ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
