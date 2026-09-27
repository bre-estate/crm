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

/**
 * Màu thẻ phòng ban, dùng chung cho MỌI trang.
 *
 * Gán theo thứ tự cây chứ không băm từ tên: băm thì hai phòng dễ trùng màu, mà
 * đổi tên phòng là đổi luôn màu. Gán theo thứ tự thì mỗi phòng một màu riêng,
 * và mọi trang cùng nhận một danh sách phòng nên cùng ra một bảng màu.
 *
 * Trả về map tra được bằng cả id lẫn tên, vì có bảng chỉ còn tên phòng.
 */
/**
 * Bảng màu chọn được cho phòng ban. Khóa lưu xuống cột departments.color,
 * không lưu thẳng lớp CSS để đổi bảng màu sau này không phải sửa dữ liệu.
 *
 * Chuỗi lớp phải viết nguyên văn ở đây thì Tailwind mới sinh CSS cho chúng.
 */
export const MAU_PHONG_CHON: Record<string, { ten: string; lop: string; cham: string }> = {
  // Sắc nhạt: nền rất nhạt, chữ đậm. Hợp với thẻ nhỏ trong bảng dày.
  do: { ten: "Đỏ", lop: "bg-red-100 text-red-700", cham: "bg-red-400" },
  xanh_duong: { ten: "Xanh dương", lop: "bg-blue-100 text-blue-700", cham: "bg-blue-400" },
  xanh_la: { ten: "Xanh lá", lop: "bg-emerald-100 text-emerald-700", cham: "bg-emerald-400" },
  ho_phach: { ten: "Hổ phách", lop: "bg-amber-100 text-amber-800", cham: "bg-amber-400" },
  tim: { ten: "Tím", lop: "bg-violet-100 text-violet-700", cham: "bg-violet-400" },
  xanh_lo: { ten: "Xanh lơ", lop: "bg-cyan-100 text-cyan-700", cham: "bg-cyan-400" },
  cam: { ten: "Cam", lop: "bg-orange-100 text-orange-700", cham: "bg-orange-400" },
  xanh_ngoc: { ten: "Xanh ngọc", lop: "bg-teal-100 text-teal-700", cham: "bg-teal-400" },
  hong_sen: { ten: "Hồng sen", lop: "bg-fuchsia-100 text-fuchsia-700", cham: "bg-fuchsia-400" },
  xanh_non: { ten: "Xanh nõn", lop: "bg-lime-100 text-lime-800", cham: "bg-lime-400" },
  xanh_troi: { ten: "Xanh trời", lop: "bg-sky-100 text-sky-700", cham: "bg-sky-400" },

  // Sắc đậm: nền đậm, chữ trắng. Cùng gam với sắc nhạt cùng tên nhưng nhìn
  // tách hẳn ra, nên một phòng lớn và đội bên trong nó dùng được cùng gam.
  do_dam: { ten: "Đỏ đậm", lop: "bg-red-600 text-white", cham: "bg-red-600" },
  xanh_duong_dam: { ten: "Xanh dương đậm", lop: "bg-blue-600 text-white", cham: "bg-blue-600" },
  xanh_la_dam: { ten: "Xanh lá đậm", lop: "bg-emerald-600 text-white", cham: "bg-emerald-600" },
  ho_phach_dam: { ten: "Hổ phách đậm", lop: "bg-amber-600 text-white", cham: "bg-amber-600" },
  tim_dam: { ten: "Tím đậm", lop: "bg-violet-600 text-white", cham: "bg-violet-600" },
  xanh_lo_dam: { ten: "Xanh lơ đậm", lop: "bg-cyan-700 text-white", cham: "bg-cyan-700" },
  cam_dam: { ten: "Cam đậm", lop: "bg-orange-600 text-white", cham: "bg-orange-600" },
  xanh_ngoc_dam: { ten: "Xanh ngọc đậm", lop: "bg-teal-600 text-white", cham: "bg-teal-600" },
  hong_sen_dam: { ten: "Hồng sen đậm", lop: "bg-fuchsia-600 text-white", cham: "bg-fuchsia-600" },
  xanh_non_dam: { ten: "Xanh nõn đậm", lop: "bg-lime-600 text-white", cham: "bg-lime-600" },
  xanh_troi_dam: { ten: "Xanh trời đậm", lop: "bg-sky-600 text-white", cham: "bg-sky-600" },
};

export const MA_MAU_PHONG = Object.keys(MAU_PHONG_CHON);

/**
 * Phòng chưa tự chọn màu thì nhận màu theo thứ tự cây.
 *
 * Không băm từ tên: băm thì hai phòng dễ trùng màu, mà đổi tên phòng là đổi
 * luôn màu. Không có sắc đỏ trong danh sách tự động vì để riêng cho Ban lãnh
 * đạo, cũng không có hồng đào vì nhìn dễ lẫn với đỏ.
 *
 * Chạy hết sắc nhạt rồi mới sang sắc đậm, nên tới phòng thứ hai mươi mốt mới
 * phải dùng lại màu.
 */
const MAU_TU_DONG = [
  "xanh_duong", "xanh_la", "ho_phach", "tim", "xanh_lo",
  "cam", "xanh_ngoc", "hong_sen", "xanh_non", "xanh_troi",
  "xanh_duong_dam", "xanh_la_dam", "ho_phach_dam", "tim_dam", "xanh_lo_dam",
  "cam_dam", "xanh_ngoc_dam", "hong_sen_dam", "xanh_non_dam", "xanh_troi_dam",
];

/** Màu chỉ định sẵn theo mã phòng, dùng khi phòng chưa tự chọn màu. */
const MAU_MAC_DINH_THEO_MA: Record<string, string> = {
  BLD: "do", // đỏ cho cấp cao nhất
};

export const MAU_PHONG_TRONG = "bg-slate-100 text-slate-600";

/**
 * Màu thẻ của mọi phòng ban, dùng chung cho MỌI trang.
 * Ưu tiên màu phòng tự chọn, không có thì lấy màu mặc định theo mã, không có
 * nữa thì lấy theo thứ tự cây. Trả về map tra được bằng cả id lẫn tên, vì có
 * bảng chỉ còn tên phòng.
 */
export function bangMauPhong(ds: NodePhong[]): Record<string, string> {
  const cay = xepCay(ds);

  /** Màu đã cố định của một phòng: người dùng tự chọn, hoặc mặc định theo mã. */
  const maCoDinh = (node: NodePhong): string | null => {
    if (node.color && MAU_PHONG_CHON[node.color]) return node.color;
    return (node.code && MAU_MAC_DINH_THEO_MA[node.code]) || null;
  };

  // Màu tự động phải né những màu đã bị chiếm, không thì hai phòng trùng màu.
  const daChiem = new Set<string>();
  for (const { node } of cay) {
    const m = maCoDinh(node);
    if (m) daChiem.add(m);
  }
  const conTrong = MAU_TU_DONG.filter((m) => !daChiem.has(m));
  // Chiếm hết bảng rồi thì đành quay vòng lại từ đầu, còn hơn không có màu nào.
  const nguon = conTrong.length > 0 ? conTrong : MAU_TU_DONG;

  const ra: Record<string, string> = {};
  let ke = 0; // chỉ tăng khi thật sự lấy một màu tự động
  for (const { node } of cay) {
    const ma = maCoDinh(node) ?? nguon[ke++ % nguon.length];
    const lop = MAU_PHONG_CHON[ma]?.lop ?? MAU_PHONG_TRONG;
    ra[String(node.id)] = lop;
    ra[node.name] = lop;
  }
  return ra;
}

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
  /** Khóa trong MAU_PHONG_CHON. Để trống thì nhận màu tự động. */
  color?: string | null;
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

/**
 * Id của một phòng cùng mọi đội bên dưới nó.
 *
 * Dùng khi lọc: chọn phòng Kinh doanh thì phải ra cả người của Hồ Gia và 1 Tỷ,
 * chứ không chỉ bốn người gắn thẳng vào phòng cha.
 */
export function nhanhDuoi(id: number, ds: NodePhong[]): Set<number> {
  const ra = new Set<number>([id]);
  let themDuoc = true;
  while (themDuoc) {
    themDuoc = false;
    for (const d of ds) {
      if (d.parentId != null && ra.has(d.parentId) && !ra.has(d.id)) {
        ra.add(d.id);
        themDuoc = true;
      }
    }
  }
  return ra;
}

/**
 * Quy ước hiển thị phòng ban ở các bảng dữ liệu.
 *
 * Một căn hay một người gắn vào đúng một nút trong cây, mà nút đó có thể ở bất
 * kỳ cấp nào: căn của Trọng gắn thẳng vào Kinh doanh vì anh không thuộc đội nào,
 * căn của Bách gắn vào Ban lãnh đạo, còn lại gắn vào đội Hồ Gia hoặc 1 Tỷ.
 *
 * Nên bảng hiện tên của chính nút đó, còn MÀU lấy theo phòng gốc. Cùng màu là
 * cùng một phòng, dù dòng này ghi Hồ Gia còn dòng kia ghi Kinh doanh. Tên đầy
 * đủ để trong tooltip cho ai cần biết chính xác.
 */
export interface TenPhong {
  /** Tên của chính nút đang gắn, ví dụ "Hồ Gia". */
  ten: string;
  /** Tên phòng gốc, dùng để chọn màu, ví dụ "Kinh doanh". */
  goc: string;
  /** Đường đi đầy đủ, ví dụ "Kinh doanh - Hồ Gia". */
  duongDan: string;
}

/**
 * Nhãn cho ô chọn phòng: ghi thẳng đường đi thay vì thụt lề bằng ký tự cây.
 * Ký tự "└" đứng lẻ trong một ô chọn nhìn lạc, mà cũng không cho biết phòng gốc
 * là gì khi ô đã đóng lại và chỉ còn một dòng.
 */
export function nhanPhong(id: number | null, ds: NodePhong[]): string {
  return tenPhong(id, ds)?.duongDan ?? "";
}

export function tenPhong(id: number | null, ds: NodePhong[]): TenPhong | null {
  const nut = ds.find((d) => d.id === id);
  if (!nut) return null;
  const chuoi: string[] = [nut.name];
  let hienTai = nut;
  const daQua = new Set<number>([nut.id]);
  while (hienTai.parentId != null && !daQua.has(hienTai.parentId)) {
    const cha = ds.find((d) => d.id === hienTai.parentId);
    if (!cha) break;
    daQua.add(cha.id);
    chuoi.unshift(cha.name);
    hienTai = cha;
  }
  return { ten: nut.name, goc: chuoi[0], duongDan: chuoi.join(" - ") };
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
