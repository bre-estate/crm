/**
 * Kho tài liệu: sao kê, hợp đồng, hóa đơn, chính sách.
 * Bản chính nằm ở Supabase Storage (bucket tai-lieu, riêng tư, tải về qua link có hạn 5 phút).
 * Google Drive là bản sao tuỳ chọn, bật ở Cài đặt ▸ Tích hợp.
 */
import Link from "next/link";
import { db } from "@/lib/db";
import { documents, integrations } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { requirePermission, getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import UploadPanel from "./UploadPanel";
import DocumentRow, { type DocRow } from "./DocumentRow";
import { DOC_TYPES, fmtDungLuong, type CauHinhDrive, type DocType } from "@/lib/documents-core";

export const dynamic = "force-dynamic";

/** Gói miễn phí Supabase cho 1 GB. Hiện mức dùng để biết đường liệu. */
const HAN_MUC_KHO = 1024 * 1024 * 1024;

type SP = Promise<{ loai?: string }>;

export default async function DocumentsPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("documents", "view");
  const user = await getCurrentUser();
  const sp = await searchParams;
  const loc = sp.loai && sp.loai in DOC_TYPES ? (sp.loai as DocType) : null;

  const taiLenDuoc = !!user && hasPermission(user.role, user.customPermissions, "documents", "edit");
  const xoaDuoc = !!user && hasPermission(user.role, user.customPermissions, "documents", "delete");

  const rows = await db
    .select()
    .from(documents)
    .orderBy(desc(documents.createdAt));

  const [drive] = await db
    .select()
    .from(integrations)
    .where(eq(integrations.provider, "google_drive"));

  const tongDungLuong = rows.reduce((s, r) => s + Number(r.sizeBytes ?? 0), 0);
  const tietKiem = rows.reduce(
    (s, r) => s + Math.max(0, Number(r.originalSizeBytes ?? 0) - Number(r.sizeBytes ?? 0)),
    0,
  );
  const demTheoLoai = new Map<string, number>();
  for (const r of rows) demTheoLoai.set(r.docType, (demTheoLoai.get(r.docType) ?? 0) + 1);

  const hienThi: DocRow[] = rows
    .filter((r) => !loc || r.docType === loc)
    .map((r) => ({
      id: r.id,
      docType: r.docType,
      title: r.title,
      note: r.note,
      period: r.period,
      sizeBytes: Number(r.sizeBytes ?? 0),
      originalSizeBytes: r.originalSizeBytes == null ? null : Number(r.originalSizeBytes),
      compressed: r.compressed,
      driveUrl: r.driveUrl,
      uploadedBy: r.uploadedBy,
      createdAt: r.createdAt.toISOString().slice(0, 10).split("-").reverse().join("/"),
    }));

  const pill = (on: boolean) =>
    `inline-block px-2.5 py-1 rounded-md text-xs ${on ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kho tài liệu</h1>
          <p className="text-sm text-slate-500">
            Sao kê, hợp đồng, hóa đơn và chính sách của công ty, lưu một chỗ thay vì nằm rải trên máy cá nhân.
          </p>
        </div>
        <Link href="/settings/integrations" className="text-xs text-blue-600 hover:underline">
          Cài đặt ▸ Tích hợp
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Số tài liệu" value={String(rows.length)} />
        <Tile
          label="Dung lượng đang dùng"
          value={fmtDungLuong(tongDungLuong)}
          sub={`${((tongDungLuong / HAN_MUC_KHO) * 100).toFixed(1)}% của 1 GB gói miễn phí`}
        />
        <Tile
          label="Tiết kiệm nhờ nén"
          value={tietKiem > 0 ? fmtDungLuong(tietKiem) : "0"}
          sub={tietKiem > 0 ? "ảnh scan đã hạ độ phân giải" : "chưa có file nào cần nén"}
        />
        <Tile
          label="Google Drive"
          value={drive?.enabled ? "Đang bật" : "Chưa bật"}
          sub={drive?.enabled ? "bản sao đẩy lên Drive" : "bản chính chỉ nằm trong app"}
        />
      </div>

      {taiLenDuoc && (
        <UploadPanel
          driveDangBat={!!drive?.enabled}
          cauHinhDrive={(drive?.config ?? {}) as CauHinhDrive}
        />
      )}

      <div className="flex flex-wrap gap-1">
        <Link href="/documents" className={pill(!loc)}>
          Tất cả ({rows.length})
        </Link>
        {Object.entries(DOC_TYPES).map(([k, v]) => (
          <Link key={k} href={`/documents?loai=${k}`} className={pill(loc === k)}>
            {v} ({demTheoLoai.get(k) ?? 0})
          </Link>
        ))}
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2">Tài liệu</th>
              <th className="text-left p-2 w-40">Loại</th>
              <th className="text-left p-2 w-24">Kỳ</th>
              <th className="text-right p-2 w-32">Dung lượng</th>
              <th className="text-left p-2 w-40">Tải lên</th>
              <th className="text-left p-2 w-28">Bản sao</th>
              <th className="p-2 w-40" />
            </tr>
          </thead>
          <tbody>
            {hienThi.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-slate-500">
                  {rows.length === 0
                    ? "Kho chưa có tài liệu nào. Tải file đầu tiên lên ở khung phía trên."
                    : "Không có tài liệu nào thuộc loại này."}
                </td>
              </tr>
            )}
            {hienThi.map((d) => (
              <DocumentRow key={d.id} doc={d} xoaDuoc={xoaDuoc} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        File để riêng tư, mỗi lần tải về hệ thống cấp một đường dẫn sống 5 phút. Ai được xem, ai được tải
        lên hay xóa thì chỉnh ở <Link href="/admin/users" className="underline">Quản lý user</Link>, mục
        Kho tài liệu.
      </p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
