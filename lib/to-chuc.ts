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
 *   Hành chính nhân sự
 *   Marketing ───── Nội dung
 */

/** Mã của bốn phòng gốc. Vị trí gắn vào một trong bốn mã này để form gợi ý. */
export const KHOI = {
  BLD: "Ban lãnh đạo",
  KD: "Kinh doanh",
  VP: "Hành chính nhân sự",
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

/**
 * Cộng dồn một con số lên cả nhánh: mỗi phòng nhận số của chính nó cộng số của
 * mọi đội con bên dưới.
 *
 * Cần hàm này vì đếm rời từng phòng cho ra cảnh vô lý: phòng Kinh doanh hiện 4
 * người trong khi hai đội con của nó có 9 người.
 */
export function congDonCay(ds: NodePhong[], rieng: Map<number, number>): Map<number, number> {
  const con = new Map<number, number[]>();
  for (const d of ds) {
    if (d.parentId == null) continue;
    (con.get(d.parentId) ?? con.set(d.parentId, []).get(d.parentId)!).push(d.id);
  }
  const ra = new Map<number, number>();
  const dang = new Set<number>();
  const tinh = (id: number): number => {
    const daCo = ra.get(id);
    if (daCo != null) return daCo;
    // Chặn vòng lặp phòng hờ, dù tầng lưu đã chặn khi đặt phòng cha.
    if (dang.has(id)) return rieng.get(id) ?? 0;
    dang.add(id);
    let tong = rieng.get(id) ?? 0;
    for (const c of con.get(id) ?? []) tong += tinh(c);
    dang.delete(id);
    ra.set(id, tong);
    return tong;
  };
  for (const d of ds) tinh(d.id);
  return ra;
}

/**
 * Độ sâu lớn nhất của một phòng: 0 là phòng lớn, 1 là đội, 2 là đội nhỏ trong đội.
 * Sâu hơn nữa thì bảng thụt lề quá xa và cũng không ai cần tới cấp thứ tư.
 */
export const SAU_TOI_DA = 2;

/** Phòng này đang nằm ở cấp mấy. Phòng lớn là 0. */
export function sauCuaPhong(id: number | null, ds: NodePhong[]): number {
  let sau = 0;
  let hienTai = ds.find((d) => d.id === id) ?? null;
  const daQua = new Set<number>();
  while (hienTai?.parentId != null && !daQua.has(hienTai.id)) {
    daQua.add(hienTai.id);
    const cha = ds.find((d) => d.id === hienTai!.parentId);
    if (!cha) break;
    hienTai = cha;
    sau++;
  }
  return sau;
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
