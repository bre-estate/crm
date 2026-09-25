import Link from "next/link";
import { layCanChoGiaVon } from "@/lib/cho-tao-gia-von";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtNgay = (d: string | null) => (d ? d.split("-").reverse().join("/") : "chưa có");

/**
 * Nhắc kế toán và nhân sự: chủ đầu tư đã chuyển tiền cho những căn này, tới lượt lập
 * đối chiếu giá vốn. Mỗi căn hiện bảng kiểm các loại đang cấu hình, loại nào chưa tạo
 * đợt nào thì tô đỏ, để biết còn phải làm gì chứ không phải mở từng căn ra dò.
 */
export default async function ChoTaoGiaVon() {
  const ds = await layCanChoGiaVon();
  if (ds.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Không còn căn nào chờ tạo giá vốn. Mọi căn đã nhận tiền đều có đủ các loại giá vốn.
      </div>
    );
  }

  const moiVe = ds.filter((x) => x.tienMoiVe);

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200">
        <div className="font-semibold text-amber-900">
          {ds.length} căn cần tạo đối chiếu giá vốn
          {moiVe.length > 0 && <span className="font-normal"> · {moiVe.length} căn vừa nhận tiền</span>}
        </div>
        <p className="text-xs text-amber-800 mt-0.5">
          Chủ đầu tư đã chuyển tiền cho những căn này. Tạo đủ các loại giá vốn để chi hoa hồng cho sale
          và KPI cho trưởng phòng, admin. Loại tô đỏ là chưa có đợt nào.
        </p>
      </div>
      <div className="overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left p-2 w-44">Căn</th>
              <th className="text-left p-2 w-36">NVKD</th>
              <th className="text-left p-2 w-28">Nhận tiền</th>
              <th className="text-right p-2 w-32">Đã thu</th>
              <th className="text-left p-2">Các loại giá vốn</th>
              <th className="p-2 w-28" />
            </tr>
          </thead>
          <tbody>
            {ds.map((x) => (
              <tr key={x.productId} className="border-t align-top hover:bg-amber-50/40">
                <td className="p-2">
                  <Link href={`/products/${x.productId}`} className="font-medium text-blue-600 hover:underline">
                    {x.maCan}
                  </Link>
                  <div className="text-[11px] text-slate-500">{x.duAn}</div>
                </td>
                <td className="p-2 text-slate-600">{x.nvkd}</td>
                <td className="p-2 tabular-nums whitespace-nowrap">
                  {fmtNgay(x.ngayThuCuoi)}
                  {x.tienMoiVe && (
                    <div className="text-[11px] text-amber-700 font-medium">tiền mới về</div>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">{fmt(x.tienDaThu)}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {x.tatCaLoai.map((l) => (
                      <span
                        key={l.ma}
                        title={`Trần ${fmt(l.tran)} · đã đối chiếu ${fmt(l.daDoiChieu)} qua ${l.soDot} đợt`}
                        className={`text-[11px] px-1.5 py-0.5 rounded ${
                          l.soDot === 0
                            ? "bg-red-100 text-red-800 font-medium"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {l.ten}
                        {l.soDot > 0 && <span className="opacity-60"> {l.soDot}</span>}
                      </span>
                    ))}
                  </div>
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
