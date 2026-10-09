import { requirePermission } from "@/lib/auth";
import { soatDuLieu } from "@/lib/soat-du-lieu";
import { db } from "@/lib/db";
import { soatGhiChu } from "@/lib/schema";
import SoatClient from "./SoatClient";

export const dynamic = "force-dynamic";

export default async function SoatDuLieuPage() {
  await requirePermission("reports.soat-du-lieu", "view");
  const [phatHien, ghiChu] = await Promise.all([
    soatDuLieu(),
    db.select().from(soatGhiChu),
  ]);

  const theoMa = Object.fromEntries(
    ghiChu.map((g) => [
      g.maPhatHien,
      {
        trangThai: g.trangThai,
        ghiChu: g.ghiChu ?? "",
        luc: g.updatedAt ? new Date(g.updatedAt).toISOString() : null,
      },
    ]),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Soát dữ liệu</h1>
        <p className="text-sm text-slate-500 mt-1">
          Những căn có doanh thu hoặc giá vốn không khớp trần hợp đồng. Bấm vào
          một dòng để xem đầy đủ phép tính, không phải tự mò. Sửa đúng số thì
          dòng tự biến mất khỏi danh sách.
        </p>
      </div>
      <SoatClient phatHien={phatHien} ghiChu={theoMa} />
    </div>
  );
}
