"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { baoLoi } from "@/lib/bao-loi";
import { cauLoi } from "@/lib/actions/ket-qua";
import { boThuMuc, datThuMucDrive, veChoCuaSoChon } from "@/lib/actions/documents";

/**
 * Mở cửa sổ chọn thư mục của Google, kiểu các app SaaS vẫn làm.
 *
 * Cửa sổ này do Google dựng và chạy trên trình duyệt. Người dùng bấm vào thư mục nào
 * thì Google cấp cho app quyền vào đúng thư mục đó, các thư mục khác vẫn không thấy.
 * Nhờ vậy giữ được quyền hẹp drive.file mà vẫn trỏ được vào thư mục có sẵn.
 */

type PickerDoc = { id: string; name: string };
type PickerData = { action: string; docs?: PickerDoc[] };

interface GoogleApi {
  load: (ten: string, cb: () => void) => void;
  picker: {
    // Kiểu của thư viện Google, khai tối thiểu phần mình dùng.
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (viewId?: string) => DocsView;
    ViewId: { FOLDERS: string; DOCS: string };
    Action: { PICKED: string; CANCEL: string };
    Feature: { SUPPORT_DRIVES: string };
    Response: { ACTION: string; DOCUMENTS: string };
  };
}
interface DocsView {
  setIncludeFolders: (v: boolean) => DocsView;
  setSelectFolderEnabled: (v: boolean) => DocsView;
  setMimeTypes: (v: string) => DocsView;
  setLabel: (v: string) => DocsView;
  setEnableDrives: (v: boolean) => DocsView;
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

declare global {
  interface Window {
    gapi?: GoogleApi;
    google?: { picker?: GoogleApi["picker"] };
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

export default function ChonThuMuc({
  tenHienTai,
  docType,
  nhan,
  coTheBo,
}: {
  tenHienTai: string | null;
  /** Bỏ trống thì đặt thư mục mặc định, có thì đặt riêng cho loại tài liệu đó. */
  docType?: string;
  nhan?: string;
  coTheBo?: boolean;
}) {
  const router = useRouter();
  const [dangChay, start] = useTransition();

  const mo = () =>
    start(async () => {
      try {
        const kq = await veChoCuaSoChon();
        if ("error" in kq) {
          toast.error(kq.error, { duration: 12000 });
          return;
        }
        const { token, apiKey } = kq.data;

        await napScript("https://apis.google.com/js/api.js");
        const gapi = window.gapi;
        if (!gapi) throw new Error("Không tải được thư viện của Google.");
        await new Promise<void>((res) => gapi.load("picker", () => res()));

        const picker = window.google?.picker;
        if (!picker) throw new Error("Không mở được cửa sổ chọn thư mục của Google.");

        const chiThuMuc = "application/vnd.google-apps.folder";
        // Tab duyệt cây thư mục. Ở đây bấm một lần là chọn, hai lần là đi vào.
        const duyet = new picker.DocsView(picker.ViewId.FOLDERS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true)
          .setMimeTypes(chiThuMuc)
          .setEnableDrives(true)
          .setLabel("Duyệt thư mục");
        // Tab tìm theo tên. Trong tab duyệt, kết quả tìm kiếm bấm vào là chui vào trong
        // chứ không chọn được, nên cần thêm tab này để chọn thẳng từ kết quả.
        const timKiem = new picker.DocsView(picker.ViewId.DOCS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true)
          .setMimeTypes(chiThuMuc)
          .setEnableDrives(true)
          .setLabel("Tìm theo tên");

        new picker.PickerBuilder()
          .addView(duyet)
          .addView(timKiem)
          .setOAuthToken(token)
          .setDeveloperKey(apiKey)
          // Không bật cái này thì cửa sổ chỉ thấy My Drive, không thấy Shared Drive của công ty.
          .enableFeature(picker.Feature.SUPPORT_DRIVES)
          .setTitle("Chọn thư mục để lưu tài liệu")
          .setCallback((d: PickerData) => {
            if (d.action !== picker.Action.PICKED) return;
            const f = d.docs?.[0];
            if (!f) return;
            start(async () => {
              if (baoLoi(await datThuMucDrive(f.id, f.name, docType ?? null))) return;
              toast.success(
                docType
                  ? `${nhan ?? "Loại này"} sẽ lưu vào thư mục "${f.name}"`
                  : `Tài liệu chưa chỉ định thư mục riêng sẽ lưu vào "${f.name}"`,
              );
              router.refresh();
            });
          })
          .build()
          .setVisible(true);
      } catch (e) {
        toast.error(cauLoi(e), { duration: 12000 });
      }
    });

  const bo = () =>
    start(async () => {
      if (baoLoi(await boThuMuc(docType ?? null))) return;
      toast.success(
        docType
          ? "Đã bỏ, loại này quay về dùng thư mục mặc định"
          : "Đã bỏ thư mục mặc định. Loại nào chưa gán riêng sẽ không đẩy lên Drive.",
      );
      router.refresh();
    });

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="outline" size={docType ? "sm" : undefined} onClick={mo} disabled={dangChay}>
        {dangChay ? "Đang mở" : tenHienTai ? "Đổi thư mục" : "Chọn thư mục"}
      </Button>
      {coTheBo && tenHienTai && (
        <Button variant="ghost" size="sm" onClick={bo} disabled={dangChay} className="text-slate-500">
          Bỏ
        </Button>
      )}
    </span>
  );
}
