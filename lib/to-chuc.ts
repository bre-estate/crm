/**
 * Cơ cấu tổ chức: phòng ban, vị trí, loại hợp đồng.
 *
 * Hàm thuần, không đụng database, để dùng chung cho cả form lẫn kiểm tra dữ liệu.
 *
 * Phòng ban có cấp cha con. Nhân viên gắn vào nhánh lá, báo cáo gom được cả hai
 * tầng: từng đội riêng và cộng gộp cả phòng. Thêm đội mới thì thêm một nhánh,
 * không phải sắp xếp lại gì.
 *
 *   Ban lãnh đạo
 *   Kinh doanh ──── Hồ Gia
 *               └── 1 Tỷ
 *   Khối văn phòng
 *   Marketing ───── Nội dung
 */

/** Mã của bốn phòng gốc. Vị trí gợi ý tra theo mã này. */
export const KHOI = {
  BLD: "Ban lãnh đạo",
  KD: "Kinh doanh",
  VP: "Khối văn phòng",
  MKT: "Marketing",
} as const;

export const VI_TRI = {
  ceo: "CEO",
  tpkd: "TPKD",
  nvkd: "NVKD",
  admin: "Sale Admin",
  hr: "HR",
  accountant: "Kế toán",
  content_writer: "Content Writer",
  video_editor: "Video Editor",
  cameraman: "Cameraman",
} as const;

export type ViTri = keyof typeof VI_TRI;

export const MA_VI_TRI = Object.keys(VI_TRI) as [ViTri, ...ViTri[]];

export const MAU_VI_TRI: Record<ViTri, string> = {
  ceo: "bg-red-100 text-red-700",
  tpkd: "bg-orange-100 text-orange-700",
  nvkd: "bg-blue-100 text-blue-700",
  admin: "bg-yellow-100 text-yellow-700",
  hr: "bg-teal-100 text-teal-700",
  accountant: "bg-emerald-100 text-emerald-700",
  content_writer: "bg-cyan-100 text-cyan-700",
  video_editor: "bg-indigo-100 text-indigo-700",
  cameraman: "bg-violet-100 text-violet-700",
};

/**
 * Vị trí thường gặp của từng phòng gốc, dùng để gợi ý chứ KHÔNG chặn.
 *
 * Không chặn vì dữ liệu thật có những trường hợp hợp lệ mà nằm ngoài bảng này:
 * hai NVKD đứng tên dùm cho CEO đang thuộc Ban lãnh đạo. Chặn cứng thì không
 * sửa được hồ sơ của họ.
 */
export const VI_TRI_GOI_Y: Record<string, ViTri[]> = {
  BLD: ["ceo", "tpkd"],
  KD: ["tpkd", "nvkd"],
  VP: ["hr", "admin", "accountant"],
  MKT: ["content_writer", "video_editor", "cameraman"],
};

export const LOAI_HOP_DONG = {
  hd_lao_dong: "Hợp đồng lao động",
  hd_dich_vu: "Hợp đồng dịch vụ (CTV)",
} as const;

export type LoaiHopDong = keyof typeof LOAI_HOP_DONG;

export const MA_LOAI_HOP_DONG = Object.keys(LOAI_HOP_DONG) as [LoaiHopDong, ...LoaiHopDong[]];

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
