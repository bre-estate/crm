import { db } from "@/lib/db";
import { partners } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import PartnerForm from "../PartnerForm";
import { updatePartner, deletePartner } from "@/lib/actions/partners";

export default async function EditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [partner] = await db.select().from(partners).where(eq(partners.id, id));
  if (!partner) notFound();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/partners" className="text-blue-600 hover:underline">
          ← Đối tác
        </Link>
        <span className="text-slate-400">/</span>
        <span>{partner.name}</span>
      </div>
      <h1 className="text-2xl font-bold">Sửa đối tác</h1>
      <PartnerForm
        partner={partner}
        onSave={async (fd) => {
          "use server";
          await updatePartner(id, fd);
        }}
        onDelete={async () => {
          "use server";
          await deletePartner(id);
        }}
      />
    </div>
  );
}
