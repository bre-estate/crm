import Link from "next/link";
import { layCanChoTao } from "@/lib/cho-tao-gia-von";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtNgay = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");

/**
 * Số hiện trên tab "Cần tạo". Tách riêng để bọc Suspense, phần còn lại của trang
 * không phải chờ truy vấn này.
 */
export async function SoCanChoTao() {
  const ds = await layCanChoTao();
  if (ds.length === 0) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-orange-500 text-white text-[11px] font-semibold tabular-nums">
      {ds.length}
    </span>
  );
}

/**
 * Bảng những căn chủ đầu tư đã chuyển tiền mà giá vốn còn dở: hoặc thiếu loại nào đó,
 * hoặc tiền vừa về sau lần lập giá vốn gần nhất. Nhân sự nhìn vào biết còn phải tạo gì
 * cho căn nào, thay vì mở từng căn ra dò.
 */
export default async function ChoTaoGiaVon() {
  const ds = await layCanChoTao();

  if (ds.length === 0) {
    return (
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-10 text-center text-sm text-slate-500">
        Không còn căn nào chờ tạo giá vốn. Mọi căn đã nhận tiền đều đủ các loại đang cấu hình.
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-600">
          <tr>
            <th className="text-left p-2 w-44">Dự án / Căn</th>
            <th className="text-left p-2 w-36">NVKD</th>
            <th className="text-left p-2 w-32">Nhận tiền</th>
            <th className="text-right p-2 w-32">Đã thu</th>
            <th className="text-left p-2">Loại còn thiếu</th>
            <th className="p-2 w-28" />
          </tr>
        </thead>
        <tbody>
          {ds.map((x) => (
            <tr key={x.productId} className="border-t align-top hover:bg-slate-50">
              <td className="p-2">
                <Link
                  href={`/products/${x.productId}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {x.maCan}
                </Link>
                <div className="text-[11px] text-slate-500">{x.duAn}</div>
              </td>
              <td className="p-2 text-slate-600">{x.nvkd}</td>
              <td className="p-2 whitespace-nowrap tabular-nums">
                {fmtNgay(x.ngayThuCuoi)}
                {x.tienMoiVe && (
                  // Ô có whitespace-nowrap nên phải có khối riêng, không thì nhãn
                  // nằm dính ngay sau ngày.
                  <div className="mt-1">
                    <span className="inline-block rounded px-1.5 py-0.5 bg-orange-50 text-orange-700 text-[11px] font-medium ring-1 ring-orange-200">
                      tiền mới về
                    </span>
                  </div>
                )}
              </td>
              <td className="p-2 text-right tabular-nums">{fmt(x.tienDaThu)}</td>
              <td className="p-2">
                {x.chuaTao.length > 0 ? (
                  <span className="text-slate-700">
                    {x.chuaTao.map((l, i) => (
                      <span key={l.ma} title={`Trần ${fmt(l.tran)}`}>
                        {i > 0 && <span className="text-slate-300"> · </span>}
                        {l.ten}
                      </span>
                    ))}
                    <span className="text-slate-400">
                      {" "}
                      ({x.tatCaLoai.length - x.chuaTao.length}/{x.tatCaLoai.length} loại đã có)
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-500">
                    Đủ loại, chỉ còn đối chiếu thêm đợt cho tiền vừa về
                  </span>
                )}
              </td>
              <td className="p-2 text-right">
                <Link
                  href={`/costs/new?productId=${x.productId}`}
                  className="inline-block border border-slate-300 text-slate-700 text-xs px-3 py-1.5 rounded-md hover:bg-slate-100 whitespace-nowrap"
                >
                  Tạo giá vốn
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
