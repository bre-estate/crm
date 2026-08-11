import { db } from "@/lib/db";
import { projects, partners, products, contracts } from "@/lib/schema";
import { eq, asc, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProjectForm from "../ProjectForm";
import ContractTiersEditor from "./ContractTiersEditor";
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

  const projectContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.projectId, id))
    .orderBy(asc(contracts.partnerName));

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
      {projectContracts.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">Biểu PMG lũy kế theo hợp đồng</h2>
            <p className="text-xs text-slate-500 mt-1">
              Rate BRE thực áp cho sale. Ban đầu copy từ biểu hợp đồng CĐT, admin điều chỉnh theo thực tế BRE quyết định.
              Thay đổi ở đây tác động ngay đến <Link href="/admin/rate-audit" className="text-blue-600 hover:underline">Đối chiếu rate căn</Link>.
            </p>
          </div>
          {projectContracts.map((c) => (
            <ContractTiersEditor key={c.id} contract={c} />
          ))}
        </section>
      )}

      <ProjectForm
        project={project}
        partners={allPartners}
        hasContracts={projectContracts.length > 0}
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
