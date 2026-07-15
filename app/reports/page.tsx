import { redirect } from "next/navigation";

type SearchParams = Promise<{ year?: string; range?: string }>;

export default async function ReportsIndexPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.year) qs.set("year", sp.year);
  if (sp.range) qs.set("range", sp.range);
  const target = qs.toString() ? `/reports/overview?${qs.toString()}` : "/reports/overview";
  redirect(target);
}
