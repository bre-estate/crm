"use client";

import { veChoCuaSoChon } from "@/lib/actions/documents";

/**
 * Mở cửa sổ chọn thư mục của Google.
 *
 * Cửa sổ do Google dựng và chạy trên trình duyệt. Phần duyệt cây chạy bằng quyền của
 * chính người đang đăng nhập nên thấy hết thư mục công ty, còn app chỉ được cấp quyền
 * vào đúng thư mục người dùng bấm chọn. Nhờ vậy giữ được quyền hẹp drive.file.
 *
 * Trả về thư mục đã chọn, hoặc null nếu người dùng đóng cửa sổ.
 */

type PickerDoc = { id: string; name: string };
type PickerData = { action: string; docs?: PickerDoc[] };

interface DocsView {
  setIncludeFolders: (v: boolean) => DocsView;
  setSelectFolderEnabled: (v: boolean) => DocsView;
  setMimeTypes: (v: string) => DocsView;
  setLabel: (v: string) => DocsView;
  setEnableDrives: (v: boolean) => DocsView;
  setParent: (v: string) => DocsView;
}
interface PickerBuilder {
  addView: (v: DocsView) => PickerBuilder;
  setOAuthToken: (t: string) => PickerBuilder;
  setDeveloperKey: (k: string) => PickerBuilder;
  enableFeature: (f: string) => PickerBuilder;
  setTitle: (t: string) => PickerBuilder;
  setCallback: (cb: (d: PickerData) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}
interface PickerNs {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => DocsView;
  ViewId: { FOLDERS: string; DOCS: string };
  Action: { PICKED: string; CANCEL: string };
  Feature: { SUPPORT_DRIVES: string };
}

declare global {
  interface Window {
    gapi?: { load: (ten: string, cb: () => void) => void };
    google?: { picker?: PickerNs };
  }
}

function napScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Không tải được thư viện của Google. Kiểm tra mạng rồi thử lại."));
    document.head.appendChild(s);
  });
}

const CHI_THU_MUC = "application/vnd.google-apps.folder";

export async function moCuaSoChonThuMuc(opts?: {
  /** Mở sẵn bên trong thư mục này, để người dùng chỉ việc chọn thư mục con. */
  moTrong?: string | null;
  tieuDe?: string;
}): Promise<PickerDoc | null> {
  const kq = await veChoCuaSoChon();
  if ("error" in kq) throw new Error(kq.error);
  const { token, apiKey } = kq.data;

  await napScript("https://apis.google.com/js/api.js");
  const gapi = window.gapi;
  if (!gapi) throw new Error("Không tải được thư viện của Google.");
  await new Promise<void>((res) => gapi.load("picker", () => res()));

  const picker = window.google?.picker;
  if (!picker) throw new Error("Không mở được cửa sổ chọn thư mục của Google.");

  // Tab duyệt cây. Bấm một lần là chọn, hai lần là đi vào trong.
  const duyet = new picker.DocsView(picker.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes(CHI_THU_MUC)
    .setEnableDrives(true)
    .setLabel(opts?.moTrong ? "Thư mục con" : "Duyệt thư mục");
  if (opts?.moTrong) duyet.setParent(opts.moTrong);

  // Tab tìm theo tên. Ở tab duyệt, bấm vào kết quả tìm kiếm là chui vào trong
  // chứ không chọn được chính nó, nên cần tab này để chọn thẳng.
  const timKiem = new picker.DocsView(picker.ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes(CHI_THU_MUC)
    .setEnableDrives(true)
    .setLabel("Tìm theo tên");

  return new Promise<PickerDoc | null>((res) => {
    new picker.PickerBuilder()
      .addView(duyet)
      .addView(timKiem)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      // Không bật cái này thì cửa sổ chỉ thấy My Drive, không thấy Shared Drive của công ty.
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setTitle(opts?.tieuDe ?? "Chọn thư mục để lưu tài liệu")
      .setCallback((d: PickerData) => {
        if (d.action === picker.Action.PICKED) res(d.docs?.[0] ?? null);
        else if (d.action === picker.Action.CANCEL) res(null);
      })
      .build()
      .setVisible(true);
  });
}
