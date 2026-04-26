import Link from "next/link";
import PartnerForm from "../PartnerForm";
import { createPartner } from "@/lib/actions/partners";

export default function NewPartnerPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/partners" className="text-blue-600 hover:underline">
          ← Đối tác
        </Link>
        <span className="text-slate-400">/</span>
        <span>Thêm mới</span>
      </div>
      <h1 className="text-2xl font-bold">Thêm đối tác</h1>
      <PartnerForm onSave={createPartner} />
    </div>
  );
}
