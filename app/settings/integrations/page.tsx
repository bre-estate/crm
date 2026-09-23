/**
 * Cài đặt ▸ Tích hợp. Nơi nối CRM với dịch vụ ngoài, kiểu cắm thêm phần mở rộng.
 * Hiện mới có Google Drive, dùng để giữ bản sao của kho tài liệu.
 */
import Link from "next/link";
import { db } from "@/lib/db";
import { integrations, documents } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { daKhaiBaoUngDung } from "@/lib/google-drive";
import DriveActions from "./DriveActions";
import ChonThuMuc from "./ChonThuMuc";

export const dynamic = "force-dynamic";

type SP = Promise<{ ok?: string; loi?: string }>;

export default async function IntegrationsPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("settings.integrations", "view");
  const sp = await searchParams;
  const khaiBaoDu = daKhaiBaoUngDung();
  const coKhoaPicker = !!process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  const [drive] = await db
    .select()
    .from(integrations)
    .where(eq(integrations.provider, "google_drive"));

  const [dem] = await db
    .select({
      tong: sql<number>`count(*)::int`,
      coBanSao: sql<number>`count(*) FILTER (WHERE drive_file_id IS NOT NULL)::int`,
    })
    .from(documents);

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/documents" className="text-xs text-blue-600 hover:underline">
          ← Kho tài liệu
        </Link>
        <h1 className="text-2xl font-bold mt-1">Tích hợp</h1>
        <p className="text-sm text-slate-500">
          Nối CRM với dịch vụ ngoài. Mỗi tích hợp bật tắt riêng, tắt đi thì phần còn lại của app vẫn chạy bình thường.
        </p>
      </div>

      {sp.ok && (
        <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">{sp.ok}</p>
      )}
      {sp.loi && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">{sp.loi}</p>
      )}

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Google Drive</h2>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full ${
                  drive?.connectedAt
                    ? drive.enabled
                      ? "bg-green-100 text-green-800"
                      : "bg-slate-100 text-slate-600"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {drive?.connectedAt ? (drive.enabled ? "Đang bật" : "Đã nối, đang tắt") : "Chưa kết nối"}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1 max-w-xl">
              Giữ một bản sao của mọi tài liệu trên Drive công ty. Bản chính vẫn nằm trong app, Drive chỉ
              là nơi để người khác xem bằng mắt và để phòng khi cần bản gốc đầy đủ.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {drive?.connectedAt && coKhoaPicker && (
              <ChonThuMuc tenHienTai={(drive.config as { folderName?: string })?.folderName ?? null} />
            )}
            <DriveActions
              daNoi={!!drive?.connectedAt}
              dangBat={!!drive?.enabled}
              khaiBaoDu={khaiBaoDu}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Dong nhan="Tài liệu trong kho" giaTri={String(dem?.tong ?? 0)} />
          <Dong
            nhan="Tài khoản đang nối"
            giaTri={(drive?.config as { accountEmail?: string })?.accountEmail ?? "chưa nối"}
          />
          <Dong nhan="Đã có bản sao" giaTri={String(dem?.coBanSao ?? 0)} />
          <Dong
            nhan="Thư mục trên Drive"
            giaTri={(drive?.config as { folderName?: string })?.folderName ?? "chưa có"}
          />
          <Dong
            nhan="Lần đồng bộ cuối"
            giaTri={drive?.lastSyncAt ? drive.lastSyncAt.toISOString().slice(0, 10) : "chưa lần nào"}
          />
        </dl>

        {drive?.lastError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            Lần chạy gần nhất báo lỗi: {drive.lastError}
          </p>
        )}

        {!khaiBaoDu && (
        <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
          <p className="font-medium text-slate-800">Còn thiếu gì để bật được</p>
          <p>
            Nút Kết nối chưa dùng được vì chưa khai báo ứng dụng Google. Cần một người có quyền trên tài
            khoản Google của công ty làm ba việc sau, rồi đưa lại hai chuỗi mã cho kỹ thuật:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-slate-600">
            <li>Tạo một dự án trên Google Cloud Console</li>
            <li>Bật Google Drive API cho dự án đó</li>
            <li>Tạo OAuth client loại ứng dụng web, lấy client ID và client secret</li>
          </ol>
          <p>
            Cách nối sẽ là một chiều: app đẩy bản sao lên Drive. App không tự đọc ngược từ Drive về, để
            tránh chuyện đổi tên hay xóa file bên Drive làm hỏng dữ liệu trong app.
          </p>
        </div>
        )}

        {drive?.connectedAt && !coKhoaPicker && (
          <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <p className="font-medium text-slate-800">Muốn trỏ vào thư mục có sẵn trên Shared Drive</p>
            <p>
              Hiện tài liệu đang vào thư mục riêng do app tạo. Muốn chọn một thư mục có sẵn thì cần bật
              thêm trên Google Cloud Console:
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Vào Library, bật <b>Google Picker API</b></li>
              <li>Vào Credentials, tạo <b>API key</b>, giới hạn theo tên miền crm.bre.vn</li>
              <li>Đặt khóa đó lên Vercel với tên <b>NEXT_PUBLIC_GOOGLE_API_KEY</b> rồi deploy lại</li>
            </ol>
            <p>
              Khóa này chạy trên trình duyệt nên không phải bí mật, nhưng vẫn nên giới hạn tên miền để
              người ngoài không mượn được.
            </p>
          </div>
        )}

        {khaiBaoDu && drive?.connectedAt && (
          <p className="text-sm text-slate-600">
            App chỉ đụng được file do chính nó tạo ra, không đọc được phần còn lại trong Drive công ty.
            Đẩy một chiều: tài liệu mới tải lên app sẽ có bản sao trên Drive, còn sửa hay xóa bên Drive
            thì app không biết.
          </p>
        )}
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-5 opacity-60">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Sao lưu định kỳ</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Chưa làm</span>
        </div>
        <p className="text-sm text-slate-600 mt-1 max-w-xl">
          Gói Supabase miễn phí không tự sao lưu và không khôi phục về thời điểm được. Mục này sẽ đổ toàn
          bộ cơ sở dữ liệu ra file định kỳ để có đường lùi khi cần.
        </p>
      </div>
    </div>
  );
}

function Dong({ nhan, giaTri }: { nhan: string; giaTri: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{nhan}</dt>
      <dd className="font-medium">{giaTri}</dd>
    </div>
  );
}
