"use server";

import { chay, type KetQuaLuu } from "@/lib/actions/ket-qua";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { departments, products, employees } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SAU_TOI_DA, sauCuaPhong } from "@/lib/to-chuc";

/**
 * Cây phòng ban chỉ cho ba cấp: phòng lớn, đội, đội nhỏ trong đội.
 * Đặt một phòng vào chỗ quá sâu thì chặn ngay ở đây chứ không chỉ ẩn nút trên
 * giao diện, vì lệnh còn gọi được từ chỗ khác.
 */
async function soatDoSau(parentId: number | null, tuChon?: { doiPhong: number }) {
  if (parentId == null) return;
  const tatCa = await db
    .select({ id: departments.id, parentId: departments.parentId, name: departments.name, code: departments.code })
    .from(departments);
  const sauCha = sauCuaPhong(parentId, tatCa);
  if (sauCha + 1 > SAU_TOI_DA) {
    throw new Error(
      `Chỉ xếp được ${SAU_TOI_DA + 1} cấp: phòng ban, đội, rồi đội nhỏ trong đội. Chỗ bạn chọn đã là cấp cuối.`,
    );
  }
  // Khi chuyển chỗ, cả nhánh bên dưới cũng bị đẩy xuống theo.
  if (tuChon) {
    const sauNhanh = sauNhanhDuoi(tuChon.doiPhong, tatCa);
    if (sauCha + 1 + sauNhanh > SAU_TOI_DA) {
      throw new Error(
        "Chuyển vào đây thì các đội bên trong bị đẩy xuống quá sâu. Chuyển chúng ra trước.",
      );
    }
  }
}

/** Nhánh dưới một phòng còn sâu thêm mấy cấp nữa. */
function sauNhanhDuoi(
  id: number,
  ds: { id: number; parentId: number | null }[],
  daQua = new Set<number>(),
): number {
  if (daQua.has(id)) return 0;
  daQua.add(id);
  const con = ds.filter((d) => d.parentId === id);
  if (con.length === 0) return 0;
  return 1 + Math.max(...con.map((c) => sauNhanhDuoi(c.id, ds, daQua)));
}

const DeptSchema = z.object({
  code: z.string().trim().min(1, "Mã phòng bắt buộc").max(16),
  name: z.string().trim().min(1, "Tên phòng bắt buộc"),
  leaderName: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  parentId: z.coerce.number().int().nullable().optional(),
});

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = typeof v === "string" ? v : "";
  if (obj.parentId === "" || obj.parentId === "0") obj.parentId = null;
  return obj;
}

async function _createDepartmentNoRedirect(fd: FormData) {
  await requirePermission("departments", "edit");
  const raw = formToObject(fd);
  const data = DeptSchema.parse(raw);
  await soatDoSau(data.parentId ?? null);
  await db.insert(departments).values({
    code: data.code,
    name: data.name,
    leaderName: data.leaderName || null,
    note: data.note || null,
    parentId: data.parentId ?? null,
  });
  revalidatePath("/departments");
}

async function _updateDepartmentNoRedirect(id: number, fd: FormData) {
  await requirePermission("departments", "edit");
  const raw = formToObject(fd);
  const data = DeptSchema.parse(raw);

  await soatDoSau(data.parentId ?? null, { doiPhong: id });

  // Chặn vòng lặp: phòng không được nhận chính nó hay một đội con của nó làm cha,
  // không thì cây phòng ban tự quay vòng và mọi chỗ duyệt cây sẽ treo.
  if (data.parentId != null) {
    if (data.parentId === id) {
      throw new Error("Một phòng ban không thể là cấp trên của chính nó.");
    }
    const tatCa = await db
      .select({ id: departments.id, parentId: departments.parentId, name: departments.name })
      .from(departments);
    let cha = tatCa.find((d) => d.id === data.parentId);
    const daQua = new Set<number>();
    while (cha && !daQua.has(cha.id)) {
      if (cha.id === id) {
        throw new Error("Không đặt được: phòng bạn chọn đang nằm bên dưới phòng này.");
      }
      daQua.add(cha.id);
      cha = cha.parentId == null ? undefined : tatCa.find((d) => d.id === cha!.parentId);
    }
  }

  await db
    .update(departments)
    .set({
      code: data.code,
      name: data.name,
      leaderName: data.leaderName || null,
      note: data.note || null,
      parentId: data.parentId ?? null,
    })
    .where(eq(departments.id, id));
  revalidatePath("/departments");
}

async function _deleteDepartmentNoRedirect(id: number) {
  await requirePermission("departments", "delete");
  // Guard: nếu có căn hoặc NV ref → không xoá
  const [{ prodCount }] = await db
    .select({ prodCount: sql<number>`COUNT(*)::int` })
    .from(products)
    .where(eq(products.departmentId, id));
  const [{ empCount }] = await db
    .select({ empCount: sql<number>`COUNT(*)::int` })
    .from(employees)
    .where(eq(employees.departmentId, id));
  if (Number(prodCount ?? 0) > 0 || Number(empCount ?? 0) > 0) {
    throw new Error(
      `Không xoá được — phòng đang được dùng: ${prodCount} căn + ${empCount} NV. Chuyển họ sang phòng khác trước.`,
    );
  }
  await db.delete(departments).where(eq(departments.id, id));
  revalidatePath("/departments");
}

// ── Vỏ bọc: đổi lỗi throw thành câu chữ trả về cho form ──
export async function createDepartmentNoRedirect(fd: FormData): Promise<KetQuaLuu> {
  return chay(() => _createDepartmentNoRedirect(fd));
}

export async function updateDepartmentNoRedirect(id: number, fd: FormData): Promise<KetQuaLuu> {
  return chay(() => _updateDepartmentNoRedirect(id, fd));
}

export async function deleteDepartmentNoRedirect(id: number): Promise<KetQuaLuu> {
  return chay(() => _deleteDepartmentNoRedirect(id));
}
