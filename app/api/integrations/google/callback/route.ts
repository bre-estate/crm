import { NextResponse, type NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { integrations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, quyenCua } from "@/lib/auth";
import {
  doiMaLayVe,
  emailNguoiCapQuyen,
  maHoa,
  taoThuMuc,
  TEN_THU_MUC,
} from "@/lib/google-drive";

export const dynamic = "force-dynamic";

const COOKIE_STATE = "gd_state";

function ve(goc: string, thongBao: string, loi = false) {
  const u = new URL("/settings/integrations", goc);
  u.searchParams.set(loi ? "loi" : "ok", thongBao);
  return NextResponse.redirect(u);
}

/**
 * Google gọi về đây sau khi người dùng cấp quyền.
 * Đổi mã lấy vé, tạo thư mục riêng của app, cất mã làm mới đã mã hóa.
 */
export async function GET(req: NextRequest) {
  const h = await headers();
  const goc = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const user = await getCurrentUser();
  if (!user || !quyenCua(user, "admin.integrations", "edit")) {
    return ve(goc, "Bạn không có quyền nối dịch vụ ngoài.", true);
  }

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) {
    return ve(goc, "Bạn đã bấm từ chối ở màn hình Google nên chưa kết nối được.", true);
  }

  // So state với cookie để chắc chắn lượt quay về này xuất phát từ nút Kết nối của mình.
  const store = await cookies();
  const stateCookie = store.get(COOKIE_STATE)?.value;
  const state = sp.get("state");
  if (!state || !stateCookie || state !== stateCookie) {
    return ve(goc, "Phiên kết nối không khớp. Bấm Kết nối lại từ đầu.", true);
  }
  store.delete(COOKIE_STATE);

  const code = sp.get("code");
  if (!code) return ve(goc, "Google không trả về mã cấp quyền. Thử lại.", true);

  try {
    const veGoogle = await doiMaLayVe(goc, code);
    if (!veGoogle.refresh_token) {
      return ve(
        goc,
        "Google không cấp mã làm mới. Vào myaccount.google.com, mục Quyền truy cập của bên thứ ba, gỡ BRE CRM ra rồi kết nối lại.",
        true,
      );
    }

    const email = await emailNguoiCapQuyen(veGoogle.access_token);
    const thuMuc = await taoThuMuc(veGoogle.access_token, TEN_THU_MUC);

    await db
      .update(integrations)
      .set({
        enabled: true,
        config: { folderId: thuMuc.id, folderName: thuMuc.name, accountEmail: email },
        secrets: { refreshToken: maHoa(veGoogle.refresh_token) },
        connectedBy: user.email,
        connectedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrations.provider, "google_drive"));

    return ve(goc, `Đã nối Google Drive bằng ${email ?? "tài khoản vừa chọn"}.`);
  } catch (e) {
    const cau = e instanceof Error ? e.message : "Lỗi không rõ";
    await db
      .update(integrations)
      .set({ lastError: cau, updatedAt: new Date() })
      .where(eq(integrations.provider, "google_drive"));
    return ve(goc, cau, true);
  }
}
