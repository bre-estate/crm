"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import SearchableSelect from "@/components/SearchableSelect";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { xepCay, congDonCay, nhanPhong, SAU_TOI_DA } from "@/lib/to-chuc";

type Department = {
  id: number;
  code: string;
  name: string;
  leaderName: string | null;
  note: string | null;
  parentId: number | null;
  prodCount: number;
  empCount: number;
};

type TpkdCandidate = { id: number; name: string; position: string };

type Props = {
  departments: Department[];
  tpkdCandidates: TpkdCandidate[];
  viTriLabel: Record<string, string>;
  onCreate: (fd: FormData) => Promise<{ error: string } | void>;
  onUpdate: (id: number, fd: FormData) => Promise<{ error: string } | void>;
  onDelete: (id: number) => Promise<{ error: string } | void>;
};

/** Đang mở hộp thoại để làm gì. */
type DangLam =
  | { kieu: "sua"; phong: Department }
  | { kieu: "themCon"; cha: Department }
  | { kieu: "themGoc" }
  | null;

export default function DepartmentsManager({
  departments,
  tpkdCandidates,
  viTriLabel,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dangLam, setDangLam] = useState<DangLam>(null);

  const cay = xepCay(departments);
  // Con số của phòng cha phải gồm cả các đội bên dưới, không thì phòng Kinh doanh
  // hiện 4 người trong khi hai đội con của nó có 9 người, nhìn vào thấy vô lý.
  const nhanSu = congDonCay(
    departments,
    new Map(departments.map((d) => [d.id, d.empCount])),
  );
  const soCan = congDonCay(
    departments,
    new Map(departments.map((d) => [d.id, d.prodCount])),
  );
  const coCon = new Set(departments.map((d) => d.parentId).filter((x): x is number => x != null));

  const dong = () => setDangLam(null);

  const submit = (fd: FormData) => {
    start(async () => {
      try {
        if (dangLam?.kieu === "sua") {
          if (baoLoi(await onUpdate(dangLam.phong.id, fd))) return;
        } else {
          if (baoLoi(await onCreate(fd))) return;
        }
        dong();
        router.refresh();
        toast.success(dangLam?.kieu === "sua" ? "Đã cập nhật" : "Đã thêm phòng ban");
      } catch (e) {
        toast.error(cauLoi(e));
      }
    });
  };

  const xoa = (d: Department) => {
    if (coCon.has(d.id)) {
      toast.error(`"${d.name}" còn đội bên trong. Xóa hoặc chuyển các đội đó đi trước.`);
      return;
    }
    if (!confirm(`Xóa phòng "${d.name}"?`)) return;
    start(async () => {
      try {
        if (baoLoi(await onDelete(d.id))) return;
        router.refresh();
        toast.success("Đã xóa");
      } catch (err) {
        toast.error(cauLoi(err));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Phòng ban</h1>
          <p className="text-sm text-slate-500 mt-1">
            Số liệu của phòng đã gồm cả các đội bên trong. Gán người vào phòng ở trang{" "}
            <Link href="/employees" className="text-blue-600 hover:underline">
              Nhân viên
            </Link>
            .
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setDangLam({ kieu: "themGoc" })}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          + Thêm phòng
        </Button>
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        <div className="hidden md:flex items-center gap-3 bg-slate-50 border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">
          <div className="flex-1">Phòng ban</div>
          <div className="w-52">Trưởng phòng</div>
          <div className="w-20 text-right">Nhân sự</div>
          <div className="w-24 text-right">Căn đã bán</div>
          <div className="w-44" />
        </div>

        <div className="divide-y divide-slate-100">
          {cay.map(({ node: d, sau }) => {
            const laCha = coCon.has(d.id);
            const tongNguoi = nhanSu.get(d.id) ?? 0;
            const tongCan = soCan.get(d.id) ?? 0;
            return (
              <div
                key={d.id}
                className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-slate-50"
              >
                <div className="flex-1 min-w-52" style={{ paddingLeft: sau * 22 }}>
                  <div className="flex items-center gap-2">
                    {sau > 0 && <span className="text-slate-300 select-none">└</span>}
                    <span className={sau === 0 ? "font-semibold" : "font-medium"}>{d.name}</span>
                    <span className="text-[10px] font-mono text-slate-400">{d.code}</span>
                  </div>
                  {d.note && <div className="text-[11px] text-slate-500 mt-0.5">{d.note}</div>}
                </div>

                <div className="w-52 text-sm text-slate-600">
                  {d.leaderName ?? <span className="text-slate-300">chưa có</span>}
                </div>

                <div className="w-20 text-right text-sm tabular-nums">
                  {tongNguoi}
                  {laCha && d.empCount !== tongNguoi && (
                    <div className="text-[11px] text-slate-400">{d.empCount} trực tiếp</div>
                  )}
                </div>

                <div className="w-24 text-right text-sm tabular-nums">
                  {tongCan}
                  {laCha && d.prodCount !== tongCan && (
                    <div className="text-[11px] text-slate-400">{d.prodCount} trực tiếp</div>
                  )}
                </div>

                <div className="w-44 flex justify-end gap-3 whitespace-nowrap text-sm">
                  {sau < SAU_TOI_DA && (
                    <button
                      type="button"
                      onClick={() => setDangLam({ kieu: "themCon", cha: d })}
                      disabled={pending}
                      className="text-slate-600 hover:underline disabled:opacity-50"
                    >
                      + Thêm đội
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDangLam({ kieu: "sua", phong: d })}
                    disabled={pending}
                    className="text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => xoa(d)}
                    disabled={pending}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}

          {departments.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-500">
              Chưa có phòng ban nào. Bấm Thêm phòng để bắt đầu.
            </div>
          )}
        </div>
      </Card>

      {dangLam && (
        <HopThoai
          dangLam={dangLam}
          departments={departments}
          tpkdCandidates={tpkdCandidates}
          viTriLabel={viTriLabel}
          pending={pending}
          onClose={dong}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function HopThoai({
  dangLam,
  departments,
  tpkdCandidates,
  viTriLabel,
  pending,
  onClose,
  onSubmit,
}: {
  dangLam: NonNullable<DangLam>;
  departments: Department[];
  tpkdCandidates: TpkdCandidate[];
  viTriLabel: Record<string, string>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const sua = dangLam.kieu === "sua" ? dangLam.phong : null;
  const cha =
    dangLam.kieu === "themCon"
      ? dangLam.cha
      : sua?.parentId != null
        ? (departments.find((d) => d.id === sua.parentId) ?? null)
        : null;

  // Khi sửa mới cho đổi phòng cha. Lúc tạo thì chỗ đứng đã rõ từ nút vừa bấm,
  // không bắt người dùng chọn lại từ một danh sách.
  const [chuyenCha, setChuyenCha] = useState(false);

  const tieuDe =
    dangLam.kieu === "sua"
      ? `Sửa ${dangLam.phong.name}`
      : dangLam.kieu === "themCon"
        ? `Thêm đội trong ${dangLam.cha.name}`
        : "Thêm phòng ban";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tieuDe}</DialogTitle>
        </DialogHeader>

        <form action={onSubmit} className="space-y-3">
          {/* Chỗ đứng trong cây, hiện thành câu chữ chứ không phải ô chọn */}
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            {cha ? (
              <>
                <span className="text-slate-500">Nằm trong </span>
                <span className="font-medium">{cha.name}</span>
              </>
            ) : (
              <span className="text-slate-500">Là một phòng lớn, không nằm trong phòng nào</span>
            )}
            {dangLam.kieu === "sua" && (
              <button
                type="button"
                onClick={() => setChuyenCha((v) => !v)}
                className="ml-2 text-xs text-blue-600 hover:underline"
              >
                {chuyenCha ? "Thôi, giữ nguyên" : "Chuyển chỗ"}
              </button>
            )}
          </div>

          {/* Ô chọn phòng cha chỉ hiện khi thật sự cần */}
          {dangLam.kieu === "sua" && chuyenCha ? (
            <Field label="Chuyển vào phòng" full>
              <select name="parentId" defaultValue={sua?.parentId ?? ""} className="input">
                <option value="">Tách ra thành phòng lớn</option>
                {xepCay(departments)
                  .filter(({ node }) => node.id !== sua?.id)
                  .map(({ node }) => (
                    <option key={node.id} value={node.id}>
                      {nhanPhong(node.id, departments)}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <input type="hidden" name="parentId" value={cha?.id ?? ""} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Tên phòng" required>
              <input
                name="name"
                defaultValue={sua?.name ?? ""}
                className="input"
                required
                autoFocus
                placeholder={dangLam.kieu === "themCon" ? "vd: Hồ Gia" : "vd: Kinh doanh"}
              />
            </Field>
            <Field label="Mã phòng" required>
              <input
                name="code"
                defaultValue={sua?.code ?? ""}
                className="input font-mono text-sm"
                maxLength={16}
                required
                placeholder="vd: HoGia"
              />
            </Field>

            <Field label="Trưởng phòng" full>
              <SearchableSelect
                name="leaderName"
                defaultValue={sua?.leaderName ?? ""}
                emptyOption="Chưa có trưởng phòng"
                placeholder="Gõ tên nhân viên..."
                options={tpkdCandidates.map((t) => ({
                  value: t.name,
                  label: t.name,
                  sublabel: viTriLabel[t.position] ?? t.position,
                }))}
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Chọn được bất kỳ ai, không bắt buộc phải đang ở vị trí TPKD.
              </div>
            </Field>

            <Field label="Ghi chú" full>
              <textarea
                name="note"
                defaultValue={sua?.note ?? ""}
                className="input"
                rows={2}
                placeholder="Ghi chú nội bộ về phòng này"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {pending ? "Đang lưu..." : sua ? "Cập nhật" : "Tạo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
