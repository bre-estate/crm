import { db } from "@/lib/db";
import { partners } from "@/lib/schema";
import Link from "next/link";
import ProjectForm from "../ProjectForm";
import { createProject } from "@/lib/actions/projects";
import { asc } from "drizzle-orm";

export default async function NewProjectPage() {
  const allPartners = await db.select().from(partners).orderBy(asc(partners.name));
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/projects" className="text-blue-600 hover:underline">
          ← Dự án
        </Link>
        <span className="text-slate-400">/</span>
        <span>Thêm mới</span>
      </div>
      <h1 className="text-2xl font-bold">Thêm dự án / hợp đồng</h1>
      <ProjectForm partners={allPartners} onSave={createProject} />
    </div>
  );
}
