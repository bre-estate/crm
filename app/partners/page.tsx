import { db } from "@/lib/db";
import { partners } from "@/lib/schema";
import { asc } from "drizzle-orm";
import {
  createPartnerNoRedirect,
  updatePartnerNoRedirect,
  deletePartnerNoRedirect,
} from "@/lib/actions/partners";
import PartnersManager from "./PartnersManager";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const rows = await db.select().from(partners).orderBy(asc(partners.type), asc(partners.name));

  return (
    <PartnersManager
      partners={rows}
      onCreate={async (fd) => {
        "use server";
        await createPartnerNoRedirect(fd);
      }}
      onUpdate={async (id, fd) => {
        "use server";
        await updatePartnerNoRedirect(id, fd);
      }}
      onDelete={async (id) => {
        "use server";
        await deletePartnerNoRedirect(id);
      }}
    />
  );
}
