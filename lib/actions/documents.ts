"use server";

import { requirePermission, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { documents, integrations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/audit";
import { chay, chayCoKetQua, type KetQuaLuu } from "@/lib/actions/ket-qua";
import { isDocType, MAX_UPLOAD_BYTES, fmtDungLuong, type CauHinhDrive } from "@/lib/documents-core";
import { cookies, headers } from "next/headers";
import { randomBytes } from "crypto";
import { daKhaiBaoUngDung, duongDanDangNhap, giaiMa, lamMoiVe } from "@/lib/google-drive";
import { dayBanSaoLenDrive } from "@/lib/day-len-drive";

const BUCKET = "tai-lieu";

/**
 * Ghi nhận một tài liệu vừa được trình duyệt tải thẳng lên kho.
 *
 * Trình duyệt tải thẳng lên Supabase Storage chứ không đi qua máy chủ, vì lệnh server
 * của Next.js giới hạn dung lượng gói tin và file scan có thể tới hàng chục MB.
 * Hàm này chỉ ghi phần mô tả, và dọn file trong kho nếu ghi không được.
 */
async function _ghiNhanTaiLieu(input: {
  storagePath: string;
  docType: string;
  title: string;
  note?: string | null;
  period?: string | null;
  mimeType: string;
  sizeBytes: number;
  originalSizeBytes?: number | null;
  compressed?: boolean;
  productId?: number | null;
  partnerId?: number | null;
  invoiceId?: number | null;
  employeeId?: number | null;
}) {
  await requirePermission("documents", "edit");
  const user = await getCurrentUser();
  if (!user) throw new Error("Phiên đăng nhập đã hết hạn, tải lại trang rồi đăng nhập lại.");

  if (!isDocType(input.docType)) throw new Error("Loại tài liệu không hợp lệ, chọn lại từ danh sách.");
  if (!input.title.trim()) throw new Error("Nhập tên tài liệu.");
  if (!input.storagePath) throw new Error("Chưa tải được file lên kho, thử lại.");
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error(`File nặng ${fmtDungLuong(input.sizeBytes)}, vượt mức cho phép ${fmtDungLuong(MAX_UPLOAD_BYTES)}.`);
  }

  const supabase = await createClient();
  let idVuaTao: number | null = null;
  try {
    const [row] = await db
      .insert(documents)
      .values({
        docType: input.docType,
        title: input.title.trim(),
        note: input.note?.trim() || null,
        period: input.period?.trim() || null,
        storagePath: input.storagePath,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalSizeBytes: input.originalSizeBytes ?? null,
        compressed: input.compressed ?? false,
        productId: input.productId ?? null,
        partnerId: input.partnerId ?? null,
        invoiceId: input.invoiceId ?? null,
        employeeId: input.employeeId ?? null,
        uploadedBy: user.email,
      })
      .returning({ id: documents.id });
    idVuaTao = row.id;

    await logActivity({
      entityType: "document",
      entityId: row.id,
      action: "create",
      after: { ...input } as Record<string, unknown>,
      summary: `Tải lên tài liệu "${input.title.trim()}" (${fmtDungLuong(input.sizeBytes)})`,
    });
  } catch (e) {
    // Ghi mô tả hỏng thì file trong kho thành rác, dọn ngay kẻo chiếm dung lượng.
    await supabase.storage.from(BUCKET).remove([input.storagePath]);
    throw e;
  }

  // Drive là bản sao nên hỏng cũng không chặn việc lưu. Hàm này tự nuốt lỗi.
  if (idVuaTao) await dayBanSaoLenDrive(idVuaTao);

  revalidatePath("/documents");
}

/** Link tải về có hạn 5 phút. Kho để riêng tư nên không có đường dẫn công khai. */
async function _linkTaiVe(id: number): Promise<string> {
  await requirePermission("documents", "view");
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) throw new Error("Không tìm thấy tài liệu này, có thể vừa bị xóa.");

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storagePath, 300, { download: doc.title });
  if (error || !data?.signedUrl) {
    throw new Error("Không tạo được link tải về. Thử lại, nếu vẫn lỗi thì báo quản trị.");
  }
  return data.signedUrl;
}

async function _xoaTaiLieu(id: number) {
  await requirePermission("documents", "delete");
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) throw new Error("Không tìm thấy tài liệu này, có thể vừa bị xóa.");

  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([doc.storagePath]);
  if (error) throw new Error("Không xóa được file trong kho. Thử lại, nếu vẫn lỗi thì báo quản trị.");

  await db.delete(documents).where(eq(documents.id, id));
  await logActivity({
    entityType: "document",
    entityId: id,
    action: "delete",
    before: doc as unknown as Record<string, unknown>,
    summary: `Xóa tài liệu "${doc.title}"`,
  });
  revalidatePath("/documents");
}

/** Bật hoặc tắt một tích hợp. Phần nối Google Drive làm ở đợt sau. */
async function _datTrangThaiTichHop(provider: string, enabled: boolean) {
  await requirePermission("settings.integrations", "edit");
  const user = await getCurrentUser();
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, provider));
  if (!row) throw new Error("Không có tích hợp này trong danh sách.");
  if (enabled && !row.connectedAt) {
    throw new Error("Chưa nối tài khoản nên không bật được. Bấm Kết nối trước đã.");
  }
  await db
    .update(integrations)
    .set({ enabled, updatedAt: new Date(), connectedBy: user?.email ?? row.connectedBy })
    .where(eq(integrations.provider, provider));
  revalidatePath("/settings/integrations");
}

// ── Vỏ bọc: đổi lỗi throw thành câu chữ trả về cho form ──

export async function ghiNhanTaiLieu(input: Parameters<typeof _ghiNhanTaiLieu>[0]): Promise<KetQuaLuu> {
  return chay(() => _ghiNhanTaiLieu(input));
}

export async function linkTaiVe(id: number) {
  return chayCoKetQua(() => _linkTaiVe(id));
}

export async function xoaTaiLieu(id: number): Promise<KetQuaLuu> {
  return chay(() => _xoaTaiLieu(id));
}

export async function datTrangThaiTichHop(provider: string, enabled: boolean): Promise<KetQuaLuu> {
  return chay(() => _datTrangThaiTichHop(provider, enabled));
}

// ── Nối Google Drive ────────────────────────────────────────────────────────

/** Dựng đường dẫn sang Google và đặt cookie state để chống giả mạo lượt quay về. */
async function _batDauNoiDrive(): Promise<string> {
  await requirePermission("settings.integrations", "edit");
  if (!daKhaiBaoUngDung()) {
    throw new Error(
      "Chưa khai báo ứng dụng Google. Cần đặt GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trên Vercel rồi deploy lại.",
    );
  }
  const h = await headers();
  const goc = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const state = randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set("gd_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: goc.startsWith("https"),
    maxAge: 600,
    path: "/",
  });
  return duongDanDangNhap(goc, state);
}

async function _ngatDrive() {
  await requirePermission("settings.integrations", "edit");
  await db
    .update(integrations)
    .set({
      enabled: false,
      secrets: null,
      config: {},
      connectedAt: null,
      connectedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(integrations.provider, "google_drive"));
  revalidatePath("/settings/integrations");
}

export async function batDauNoiDrive() {
  return chayCoKetQua(() => _batDauNoiDrive());
}

export async function ngatDrive(): Promise<KetQuaLuu> {
  return chay(() => _ngatDrive());
}

/**
 * Cấp một vé truy cập ngắn hạn cho cửa sổ chọn thư mục của Google chạy trên trình duyệt.
 *
 * Cửa sổ đó là của Google, chạy phía người dùng, nên bắt buộc phải có vé ở trình duyệt.
 * Vé này sống một tiếng và chỉ mang quyền drive.file, tức chỉ đụng được file của app.
 * Mã làm mới thì vẫn nằm nguyên trên máy chủ, không bao giờ gửi ra ngoài.
 */
async function _veChoCuaSoChon(): Promise<{ token: string; apiKey: string }> {
  await requirePermission("settings.integrations", "edit");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Chưa có khóa API cho cửa sổ chọn thư mục. Cần đặt NEXT_PUBLIC_GOOGLE_API_KEY trên Vercel rồi deploy lại.",
    );
  }
  const [th] = await db.select().from(integrations).where(eq(integrations.provider, "google_drive"));
  const refreshToken = (th?.secrets as { refreshToken?: string } | null)?.refreshToken;
  if (!refreshToken) throw new Error("Chưa nối Google Drive. Bấm Kết nối trước đã.");

  const ve = await lamMoiVe(giaiMa(refreshToken));
  return { token: ve.access_token, apiKey };
}

/**
 * Ghi lại thư mục người dùng vừa chọn.
 * Có docType thì đặt thư mục riêng cho loại đó, không có thì đặt thư mục mặc định
 * dùng chung cho những loại chưa chỉ định.
 */
async function _datThuMucDrive(folderId: string, folderName: string, docType?: string | null) {
  await requirePermission("settings.integrations", "edit");
  if (!folderId.trim()) throw new Error("Chưa chọn thư mục nào.");
  if (docType && !isDocType(docType)) throw new Error("Loại tài liệu không hợp lệ.");

  const [th] = await db.select().from(integrations).where(eq(integrations.provider, "google_drive"));
  if (!th?.connectedAt) throw new Error("Chưa nối Google Drive. Bấm Kết nối trước đã.");

  const cu = (th.config ?? {}) as CauHinhDrive;
  const moi: CauHinhDrive = docType
    ? { ...cu, folders: { ...(cu.folders ?? {}), [docType]: { id: folderId, name: folderName } } }
    : { ...cu, folderId, folderName };

  await db
    .update(integrations)
    .set({ config: moi as Record<string, unknown>, lastError: null, updatedAt: new Date() })
    .where(eq(integrations.provider, "google_drive"));
  revalidatePath("/settings/integrations");
}

/**
 * Bỏ thư mục đã gán.
 * Có docType thì bỏ thư mục riêng của loại đó, loại đó quay về dùng mặc định.
 * Không có docType thì bỏ luôn thư mục mặc định, lúc đó loại nào chưa gán riêng
 * sẽ không được đẩy lên Drive nữa.
 */
async function _boThuMuc(docType?: string | null) {
  await requirePermission("settings.integrations", "edit");
  const [th] = await db.select().from(integrations).where(eq(integrations.provider, "google_drive"));
  if (!th) return;
  const cu = (th.config ?? {}) as CauHinhDrive;

  let moi: CauHinhDrive;
  if (docType) {
    const folders = { ...(cu.folders ?? {}) };
    delete folders[docType as keyof typeof folders];
    moi = { ...cu, folders };
  } else {
    const { folderId: _bo, folderName: _bo2, ...conLai } = cu;
    moi = conLai;
  }

  await db
    .update(integrations)
    .set({ config: moi as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(integrations.provider, "google_drive"));
  revalidatePath("/settings/integrations");
}

export async function veChoCuaSoChon() {
  return chayCoKetQua(() => _veChoCuaSoChon());
}

export async function datThuMucDrive(
  folderId: string,
  folderName: string,
  docType?: string | null,
): Promise<KetQuaLuu> {
  return chay(() => _datThuMucDrive(folderId, folderName, docType));
}

export async function boThuMuc(docType?: string | null): Promise<KetQuaLuu> {
  return chay(() => _boThuMuc(docType));
}
