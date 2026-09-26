"use server";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { positions, employees, userPermissions } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { chay, type KetQuaLuu } from "@/lib/actions/ket-qua";
import { actionsFor, RESOURCES, type Action } from "@/lib/permissions";
import { KHOI } from "@/lib/to-chuc";

/**
 * Hai việc tách bạch nhau, nên tách luôn hai lệnh và hai trang:
 *   - Danh mục vị trí: tên, mã, thuộc phòng ban nào. Ở /admin/positions.
 *   - Phân quyền: vị trí đó mở được những trang nào. Ở /admin/permissions.
 */

const MA_HOP_LE = /^[a-z][a-z0-9_]{1,30}$/;

/** Chỉ giữ tài nguyên và hành động có thật, tránh lưu quyền chết vào database. */
function locQuyen(tho: unknown): Record<string, Action[]> {
  const vao = (tho ?? {}) as Record<string, unknown>;
  const ra: Record<string, Action[]> = {};
  for (const [res, acts] of Object.entries(vao)) {
    if (!(res in RESOURCES)) continue;
    const hopLe = actionsFor(res);
    const giu = (Array.isArray(acts) ? acts : []).filter(
      (a): a is Action => typeof a === "string" && hopLe.includes(a as Action),
    );
    if (giu.length) ra[res] = giu;
  }
  return ra;
}

function soatKhoi(khoi: string | null) {
  if (khoi && !(khoi in KHOI)) throw new Error("Phòng ban không hợp lệ, chọn lại từ danh sách.");
}

// ── Danh mục vị trí ──────────────────────────────────────────────────────────

async function _luuThongTin(code: string, label: string, khoi: string | null) {
  await requirePermission("admin.positions", "edit");
  const ten = label.trim();
  if (!ten) throw new Error("Tên vị trí không được để trống.");
  soatKhoi(khoi);
  await db
    .update(positions)
    .set({ label: ten, khoi: khoi || null, updatedAt: new Date() })
    .where(eq(positions.code, code));
  lamMoi();
}

async function _taoMoi(ma: string, label: string, khoi: string | null, chepTu: string | null) {
  await requirePermission("admin.positions", "edit");
  const m = ma.trim().toLowerCase();
  const ten = label.trim();
  if (!ten) throw new Error("Tên vị trí không được để trống.");
  if (!MA_HOP_LE.test(m)) {
    throw new Error(
      "Mã vị trí chỉ gồm chữ thường, số và dấu gạch dưới, bắt đầu bằng chữ, dài 2 tới 31 ký tự.",
    );
  }
  if (m === "owner" || m === "custom") {
    throw new Error("Hai mã owner và custom đã dành cho quyền đặc biệt, chọn mã khác.");
  }
  soatKhoi(khoi);
  const [daCo] = await db.select().from(positions).where(eq(positions.code, m));
  if (daCo) throw new Error(`Mã vị trí "${m}" đã có rồi.`);

  // Chép quyền từ một vị trí sẵn có cho đỡ phải cấp lại từ đầu.
  let quyen: Record<string, Action[]> = {};
  if (chepTu) {
    const [nguon] = await db.select().from(positions).where(eq(positions.code, chepTu));
    if (nguon) quyen = (nguon.permissions as Record<string, Action[]>) ?? {};
  }
  const [{ n }] = (await db.select({ n: sql<number>`coalesce(max(thu_tu), 0)::int` }).from(
    positions,
  )) as [{ n: number }];
  await db
    .insert(positions)
    .values({ code: m, label: ten, khoi: khoi || null, permissions: quyen, thuTu: n + 10 });
  lamMoi();
}

async function _xoa(code: string) {
  await requirePermission("admin.positions", "edit");
  const [vt] = await db.select().from(positions).where(eq(positions.code, code));
  if (!vt) throw new Error("Không tìm thấy vị trí này.");
  if (vt.builtin) {
    throw new Error(`"${vt.label}" là vị trí dựng sẵn nên không xóa được. Sửa thì được.`);
  }

  // Xóa vị trí mà còn người đang giữ thì hồ sơ của họ trỏ vào chỗ trống,
  // còn tài khoản đang mang thì mất sạch quyền. Chặn cả hai.
  const [{ nNhanSu }] = (await db
    .select({ nNhanSu: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.position, code))) as [{ nNhanSu: number }];
  if (nNhanSu > 0) {
    throw new Error(
      `Còn ${nNhanSu} người đang ở vị trí "${vt.label}". Chuyển họ sang vị trí khác rồi hãy xóa.`,
    );
  }
  const [{ nTaiKhoan }] = (await db
    .select({ nTaiKhoan: sql<number>`count(*)::int` })
    .from(userPermissions)
    .where(eq(userPermissions.role, code))) as [{ nTaiKhoan: number }];
  if (nTaiKhoan > 0) {
    throw new Error(
      `Còn ${nTaiKhoan} tài khoản đang mang vị trí "${vt.label}". Đổi vị trí của họ rồi hãy xóa.`,
    );
  }

  await db.delete(positions).where(eq(positions.code, code));
  lamMoi();
}

// ── Phân quyền ───────────────────────────────────────────────────────────────

async function _luuQuyen(code: string, perms: unknown) {
  await requirePermission("admin.permissions", "edit");
  const [vt] = await db.select().from(positions).where(eq(positions.code, code));
  if (!vt) throw new Error("Không tìm thấy vị trí này.");
  await db
    .update(positions)
    .set({ permissions: locQuyen(perms), updatedAt: new Date() })
    .where(eq(positions.code, code));
  lamMoi();
}

function lamMoi() {
  revalidatePath("/admin/positions");
  revalidatePath("/admin/permissions");
  revalidatePath("/admin/users");
  revalidatePath("/employees");
}

// ── Vỏ bọc: đổi lỗi throw thành câu chữ trả về cho form ──────────────────────

export async function luuThongTinViTri(
  code: string,
  label: string,
  khoi: string | null,
): Promise<KetQuaLuu> {
  return chay(() => _luuThongTin(code, label, khoi));
}

export async function taoViTri(
  ma: string,
  label: string,
  khoi: string | null,
  chepTu: string | null,
): Promise<KetQuaLuu> {
  return chay(() => _taoMoi(ma, label, khoi, chepTu));
}

export async function xoaViTri(code: string): Promise<KetQuaLuu> {
  return chay(() => _xoa(code));
}

export async function luuQuyenViTri(
  code: string,
  perms: Record<string, Action[]>,
): Promise<KetQuaLuu> {
  return chay(() => _luuQuyen(code, perms));
}
