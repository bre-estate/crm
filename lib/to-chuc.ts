/**
 * Cơ cấu tổ chức: phòng ban và loại hợp đồng.
 *
 * Hàm thuần, không đụng database, để dùng chung cho cả form lẫn kiểm tra dữ liệu.
 *
 * Danh sách VỊ TRÍ không nằm ở đây nữa mà ở bảng positions, vì vị trí vừa là chức
 * danh trong hồ sơ nhân sự vừa là nơi giữ quyền truy cập, và phải sửa được trong
 * app. Xem lib/vi-tri.ts.
 *
 * Phòng ban có cấp cha con. Nhân viên gắn vào nhánh lá, báo cáo gom được cả hai
 * tầng: từng đội riêng và cộng gộp cả phòng. Thêm đội mới thì thêm một nhánh.
 *
 *   Ban lãnh đạo
 *   Kinh doanh ──── Hồ Gia
 *               └── 1 Tỷ
 *   Khối văn phòng
 *   Marketing ───── Nội dung
 */

/** Mã của bốn phòng gốc. Vị trí gắn vào một trong bốn mã này để form gợi ý. */
export const KHOI = {
  BLD: "Ban lãnh đạo",
  KD: "Kinh doanh",
  VP: "Khối văn phòng",
  MKT: "Marketing",
} as const;

export const LOAI_HOP_DONG = {
  hd_lao_dong: "Hợp đồng lao động",
  hd_dich_vu: "Hợp đồng dịch vụ (CTV)",
} as const;

export type LoaiHopDong = keyof typeof LOAI_HOP_DONG;

export const MA_LOAI_HOP_DONG = Object.keys(LOAI_HOP_DONG) as [LoaiHopDong, ...LoaiHopDong[]];

/**
 * Màu thẻ của vị trí. Suy từ mã chứ không lưu trong database, để thêm vị trí mới
 * là có màu ngay, khỏi phải chọn. Cùng một mã thì luôn ra cùng một màu.
 */
const BANG_MAU = [
  "bg-red-100 text-red-700",
  "bg-orange-100 text-orange-700",
  "bg-blue-100 text-blue-700",
  "bg-yellow-100 text-yellow-700",
  "bg-teal-100 text-teal-700",
  "bg-emerald-100 text-emerald-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-pink-100 text-pink-700",
];

export function mauViTri(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return BANG_MAU[h % BANG_MAU.length];
}

export interface NodePhong {
  id: number;
  name: string;
  code: string | null;
  parentId: number | null;
}

/**
 * Xếp danh sách phòng ban phẳng thành thứ tự cây: phòng cha rồi tới các đội con,
 * kèm độ sâu để thụt lề trong dropdown.
 */
export function xepCay<T extends NodePhong>(ds: T[]): { node: T; sau: number }[] {
  const con = new Map<number | null, T[]>();
  for (const d of ds) {
    const k = d.parentId;
    (con.get(k) ?? con.set(k, []).get(k)!).push(d);
  }
  for (const v of con.values()) v.sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const ra: { node: T; sau: number }[] = [];
  const di = (cha: number | null, sau: number) => {
    for (const n of con.get(cha) ?? []) {
      ra.push({ node: n, sau });
      di(n.id, sau + 1);
    }
  };
  di(null, 0);
  // Phòng có cha đã bị xóa thì vẫn phải hiện, không thì biến mất khỏi dropdown.
  if (ra.length < ds.length) {
    const daCo = new Set(ra.map((x) => x.node.id));
    for (const d of ds) if (!daCo.has(d.id)) ra.push({ node: d, sau: 0 });
  }
  return ra;
}

/** Mã của phòng gốc chứa phòng này, để tra vị trí gợi ý. */
export function maKhoiGoc(id: number | null, ds: NodePhong[]): string | null {
  let hienTai = ds.find((d) => d.id === id) ?? null;
  const daQua = new Set<number>();
  while (hienTai?.parentId != null && !daQua.has(hienTai.id)) {
    daQua.add(hienTai.id);
    const cha = ds.find((d) => d.id === hienTai!.parentId);
    if (!cha) break;
    hienTai = cha;
  }
  return hienTai?.code ?? null;
}
