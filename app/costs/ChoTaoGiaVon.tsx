import Link from "next/link";
import { layCanChoGiaVon } from "@/lib/cho-tao-gia-von";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtNgay = (d: string | null) => (d ? d.split("-").reverse().join("/") : "chưa có");

/**
 * Nhắc HR những căn đã nhận tiền từ chủ đầu tư mà chưa lập đối chiếu giá vốn.
 * Đặt ngay đầu trang Giá vốn vì đó là nơi HR vào làm việc hằng ngày.
 */
export default async function ChoTaoGiaVon() {
  const ds = await layCanChoGiaVon();
  if (ds.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Không còn căn nào chờ tạo giá vốn. Mọi khoản tiền đã nhận đều có đối chiếu giá vốn theo sau.
      </div>
    );
  }

  const tongHoaHong = ds.reduce((s, x) => s + x.hoaHongConLai, 0);

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200">
        <div className="font-semibold text-amber-900">
          {ds.length} căn đã nhận tiền, chờ tạo đối chiếu giá vốn
        </div>
        <p className="text-xs text-amber-800 mt-0.5">
          Chủ đầu tư đã chuyển tiền cho những căn này nhưng chưa có đợt giá vốn nào sau đó. Tạo đối
          chiếu giá vốn để chi hoa hồng cho sale và KPI cho quản lý.
          {tongHoaHong > 0 && <> Ước tính còn khoảng {fmt(tongHoaHong)} hoa hồng sale chưa đối chiếu.</>}
        </p>
      </div>
      <div className="overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2">Căn</th>
              <th className="text-left p-2 w-40">NVKD</th>
              <th className="text-left p-2 w-28">Nhận tiền</th>
              <th className="text-right p-2 w-36">Đã thu</th>
              <th className="text-left p-2 w-32">Giá vốn cuối</th>
              <th className="text-right p-2 w-36">HH còn lại</th>
              <th className="p-2 w-32" />
            </tr>
          </thead>
          <tbody>
            {ds.map((x) => (
              <tr key={x.productId} className="border-t hover:bg-amber-50/50">
                <td className="p-2">
                  <Link href={`/products/${x.productId}`} className="font-medium text-blue-600 hover:underline">
                    {x.maCan}
                  </Link>
                  <div className="text-[11px] text-slate-500">{x.duAn}</div>
                </td>
                <td className="p-2 text-slate-600">
                  {x.nvkd}
                  {x.phong && <div className="text-[11px] text-slate-400">{x.phong}</div>}
                </td>
                <td className="p-2 tabular-nums whitespace-nowrap">{fmtNgay(x.ngayThuCuoi)}</td>
                <td className="p-2 text-right tabular-nums">
                  {fmt(x.tienDaThu)}
                  <div className="text-[11px] text-slate-400">{x.soDotDaThu} đợt</div>
                </td>
                <td className="p-2 tabular-nums whitespace-nowrap">
                  <span className={x.soDotGiaVon === 0 ? "text-red-700 font-medium" : "text-slate-600"}>
                    {fmtNgay(x.ngayGiaVonCuoi)}
                  </span>
                  <div className="text-[11px] text-slate-400">{x.soDotGiaVon} đợt</div>
                </td>
                <td className="p-2 text-right tabular-nums">
                  {x.hoaHongConLai > 0 ? fmt(x.hoaHongConLai) : ""}
                </td>
                <td className="p-2 text-right">
                  <Link
                    href={`/costs/new?productId=${x.productId}`}
                    className="inline-block bg-orange-500 text-white text-xs px-3 py-1.5 rounded-md hover:bg-orange-600 whitespace-nowrap"
                  >
                    Tạo giá vốn
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
