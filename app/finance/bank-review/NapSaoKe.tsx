"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cauLoi } from "@/lib/actions/ket-qua";
import { baoLoi } from "@/lib/bao-loi";
import { ghiNhanTaiLieu } from "@/lib/actions/documents";
import { napSaoKe, soatSaoKe } from "@/lib/actions/sao-ke";
import { duongDanKho, fmtDungLuong } from "@/lib/documents-core";
import { moCuaSoChonThuMuc } from "@/lib/mo-cua-so-chon";
import type { KetQuaSoat } from "@/lib/sao-ke-core";

const BUCKET = "tai-lieu";
const fmtTien = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("vi-VN"));
const fmtNgay = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export default function NapSaoKe({
  thuMucGoc,
  driveDangBat,
}: {
  /** Thư mục đã gán cho loại Sao kê ở trang Tích hợp. Cửa sổ chọn sẽ mở sẵn bên trong nó. */
  thuMucGoc: { id: string; name: string } | null;
  driveDangBat: boolean;
}) {
  const router = useRouter();
  const [dangChay, start] = useTransition();
  const [buoc, setBuoc] = useState<string | null>(null);
  const [soat, setSoat] = useState<KetQuaSoat | null>(null);
  const [duongDan, setDuongDan] = useState<string | null>(null);
  const [tenFile, setTenFile] = useState<string>("");
  const [thuMuc, setThuMuc] = useState<{ id: string; name: string } | null>(thuMucGoc);
  const inputRef = useRef<HTMLInputElement>(null);

  const datLai = () => {
    setSoat(null);
    setDuongDan(null);
    setTenFile("");
    setBuoc(null);
    setThuMuc(thuMucGoc);
    if (inputRef.current) inputRef.current.value = "";
  };

  const doiThuMuc = () =>
    start(async () => {
      try {
        const f = await moCuaSoChonThuMuc({
          moTrong: thuMucGoc?.id ?? null,
          tieuDe: thuMucGoc
            ? `Chọn thư mục con trong "${thuMucGoc.name}"`
            : "Chọn thư mục để lưu sao kê",
        });
        if (f) setThuMuc(f);
      } catch (e) {
        toast.error(cauLoi(e), { duration: 12000 });
      }
    });

  const chonFile = (f: File | null) => {
    if (!f) return;
    start(async () => {
      try {
        setBuoc("Đang tải file lên kho");
        const path = duongDanKho("sao_ke", f.name);
        const supabase = createClient();
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw new Error(`Không tải lên được kho: ${error.message}`);

        setBuoc("Đang lưu vào kho tài liệu");
        const ghi = await ghiNhanTaiLieu({
          storagePath: path,
          docType: "sao_ke",
          title: f.name.replace(/\.[^.]+$/, ""),
          mimeType: f.type || "application/octet-stream",
          sizeBytes: f.size,
          driveFolderId: thuMuc?.id ?? null,
        });
        if (baoLoi(ghi)) return;

        setBuoc("Đang soát file");
        const kq = await soatSaoKe(path);
        if ("error" in kq) {
          toast.error(kq.error, { duration: 12000 });
          return;
        }
        setSoat(kq.data);
        setDuongDan(path);
        setTenFile(f.name);
      } catch (e) {
        toast.error(cauLoi(e), { duration: 12000 });
      } finally {
        setBuoc(null);
      }
    });
  };

  const nap = () => {
    if (!duongDan) return;
    start(async () => {
      setBuoc("Đang nạp vào sổ");
      const kq = await napSaoKe(duongDan);
      setBuoc(null);
      if ("error" in kq) {
        toast.error(kq.error, { duration: 12000 });
        return;
      }
      toast.success(
        `Đã nạp ${kq.data.daGhi} dòng mới, bỏ qua ${kq.data.boQua} dòng đã có`,
        { duration: 8000 },
      );
      datLai();
      router.refresh();
    });
  };

  const matDong = soat && soat.chuoi.choDut.length > 0 && !soat.chuoi.chiSaiThuTu;
  const hutNoiTiep = soat?.noiTiepDuoc === false;

  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold">Nạp sao kê mới</h2>
        <span className="text-xs text-slate-500">
          File Techcombank xuất ra, dạng .xlsx hoặc .csv. Dòng đã có sẽ tự bỏ qua.
        </span>
      </div>

      {!soat && driveDangBat && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Thư mục trên Drive:</span>
          <span className="font-medium">
            {thuMuc ? thuMuc.name : <span className="text-amber-700">chưa gán, sẽ không đẩy lên Drive</span>}
          </span>
          <Button variant="outline" size="sm" onClick={doiThuMuc} disabled={dangChay}>
            {thuMuc ? "Đổi" : "Chọn"}
          </Button>
          {thuMuc && thuMucGoc && thuMuc.id !== thuMucGoc.id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setThuMuc(thuMucGoc)}
              disabled={dangChay}
              className="text-slate-500"
            >
              Về mặc định
            </Button>
          )}
        </div>
      )}

      {!soat && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={dangChay}
            onChange={(e) => chonFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm hover:file:bg-slate-200"
          />
          {buoc && <span className="text-xs text-slate-500">{buoc}</span>}
        </div>
      )}

      {soat && (
        <div className="space-y-3">
          <div className="text-sm">
            <span className="font-medium">{tenFile}</span>
            <span className="text-slate-500"> · tài khoản {soat.accountNumber}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <O nhan="Khoảng thời gian" giaTri={`${fmtNgay(soat.tuNgay)} → ${fmtNgay(soat.denNgay)}`} />
            <O nhan="Dòng đọc được" giaTri={String(soat.tongDong)} />
            <O nhan="Dòng mới sẽ nạp" giaTri={String(soat.dongMoi)} nhanManh={soat.dongMoi > 0} />
            <O nhan="Đã có, sẽ bỏ qua" giaTri={String(soat.dongTrung)} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <O nhan="Số dư đầu file" giaTri={fmtTien(soat.soDuDau)} />
            <O nhan="Số dư cuối file" giaTri={fmtTien(soat.soDuCuoi)} />
            <O nhan="Chuỗi số dư" giaTri={`${soat.chuoi.soMoiNoi} mối nối, ${soat.chuoi.choDut.length} chỗ lệch`} />
          </div>

          {matDong && (
            <Khung mau="do">
              <b>Chuỗi số dư bị đứt và không bù về 0.</b> Lệch tổng cộng{" "}
              {fmtTien(soat.chuoi.tongLech)} đồng. Nghĩa là file này thiếu giao dịch, không phải sai thứ
              tự. Nhờ admin xuất lại sao kê đủ khoảng {fmtNgay(soat.tuNgay)} đến {fmtNgay(soat.denNgay)}{" "}
              trước khi nạp.
              <ul className="mt-2 space-y-0.5 text-xs">
                {soat.chuoi.choDut.slice(0, 5).map((c) => (
                  <li key={c.viTri}>
                    dòng {c.viTri} ngày {fmtNgay(c.ngay)}: lệch {fmtTien(c.lech)} · {c.dienGiai}
                  </li>
                ))}
                {soat.chuoi.choDut.length > 5 && <li>còn {soat.chuoi.choDut.length - 5} chỗ nữa</li>}
              </ul>
            </Khung>
          )}

          {!matDong && soat.chuoi.choDut.length > 0 && (
            <Khung mau="vang">
              Có {soat.chuoi.choDut.length} chỗ lệch nhưng cộng lại bằng 0, nghĩa là ngân hàng xếp thứ tự
              khác trong cùng một ngày. Không mất giao dịch nào, nạp được bình thường.
            </Khung>
          )}

          {soat.chuoi.choDut.length === 0 && (
            <Khung mau="xanh">Chuỗi số dư liền mạch, không thiếu giao dịch nào.</Khung>
          )}

          {hutNoiTiep && (
            <Khung mau="do">
              <b>Không nối tiếp được phần đã có.</b> Số dư đầu file lệch {fmtTien(soat.chenhNoiTiep)} đồng
              so với số dư cuối của sao kê đang có trong app. Nhiều khả năng còn một quãng chưa nạp nằm
              giữa hai phần. Nạp tiếp sẽ làm số dư trong báo cáo sai.
            </Khung>
          )}

          {soat.noiTiepDuoc === true && (
            <Khung mau="xanh">Nối tiếp đúng sao kê đang có trong app, số dư khớp.</Khung>
          )}

          {soat.dongMoi === 0 && (
            <Khung mau="vang">
              Mọi dòng trong file đều đã có trong app. Không có gì để nạp thêm, nhưng file vẫn được lưu
              vào kho tài liệu.
            </Khung>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={nap} disabled={dangChay || soat.dongMoi === 0 || matDong || hutNoiTiep}>
              {dangChay ? (buoc ?? "Đang xử lý") : `Nạp ${soat.dongMoi} dòng`}
            </Button>
            <Button variant="outline" onClick={datLai} disabled={dangChay}>
              Chọn file khác
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function O({ nhan, giaTri, nhanManh }: { nhan: string; giaTri: string; nhanManh?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{nhan}</div>
      <div className={`tabular-nums mt-0.5 ${nhanManh ? "text-lg font-semibold" : "text-sm"}`}>{giaTri}</div>
    </div>
  );
}

function Khung({ mau, children }: { mau: "do" | "vang" | "xanh"; children: React.ReactNode }) {
  const cls = {
    do: "text-red-800 bg-red-50 border-red-200",
    vang: "text-amber-800 bg-amber-50 border-amber-200",
    xanh: "text-green-800 bg-green-50 border-green-200",
  }[mau];
  return <div className={`text-sm border rounded-lg p-3 ${cls}`}>{children}</div>;
}
