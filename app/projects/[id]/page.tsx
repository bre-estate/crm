import { db } from "@/lib/db";
import { projects, partners, products } from "@/lib/schema";
import { eq, asc, count, sql, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProjectForm from "../ProjectForm";
import { updateProject, deleteProject, refreshProjectFromBatdongsan } from "@/lib/actions/projects";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  const allPartners = await db.select().from(partners).orderBy(asc(partners.name));
  const [productCount] = await db
    .select({ c: count() })
    .from(products)
    .where(eq(products.projectId, id));

  // Aggregate rate stats from products (căn chốt) — %PMG latest do BRE quyết định per căn
  const [rateStats] = await db
    .select({
      soldCount: sql<number>`count(*) filter (where deposit_date is not null)::int`,
      avgPmg: sql<number>`avg(pmg_rate) filter (where deposit_date is not null and pmg_rate is not null)::float8`,
      minPmg: sql<number>`min(pmg_rate) filter (where deposit_date is not null and pmg_rate is not null)::float8`,
      maxPmg: sql<number>`max(pmg_rate) filter (where deposit_date is not null and pmg_rate is not null)::float8`,
      latestPmg: sql<number>`(array_agg(pmg_rate order by deposit_date desc nulls last, id desc))[1]::float8`,
      latestSaleRate: sql<number>`(array_agg(pmg_sale_rate order by deposit_date desc nulls last, id desc))[1]::float8`,
      latestDate: sql<string>`(array_agg(deposit_date order by deposit_date desc nulls last, id desc))[1]::text`,
    })
    .from(products)
    .where(eq(products.projectId, id));

  const fmtPct = (n: number | null | undefined) =>
    n == null ? "—" : (n * 100).toFixed(2).replace(/\.?0+$/, "") + "%";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/projects" className="text-blue-600 hover:underline">
          ← Dự án
        </Link>
        <span className="text-slate-400">/</span>
        <span>{project.name}</span>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <div className="text-sm text-slate-500">
          {productCount?.c ?? 0} giao dịch ·{" "}
          <Link
            href={`/products?projectId=${id}`}
            className="text-blue-600 hover:underline"
          >
            Xem giao dịch
          </Link>
        </div>
      </div>
      {(rateStats?.soldCount ?? 0) > 0 && (
        <section className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">
            %PMG_LK tổng hợp từ căn đã cọc
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[11px] text-slate-500">Latest (căn mới nhất)</div>
              <div className="text-lg font-bold tabular-nums">{fmtPct(rateStats?.latestPmg)}</div>
              {rateStats?.latestDate && <div className="text-[10px] text-slate-400">cọc {rateStats.latestDate}</div>}
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Trung bình</div>
              <div className="text-lg font-bold tabular-nums">{fmtPct(rateStats?.avgPmg)}</div>
              <div className="text-[10px] text-slate-400">{rateStats?.soldCount} căn</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Khoảng dao động</div>
              <div className="text-sm font-semibold tabular-nums">{fmtPct(rateStats?.minPmg)} - {fmtPct(rateStats?.maxPmg)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Latest sale rate</div>
              <div className="text-lg font-bold tabular-nums">{fmtPct(rateStats?.latestSaleRate)}</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 italic mt-3">
            Rate quản lý per căn. Chỉnh trong <Link href={`/products?projectId=${id}`} className="text-blue-600 hover:underline">phần căn chốt</Link> (Lịch sử %PMG_LK).
          </div>
        </section>
      )}

      <ProjectForm
        project={project}
        partners={allPartners}
        onSave={async (fd) => {
          "use server";
          await updateProject(id, fd);
        }}
        onDelete={async () => {
          "use server";
          await deleteProject(id);
        }}
        onRefreshBatdongsan={async () => {
          "use server";
          const res = await refreshProjectFromBatdongsan(id);
          return { ok: res.ok, message: res.message };
        }}
      />
    </div>
  );
}
