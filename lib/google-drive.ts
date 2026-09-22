import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Nối CRM với Google Drive theo luồng OAuth, kiểu người dùng bấm Kết nối rồi đăng nhập Google.
 *
 * Gọi thẳng REST API của Google bằng fetch, không thêm thư viện, vì chỉ cần bốn việc:
 * đổi mã lấy vé, làm mới vé, tạo thư mục, tải file lên.
 *
 * Quyền xin là drive.file, tức app chỉ đụng được file do chính nó tạo ra, không đọc
 * được phần còn lại trong Drive công ty.
 */

export const SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export const TEN_THU_MUC = "BRE CRM Tài liệu";

export function daKhaiBaoUngDung(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

function khoaUngDung(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Chưa khai báo ứng dụng Google. Cần đặt GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET rồi deploy lại.",
    );
  }
  return { id, secret };
}

export function duongDanNhanKetQua(goc: string): string {
  return `${goc.replace(/\/$/, "")}/api/integrations/google/callback`;
}

/** Đường dẫn đưa người dùng sang Google để đăng nhập và cấp quyền. */
export function duongDanDangNhap(goc: string, state: string): string {
  const { id } = khoaUngDung();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: duongDanNhanKetQua(goc),
    response_type: "code",
    scope: SCOPE,
    // offline + consent để Google trả mã làm mới, không có thì hết hạn một tiếng là đứt.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

interface VeGoogle {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function goiToken(body: Record<string, string>): Promise<VeGoogle> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = (await res.json()) as VeGoogle & { error?: string; error_description?: string };
  if (!res.ok || data.error) {
    throw new Error(`Google từ chối cấp quyền: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data;
}

export async function doiMaLayVe(goc: string, code: string): Promise<VeGoogle> {
  const { id, secret } = khoaUngDung();
  return goiToken({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: duongDanNhanKetQua(goc),
    grant_type: "authorization_code",
  });
}

export async function lamMoiVe(refreshToken: string): Promise<VeGoogle> {
  const { id, secret } = khoaUngDung();
  return goiToken({
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
    grant_type: "refresh_token",
  });
}

/** Email của tài khoản vừa cấp quyền, để hiện lên trang Tích hợp cho biết đang nối bằng ai. */
export async function emailNguoiCapQuyen(accessToken: string): Promise<string | null> {
  const res = await fetch(`${API}/about?fields=user(emailAddress)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: { emailAddress?: string } };
  return data.user?.emailAddress ?? null;
}

/** Tạo thư mục gốc của app trên Drive. Chỉ gọi lúc kết nối lần đầu. */
export async function taoThuMuc(accessToken: string, ten = TEN_THU_MUC): Promise<{ id: string; name: string }> {
  const res = await fetch(`${API}/files?fields=id,name`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: ten, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!res.ok) throw new Error(`Không tạo được thư mục trên Drive: ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

export interface FileDrive {
  id: string;
  webViewLink: string | null;
}

/** Tải một file lên thư mục của app. Dùng multipart vì file của mình đều nhỏ. */
export async function taiFileLenDrive(
  accessToken: string,
  folderId: string,
  ten: string,
  mime: string,
  noiDung: Buffer,
): Promise<FileDrive> {
  const ranh = `bre-${randomBytes(8).toString("hex")}`;
  const moTa = JSON.stringify({ name: ten, parents: [folderId] });
  const than = Buffer.concat([
    Buffer.from(`--${ranh}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${moTa}\r\n`),
    Buffer.from(`--${ranh}\r\nContent-Type: ${mime}\r\n\r\n`),
    noiDung,
    Buffer.from(`\r\n--${ranh}--\r\n`),
  ]);

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${ranh}`,
    },
    body: new Uint8Array(than),
  });
  if (!res.ok) throw new Error(`Không tải được file lên Drive: ${await res.text()}`);
  const data = (await res.json()) as { id: string; webViewLink?: string };
  return { id: data.id, webViewLink: data.webViewLink ?? null };
}

// ── Cất mã làm mới ──────────────────────────────────────────────────────────
//
// Mã làm mới là thứ cho phép truy cập Drive lâu dài nên không để trần trong database.
// Khóa mã hóa lấy từ chính GOOGLE_CLIENT_SECRET: nó đã là bí mật chỉ máy chủ biết,
// nằm ở biến môi trường chứ không đi theo bản sao lưu database. Đổi client secret thì
// mã cũ đọc không ra và người dùng phải bấm Kết nối lại, đó là hành vi đúng.

function khoaMaHoa(): Buffer {
  const { secret } = khoaUngDung();
  return createHash("sha256").update(`bre-crm-integration:${secret}`).digest();
}

export function maHoa(chuoi: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", khoaMaHoa(), iv);
  const enc = Buffer.concat([c.update(chuoi, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function giaiMa(chuoi: string): string {
  const [iv, tag, enc] = chuoi.split(".");
  if (!iv || !tag || !enc) throw new Error("Mã truy cập Drive đã hỏng, bấm Kết nối lại.");
  const d = createDecipheriv("aes-256-gcm", khoaMaHoa(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}
