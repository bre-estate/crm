import "server-only";
import { db } from "@/lib/db";
import { documents, integrations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { giaiMa, lamMoiVe, taiFileLenDrive } from "@/lib/google-drive";

const BUCKET = "tai-lieu";

/**
 * Đẩy bản sao một tài liệu lên Google Drive.
 *
 * Cố ý KHÔNG ném lỗi ra ngoài: Drive hỏng thì tài liệu vẫn phải lưu được trong app.
 * Trả về true nếu đẩy xong, false nếu bỏ qua hoặc hỏng, và ghi lý do vào integrations.last_error.
 */
export async function dayBanSaoLenDrive(documentId: number): Promise<boolean> {
  try {
    const [th] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.provider, "google_drive"));
    if (!th?.enabled || !th.secrets || !th.config) return false;

    const refreshToken = (th.secrets as { refreshToken?: string }).refreshToken;
    const folderId = (th.config as { folderId?: string }).folderId;
    if (!refreshToken || !folderId) return false;

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc || doc.driveFileId) return false;

    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(BUCKET).download(doc.storagePath);
    if (error || !data) throw new Error("Không đọc được file trong kho để đẩy lên Drive.");

    const ve = await lamMoiVe(giaiMa(refreshToken));
    const ten = doc.storagePath.split("/").pop() ?? doc.title;
    const f = await taiFileLenDrive(
      ve.access_token,
      folderId,
      ten,
      doc.mimeType,
      Buffer.from(await data.arrayBuffer()),
    );

    await db
      .update(documents)
      .set({ driveFileId: f.id, driveUrl: f.webViewLink, driveSyncedAt: new Date() })
      .where(eq(documents.id, documentId));
    await db
      .update(integrations)
      .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(integrations.provider, "google_drive"));
    return true;
  } catch (e) {
    await db
      .update(integrations)
      .set({
        lastError: e instanceof Error ? e.message.slice(0, 400) : "Lỗi không rõ",
        updatedAt: new Date(),
      })
      .where(eq(integrations.provider, "google_drive"));
    return false;
  }
}
