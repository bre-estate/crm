import { db } from "@/lib/db";
import { projects, partners, products } from "@/lib/schema";
import { eq, asc, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProjectForm from "../ProjectForm";
import { updateProject, deleteProject } from "@/lib/actions/projects";

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
    .where(eq(products.projectId, id))
  return (
    <div className="space-y-4 max-w-4xl">
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
      />
    </div>
  );
}
